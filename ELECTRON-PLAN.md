# Electron Desktop Builds — Implementation Plan

Desktop (Electron) builds of the **TMS9918 Editor** and the **VIC-20 Editor**, modelled on
the existing `6502-EMULATOR` project, targeting macOS, Windows and Linux.

This document is the source of truth across agent sessions. **Update the checkboxes and the
"Current Status" section as work progresses.**

The two editors are structurally identical — same stack, same layout, same tooling, same
router and persistence design — so this is one plan with a table of the handful of values
that differ (§5). An identical copy lives in each repo; when a decision changes, change both.

---

## Current Status

- **Active phase:** E2 — the Electron shell. Phase E1 is **complete in both repos**.
- **Last updated:** 2026-08-19
- The technical unknowns that would have shaped the architecture were settled by spikes
  before this plan was written; results and what they rule out are in §3. They are the
  reason §4 can commit to a custom `app://` scheme and to keeping `"type": "module"`.
- **E1 done.** The renderer moved to `src/renderer/` in both repos and every gate is
  green: lint, `vue-tsc --build`, the full unit suite, `npm run build`, `npm run dev` and
  `npm run preview`. `git log --follow` traverses the move. Two things the phase list did
  not anticipate, both now handled:
  - `vitest.config.ts` needs an explicit top-level `root` pointing back at the repo root.
    Merging `vite.web.config.ts` otherwise inherits its `root: src/renderer`, which sends
    `setupFiles: ['./vitest.setup.ts']` looking in the wrong directory.
  - VIC only: `scripts/generate-charset.mjs` writes `src/domain/romCharset.ts`, so its
    `TARGET` (and the path named in `rom/README.md`) moved too, and the two `parked/`
    globs in `tsconfig.app.json` and `eslint.config.ts` needed repointing.
- Neither repo has an Electron dependency yet — that arrives with E2.

---

## 1. Goal

Ship an installable desktop app for each editor:

| Platform | Artifact | Arch |
| --- | --- | --- |
| macOS | `.dmg` (hardened runtime, notarized) | arm64 |
| Windows | NSIS installer | x64 |
| Linux | AppImage + `.deb` | x64 |

Non-negotiables, in priority order:

1. **The GitHub Pages web build keeps working.** Same URL, same deploy workflow, same
   behaviour. The desktop app is an addition, not a migration.
2. **One renderer, two shells.** No forked component tree, no `if (electron)` scattered
   through views. Platform differences live behind small utilities (§ Phase E4).
3. **Every existing gate stays green** — `oxlint`, `eslint`, `vue-tsc --build`, `vitest`.
4. **Existing projects survive.** Whatever a user has in the web app's `localStorage` is
   not the desktop app's storage, but the desktop app's own storage must persist across
   restarts and upgrades (verified — §3.1).

---

## 2. What the reference project gives us

`6502-EMULATOR` is a working three-platform electron-vite app. Inventory of what carries
over, and what changes because these are editors rather than an emulator:

| Reference file | Purpose | Fate here |
| --- | --- | --- |
| `electron.vite.config.ts` | main/preload/renderer build | Adapt: drop node polyfills, keep Vue + Tailwind, add `__APP_VERSION__` |
| `src/main/index.ts` | window, lifecycle, IPC | Rewrite, much smaller — no serial, no storage service, no CLI shim |
| `src/preload/index.ts` + `index.d.ts` | `contextBridge` API | Same shape, tiny surface (§ Phase E2) |
| `src/shared/types.ts` | `IPC` channel constants, shared types | Same pattern |
| `src/main/settings.ts` | JSON settings in `userData` | Reuse verbatim in spirit for window state |
| `vite.web.config.ts` | standalone web build from the same renderer | Adapt — this is what keeps Pages alive |
| `electron-builder.yml` | packaging for 3 platforms | Adapt, minus `asarUnpack`/`npmRebuild` (no native deps) |
| `build/gen-icon.mjs` | `.icns` / `.ico` / `.png` from a master PNG | Adapt to feed off each repo's existing `scripts/generate-icons.mjs` |
| `build/entitlements.mac*.plist` | hardened runtime | Copy as-is |
| `scripts/dist-win.sh` | NSIS build on macOS via Wine | Copy, minus the serialport rebuild dance |
| `scripts/dist-linux.sh` | AppImage/deb via Docker | Copy, rename the module volume per app |
| `.github/workflows/*` | CI with `ELECTRON_SKIP_BINARY_DOWNLOAD` | Borrow the env trick |

What the reference has that we deliberately **do not** want: the locked non-resizable
window (it exists to preserve a 4:3 VDP aspect — the editors are responsive layouts and
should resize), `serialport` and its native-module packaging complications, the CLI shim
and `bin/`, the debug bridge, the boot-from-argv path, and the `embed.html` second entry.

---

## 3. Verified findings

Four spikes were run against Electron 42 (the version installed in `6502-EMULATOR`) before
committing to an architecture. These are measured results, not assumptions.

### 3.1 `localStorage` persists under `file://` — but the origin is shared

A page loaded with `loadFile` reports `origin: "file://"` and its `localStorage` **survives
an app restart**. The catch is the origin: *every* `file://` page shares one bucket. For a
single app with its own `userData` directory that is harmless, but it means the storage is
keyed to the scheme rather than to the app, and nothing about it is namespaced.

**Consequence:** the projects repository (`src/persistence/repository.ts`) needs no redesign
for the desktop build. Its `localStorage` keys work as-is.

### 3.2 `createWebHistory` is broken under `file://` — and fine under a custom scheme

`history.pushState({}, '', '/edit/abc123')` does *not* throw on a `file://` page, which
makes this look survivable. It is not:

- On startup, `location.pathname` is the renderer's full absolute disk path
  (`/…/out/renderer/index.html`), which matches no route in the table.
- After a `pushState`, a reload (⌘R, DevTools, a crash recovery) resolves against
  `file:///edit/abc123`, which does not exist.

A custom **standard** scheme fixes both. Registered via
`protocol.registerSchemesAsPrivileged` + `protocol.handle`, with a handler that falls back
to `index.html` for any extensionless path, the spike confirmed:

- `origin: "app://<host>"` — a real, stable, app-specific origin
- `pushState` to `/edit/abc123` works
- **loading `app://<host>/edit/abc123` cold serves the SPA correctly** — deep links and
  reloads both survive
- `localStorage` works, and is now namespaced to this app's origin rather than to all of
  `file://`

**Consequence — this is the central architectural decision:** the renderer is served over
`app://`, `src/router/index.ts` is **not modified**, and the Electron renderer bundle is
the same code as the web bundle. No hash history, no route-mode branching.

### 3.3 ESM main + ESM preload work — `"type": "module"` stays

Both editors are `"type": "module"`; the reference project is not, which raised the question
of whether adopting the reference's tooling forces dropping it. It does not. Verified on
Electron 42: an ESM `main.js` and an ESM `preload.mjs` using `contextBridge`, with
`contextIsolation: true` and `sandbox: false`, exposed `window.api` and round-tripped an
`ipcRenderer.invoke` successfully.

**Consequence:** no `"type"` change, no CJS island in an otherwise-ESM repo. `sandbox: false`
is required for an ESM preload — acceptable here, and what the reference already runs with.

### 3.4 The build-tool version conflict is real

Both editors are on **Vite 8.1.5**. `electron-vite@5.0.0` (latest stable, and what the
reference uses) declares `vite: ^5 || ^6 || ^7`. `electron-vite@6.0.0-beta.1` (2026-04-12)
declares `^6 || ^7 || ^8`. There is no stable electron-vite that supports Vite 8.

Every other plugin in the chain already allows Vite 8 (`@vitejs/plugin-vue`,
`@tailwindcss/vite`, `vite-plugin-vue-devtools`, `vitest`), so this is the single blocker.
See decision **D1**.

---

## 4. Confirmed decisions

**D1 — Build tool: `electron-vite@6.0.0-beta.1`, with a documented fallback.**
Keeps Vite 8, keeps the reference's tooling model, keeps one config style across all three
repos. It is a beta with no stable successor yet, so Phase E2 opens with a half-hour spike
that either confirms it or falls back. Fallbacks, in order of preference:
  1. Pin both editors to Vite 7 and use `electron-vite@5` (safe; costs a Vite major, and
     every plugin in use supports 7).
  2. Drop electron-vite: plain Vite 8 for the renderer + a small `esbuild` step for
     main/preload + `electron-builder`. Most control, more hand-rolled scripts, diverges
     from the reference.

**D2 — Mirror the reference's directory layout.** `src/main/`, `src/preload/`,
`src/shared/`, `src/renderer/{index.html,public/,src/}`. The churn is mechanical (`git mv`
plus config paths) and the `@/` alias absorbs it — no import in any component changes.
Three repos with one layout is worth a one-commit move.

**D3 — The renderer is served over a custom `app://` scheme in production.** Router,
history mode and `BASE_URL` are untouched. See §3.2. Dev still loads
`ELECTRON_RENDERER_URL` over http.

**D4 — Projects stay in `localStorage` for the initial desktop release.** Verified to
persist (§3.1). Native project *files* — a real File > Open/Save with `.json` on disk, a
recent-files list, "open with" association — are genuinely desirable for a desktop app but
are a product change, not a port. Deferred to §9, to be planned as its own round once the
shell ships.

**D5 — Security posture:** `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: false` (required by D-3.3's ESM preload), `webSecurity` left on, a CSP meta tag in
the renderer HTML, and `setWindowOpenHandler` sending every external URL to the system
browser. The preload surface stays tiny and explicitly typed — no `ipcRenderer` passthrough.

**D6 — The window is resizable**, with a sensible default and a real minimum, and its
size/position persist across launches. The reference's locked window is an emulator
constraint that does not apply.

**D7 — No native dependencies.** Neither editor has one, and the VIC ROM is baked into
`src/domain/romCharset.ts` at generation time rather than read at runtime. So:
`npmRebuild: false`, no `asarUnpack`, no `extraResources`, and `dist-win.sh` needs none of
the reference's serialport bindings juggling.

**D8 — No auto-update** in this round. Distribution is GitHub Releases; matches the
reference.

**D9 — The web build is a first-class target, not an afterthought.** `vite.web.config.ts`
builds the same renderer to `dist/web`, and the Pages workflow is updated in the same phase
that moves the files, so `main` is never left with a broken deploy.

**D10 — Menu items dispatch the existing shortcut actions.** `src/utils/shortcuts.ts` is
already the single source of truth for the keyboard map, with a typed action union. Native
menu items send those same action ids over IPC rather than inventing a parallel command
list, so a menu item and its keyboard shortcut cannot disagree.

---

## 5. Per-app values

Everything that differs between the two repos, in one table. Every other instruction in
this document is identical for both.

| | TMS9918 Editor | VIC-20 Editor |
| --- | --- | --- |
| Repo | `TMS9918-EDITOR` | `VIC-EDITOR` |
| `package.json` `name` | `tms9918-editor` | `vic20-editor` |
| `productName` | `TMS9918 Editor` | `VIC-20 Editor` |
| `appId` | `com.acwright.tms9918editor` | `com.acwright.vic20editor` |
| `desktopName` | `tms9918-editor.desktop` | `vic20-editor.desktop` |
| `app://` host | `app://tms9918/` | `app://vic20/` |
| Docker module volume | `tms9918-editor-linux-modules` | `vic20-editor-linux-modules` |
| Current version | `1.5.0` | `1.0.0` |
| Storage key prefix (unchanged) | `tms9918-editor:` | `vic20-editor:` |

Shared: author `A.C. Wright <acwrightdesign@gmail.com>`, MIT, copyright
`© 2026 A.C. Wright`, macOS category Developer Tools, Linux category `Graphics`.

Window defaults (both): **1280×860**, minimum **1024×700**. Confirm the minimum against the
editor layout at the start of Phase E3 and adjust — the number should be the width below
which the character/screen columns stop being usable, not a guess.

---

## 6. Target layout

After Phase E1 + E2, each repo looks like this. Files marked **new** did not exist before.

```
.
├── build/                          new   electron-builder resources (tracked)
│   ├── entitlements.mac.plist      new
│   ├── entitlements.mac.inherit.plist  new
│   ├── icon.icns / icon.ico / icon.png / icon.iconset/   new (generated)
│   └── icon-master.png             new (1024², generated by scripts/generate-icons.mjs)
├── electron.vite.config.ts         new   main + preload + renderer
├── electron-builder.yml            new
├── vite.web.config.ts              new   web build → dist/web (was vite.config.ts)
├── vitest.config.ts                      now merges vite.web.config.ts
├── tsconfig.json                         references app / node / vitest as today
├── scripts/
│   ├── generate-icons.mjs                extended: also emits build/icon-master.png
│   ├── dist-win.sh                 new
│   └── dist-linux.sh               new
└── src/
    ├── main/                       new
    │   ├── index.ts                      window, app:// protocol, lifecycle, IPC
    │   ├── menu.ts                       native menu → shortcut actions (Phase E3)
    │   ├── windowState.ts                size/position in userData (Phase E3)
    │   └── dialogs.ts                    open/save dialogs (Phase E4)
    ├── preload/
    │   ├── index.ts                new
    │   └── index.d.ts              new   declares window.api
    ├── shared/
    │   ├── ipc.ts                  new   channel constants
    │   └── api.ts                  new   the AppApi type, shared by both sides
    └── renderer/
        ├── index.html                    moved from ./index.html
        ├── public/                       moved from ./public/
        └── src/                          moved from ./src/  (everything, unchanged)
```

`out/` (electron-vite output) and `dist/` (both the web build and electron-builder's
artifacts) are gitignored. `build/` is tracked.

---

## 7. Phases

Six phases. Each is independently shippable and leaves `main` green — no phase depends on
a later one to make the repo work again.

### Phase E1 — Renderer relocation (no Electron yet)

**Goal:** the file move and every config that points at it, with the web build, tests, lint
and type-check all still passing. No Electron dependency is installed in this phase.

- [x] `git mv src src-tmp && mkdir -p src/renderer && git mv src-tmp src/renderer/src`
      (two steps so git records a rename, not a delete/add)
- [x] `git mv index.html src/renderer/index.html`, `git mv public src/renderer/public`
- [x] `git mv env.d.ts src/renderer/env.d.ts` — it belongs with the renderer sources
- [x] Rename `vite.config.ts` → `vite.web.config.ts`; set `root: resolve('src/renderer')`,
      `publicDir: resolve('src/renderer/public')`, `build.outDir: resolve('dist/web')`,
      `emptyOutDir: true`; repoint the `@` alias at `src/renderer/src`; keep the
      `__APP_VERSION__` define and the `VITE_BASE` handling exactly as they are
- [x] `vitest.config.ts`: import `./vite.web.config`; check `test.root` and the
      `setupFiles` path still resolve; `src/**/__tests__` globs become
      `src/renderer/src/**/__tests__`
- [x] `tsconfig.app.json`: `include` → `src/renderer/env.d.ts`, `src/renderer/src/**/*`;
      `paths` `@/*` → `./src/renderer/src/*`; same for `tsconfig.vitest.json`
- [x] `tsconfig.node.json`: add `vite.web.config.*`
- [x] `eslint.config.ts`: the `pluginVitest` block's `files` glob
      (`src/**/__tests__/*` → `src/renderer/src/**/__tests__/*`)
- [x] `package.json` scripts: `dev` → `vite --config vite.web.config.ts`,
      `build-only` → `vite build --config vite.web.config.ts`,
      `preview` → `vite preview --config vite.web.config.ts`. (Phase E2 renames these to
      `dev:web` / `build:web` and gives `dev` to Electron.)
- [x] `.github/workflows/deploy.yml`: the artifact path becomes `dist/web`, and the SPA
      fallback copy becomes `cp dist/web/index.html dist/web/404.html`
- [x] `.gitignore`: add `out/`
- [x] `scripts/generate-icons.mjs`: its `PUBLIC_DIR` constant now points at
      `src/renderer/public`

**Exit criteria:** `npm run lint`, `npm run type-check`, `npm run test:unit -- --run` and
`npm run build` all pass; `npm run preview` serves a working editor; `git log --follow` on a
moved file still shows its history; the deploy workflow succeeds on `main` and the Pages
site is unchanged.

### Phase E2 — The Electron shell boots

**Goal:** `npm run dev` opens a native window running the editor, with routing, persistence
and reloads all working. No menus, no dialogs yet.

- [ ] **Spike first (D1):** install `electron-vite@6.0.0-beta.1` alongside Vite 8 and build
      a hello-world main + the real renderer. If it fails, take fallback 1 (pin Vite 7 +
      `electron-vite@5`) and record the switch here before continuing.
- [ ] Add devDependencies: `electron`, `electron-vite`, `electron-builder`,
      `@electron-toolkit/preload`, `@electron-toolkit/tsconfig`; dependency:
      `@electron-toolkit/utils`
- [ ] `package.json`: `main` field pointing at the built main entry (confirm the extension
      electron-vite emits under `"type": "module"` — `.js` vs `.mjs` — and match it
      exactly); scripts `dev`, `build`, `preview` (Electron) and `dev:web`, `build:web`,
      `preview:web`
- [ ] `electron.vite.config.ts`: `main`/`preload` with `externalizeDepsPlugin()`; `renderer`
      with `root: src/renderer`, the `@` alias, `vue()`, `tailwindcss()`, the
      `__APP_VERSION__` define, and **no** `vue-devtools` plugin
- [ ] `src/shared/ipc.ts` + `src/shared/api.ts` — channel constants and the `AppApi` type
- [ ] `src/preload/index.ts`: expose `window.api` with the v1 surface —
      `app.getVersion()`, `app.platform`, `app.onBeforeQuit(cb)`, `app.saveComplete()`
- [ ] `src/preload/index.d.ts`: `declare global { interface Window { api: AppApi } }`
- [ ] `src/main/index.ts`:
      - `protocol.registerSchemesAsPrivileged` for `app` (standard, secure,
        supportFetchAPI) **before** `whenReady`
      - `protocol.handle('app', …)` serving `out/renderer`, with the extensionless-path →
        `index.html` fallback that makes deep links work (§3.2), and a guard against
        `..` path traversal
      - `createWindow()` per D5/D6; dev loads `process.env.ELECTRON_RENDERER_URL`,
        production loads `app://<host>/`
      - `setWindowOpenHandler` → `shell.openExternal`
      - macOS lifecycle: `window-all-closed` (don't quit on darwin), `activate` (recreate)
      - `electronApp.setAppUserModelId(appId)` and `optimizer.watchWindowShortcuts`
- [ ] **Autosave-before-quit:** intercept `close`, send `APP_BEFORE_QUIT`, and have the
      renderer call the projects store's existing `flushAutosave()` then `api.saveComplete()`.
      Keep the reference's 5-second safety valve so a wedged renderer cannot block a quit.
- [ ] Add a CSP `<meta>` to `src/renderer/index.html` that is satisfiable by both the
      `app://` production load and the Vite dev server
- [ ] `env.d.ts` or a new renderer-side type file references the preload `AppApi`

**Exit criteria:** `npm run dev` opens the editor; create a project, edit it, quit, relaunch
— the project is still there; navigate to `/edit/:id`, hit ⌘R — the same route reloads;
external links open in the system browser; DevTools console is clean; `npm run build &&
npm run preview` runs the same from built output; `npm run build:web` still passes.

### Phase E3 — Native menus, window behaviour, About

**Goal:** it stops feeling like a web page in a frame.

- [ ] `src/main/menu.ts`: a real menu — App (macOS: About, Services, Hide, Quit), File,
      Edit, View, Window, Help
- [ ] Per D10, File/Edit/View items that map to editor behaviour send a shortcut **action
      id** over IPC; the renderer routes it into the same handler table the keyboard map
      already dispatches to. Accelerators are `CmdOrCtrl+…` mirroring `shortcuts.ts`.
- [ ] Menu items whose action is meaningless in the current view or project mode are
      disabled rather than silently inert (the shortcut map is already mode-aware — reuse
      that predicate, don't restate it)
- [ ] Help → "Keyboard shortcuts" opens the existing help sheet; Help → repo link
- [ ] View: reload, toggle DevTools (dev only), zoom in/out/reset, toggle fullscreen
- [ ] `src/main/windowState.ts`: persist size/position/maximized to
      `userData/window-state.json`, modelled on the reference's `SettingsService`
      (synchronous, tiny, defaults on any read failure); restore on launch, clamped to a
      currently-attached display
- [ ] About panel: `app.setAboutPanelOptions` with version, copyright, icon
- [ ] Confirm and set the real minimum window size (§5)
- [ ] Tests: the menu→action mapping is a pure table; assert it covers the action union
      exactly, the same way `shortcuts.spec.ts` holds the README to the key list

**Exit criteria:** every menu item does what it says on all three platforms (or is
correctly disabled); the window reopens where it was left; ⌘Q flushes an unsaved edit
before quitting; no menu item duplicates a shortcut with a different meaning.

### Phase E4 — Native file dialogs

**Goal:** exports and imports use real save/open dialogs instead of the browser's download
folder and hidden file input. **Same call sites** — the branch lives in the utilities.

- [ ] `src/main/dialogs.ts` + IPC: `dialog.showSaveDialog` (writes bytes/text) and
      `dialog.showOpenDialog` (reads a file back), both returning `null` on cancel
- [ ] `src/renderer/src/utils/download.ts`: keep `downloadText` / `downloadBytes` /
      `downloadCanvasPng` signatures identical; add a `window.api`-present branch that
      opens a save dialog with a sensible default filename and the right filter
      (`.asm`, `.bas`, `.bin`, `.png`, `.json`). Callers change not at all.
- [ ] Extract the project-import path from `ProjectManagerView.vue`'s hidden
      `<input type="file">` into a `pickProjectFile()` utility with the same two branches;
      the view calls the utility
- [ ] Remember the last-used export directory in the window-state/settings JSON so the
      second export starts where the first one landed
- [ ] Unit tests for both branches with a stubbed `window.api` — the web path must keep its
      existing coverage

**Exit criteria:** every export in both apps writes through a native dialog on desktop and
still downloads in the browser; importing a project works from both; cancelling a dialog is
a no-op with no error toast.

### Phase E5 — Icons and packaging

**Goal:** installable artifacts on all three platforms.

- [ ] Extend `scripts/generate-icons.mjs` (it already generates the whole icon set
      procedurally from the glyph array, zero-dependency) to also emit a 1024×1024
      `build/icon-master.png`. Preferred over hand-authoring a master bitmap — the icon
      stays generated from one source of truth.
- [ ] `build/gen-icon.mjs`, adapted from the reference: master PNG → `icon.iconset/` →
      `icon.icns` (via `sips` + `iconutil`), `icon.ico` (via ImageMagick `magick`),
      `icon.png` 512². Add an `icons` npm script.
- [ ] Copy `build/entitlements.mac.plist` and `build/entitlements.mac.inherit.plist`
- [ ] `electron-builder.yml` per §5, `files: [out/**/*]`, `directories.buildResources:
      build`, `directories.output: dist`, mac dmg arm64 + hardened runtime + notarize, win
      nsis x64 (non-one-click, changeable install dir), linux AppImage + deb x64,
      `npmRebuild: false`, no `asarUnpack` (D7)
- [ ] Note the `dist/` sharing: the web build writes `dist/web`, electron-builder writes
      `dist/`. The reference lives with this. If builder's cleanup ever eats `dist/web`,
      move builder's output to `release/` — decide on evidence, not pre-emptively.
- [ ] `scripts/dist-win.sh` (Wine, `CSC_IDENTITY_AUTO_DISCOVERY=false`) and
      `scripts/dist-linux.sh` (Docker `electronuserland/builder`, per-app volume name)
- [ ] Scripts: `pack`, `dist:mac`, `dist:win`, `dist:linux`, `dist`
- [ ] Notarization needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` in the
      environment. Ship the first build with `notarize: false` if credentials aren't ready
      — an unnotarized dmg that runs is worth more than a blocked phase; turn it on before
      announcing a download link.

**Exit criteria:** `npm run dist:mac` produces a dmg that installs and launches from
`/Applications` (Gatekeeper-clean if notarizing); `dist:win` produces an installer that
runs under Wine or a VM; `dist:linux` produces an AppImage and a deb that both launch;
all three show the right icon, name and version.

### Phase E6 — CI, release, docs

- [ ] Extend the existing workflow with an Electron build smoke check —
      `npx electron-vite build` with `ELECTRON_SKIP_BINARY_DOWNLOAD: '1'` so CI never pulls
      a 100 MB binary just to prove the main process compiles
- [ ] Confirm the Pages deploy still passes end to end after E1's path changes
- [ ] Release process: build the three artifacts locally (Wine/Docker prerequisites), then
      `gh release create` with the dmg/exe/AppImage/deb attached. A cloud release workflow
      is possible but needs a macOS runner and notarization secrets — out of scope here
      (§9).
- [ ] README: a **Desktop** section — download links, what the desktop build adds over the
      web app, and the from-source build instructions including the Wine/Docker
      prerequisites
- [ ] `CLAUDE.md` (or create one, as the reference has) noting the layout and the two build
      targets, so future sessions don't rediscover §3
- [ ] Version bump + tag in both repos

**Exit criteria:** CI green; a GitHub Release exists with all four artifacts; a reader of
the README can build every target from a clean clone.

---

## 8. Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `electron-vite@6` beta has a defect | Medium | Phase E2 opens with a spike; two documented fallbacks (D1) |
| ESM main entry filename mismatch in `package.json` `main` | Medium | Verified ESM works (§3.3); confirm the emitted extension before writing the field |
| Notarization credentials/profile not ready | Medium | Ship `notarize: false` first (E5), enable before publishing links |
| Wine or Docker missing on the build machine | Medium | Prerequisites documented in the README; both are the reference's existing workflow |
| `app://` handler mis-serves an asset type | Low | Standard scheme + `net.fetch` of a `file://` URL preserves MIME; spike already served HTML and resolved a deep link |
| electron-builder cleaning `dist/` eats `dist/web` | Low | Watch for it in E5; move builder output to `release/` if seen |
| Menu accelerators colliding with renderer key handling | Low | D10 routes both through one action table; the menu test asserts full coverage |

---

## 9. Deferred / future work

Explicitly out of scope for this plan, listed so it's clear they were considered:

- **Native project files** — File > New/Open/Save As against real `.json` files on disk, a
  recent-files menu, `.tms9918`/`.vic20` file associations and "Open With". The most
  valuable desktop-only feature, and a product round of its own (D4).
- **Auto-update** (`electron-updater` + a release feed).
- **A cloud release workflow** — macOS runner, notarization secrets, artifact upload.
- **macOS Intel (x64) and Apple silicon universal builds** — the reference ships arm64 only.
- **Linux arm64**, Snap, Flatpak.
- **Windows code signing** (an unsigned NSIS installer shows a SmartScreen warning).
- **A shared package** for the code these two editors duplicate (`download.ts`,
  `platform.ts`, the whole Electron shell). Worth doing only if a third editor appears —
  and this plan's phases are what would be extracted.
