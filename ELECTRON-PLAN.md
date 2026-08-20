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

- **Status: done and released.** Phases E1–E6 are **complete in both repos**, and
  `v1.6.0` is tagged and published with all four artifacts in each.
- **Last updated:** 2026-08-20
- **TMS only: a product round is folded into this release.** PLAN.md Phase 32 (Round 9 —
  Sprite Picker Views) is built and green on top of E5, so the `v1.6.0` tag E6 creates
  carries both the desktop builds and the sprite picker's three layouts. Verified in the
  packaged app over the DevTools protocol on the same terms as E2–E5: the layout choice
  survives a full reload, `]` keeps the selection in view in the scrolling views, the list
  tells a *blank* slot from an *invisible* one, and 256 slots of 8×8 cost 32 ms to lay out
  as a grid. Nothing in `src/main`, the preload, the menu or the builder config changed —
  it is renderer-only, so the E5 artifacts remain valid apart from the version string.
  The VIC repo has no counterpart round; its `v1.6.0` is the desktop build alone.
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
- **E2 done.** `npm run dev` and `npm run build && npm run preview` both open a native
  window running the editor. Verified in the running app over the DevTools protocol, not
  by inspection: origin is `app://<host>`, `localStorage` survives a full restart, a
  sample project opens at `/edit/<uuid>`, a reload at that route comes back to the same
  route with the project loaded, `window.open` is denied and handed to the system
  browser, an edit made 0 ms before a quit is flushed to storage, and the renderer
  console is clean in both dev and production.
- **D1 is resolved: `electron-vite@6.0.0-beta.1` works with Vite 8.** No fallback needed.
  It is pinned exactly rather than caret-ranged — a silent bump to the next beta of the
  tool this phase rests on is the risk D1 names. It emits `out/main/index.js` (ESM) and
  `out/preload/index.mjs`, which is what `package.json` `main` and `webPreferences.preload`
  are written against.
- **One thing §3.2 did not foresee: electron-vite forces `base: './'` on the renderer.**
  Its preset plugin assigns it in an `enforce: 'pre'` config hook for every production
  build, so a `base` key in our own config is overwritten. Under `app://` that value is
  wrong twice over — and `createWebHistory(import.meta.env.BASE_URL)` given `'./'`
  silently resolves *every* route back to `/`, which is precisely the breakage D3 promised
  to avoid. Fixed where it belongs, in the config: a small unenforced plugin in
  `electron.vite.config.ts` restores `base: '/'` after the preset has run. The router is
  still untouched.
- `@electron-toolkit/preload` was installed and then dropped: its `electronAPI` export is
  the broad `ipcRenderer` passthrough D5 rules out, so nothing imported it.
- **E3 done.** Both apps have a real menu bar, a window that reopens where it was left, and
  an About panel. Verified in the running app by reading the live macOS menu through the
  accessibility API and driving it with real clicks and real keystrokes — not by
  inspection. Labels and enabled state follow the open mode: a TMS sprite project says
  "Fill the sprite" and greys the grid overlay, a multicolor project greys the pattern
  items, and the project list greys everything but New project and Keyboard shortcuts.
  Clicking Edit ▸ Pattern ▸ Invert changes the pattern, Help ▸ Keyboard shortcuts opens the
  help sheet, and ⌘Z steps back exactly one edit. Window bounds survive a ⌘Q, a maximized
  window reopens maximized with its restored size intact, and bounds naming a display that
  is no longer attached are dropped so the window centres.
- **E3 opened on an assumption that turned out to be wrong**, and §3.5 records the
  measurement that replaced it: a menu accelerator does *not* take the key away from the
  renderer. **D11** covers what that costs and what it buys.
- **E4 done.** Every export in both apps writes through a native save sheet on the desktop
  and still downloads in the browser, and a project imports through a native open panel.
  Verified in the running app by driving the real sheets with real keystrokes, not by
  inspection: a save returns the path it wrote and the bytes on disk match exactly
  (`deadbeef`), a sprite-sheet PNG lands as a real 512×512 PNG and a VIC screen as a
  704×736 one, a project exports as `sample-…json` and imports back as a second row in the
  list, and Escape on either sheet writes nothing, raises no error banner and leaves the
  export dialog open. `dialog-state.json` in `userData` shows both directories remembered
  after the first use of each.
- **E5 done.** Both editors package on all three platforms from one `npm run icons` and
  one `npm run dist:*`. Verified against the artifacts, not the config: the macOS dmg is
  signed by *Developer ID Application: Infinite Token LLC*, and wraps a notarized,
  stapled app (`spctl -a` says "accepted / source=Notarized Developer ID",
  `stapler validate` passes on the `.app` — **not** on the dmg, see E6 — and the code
  directory carries the `runtime` flag), and the copy installed from that dmg
  into `/Applications` launches with no Gatekeeper prompt, shows its own icon in the Dock
  at the same size as its neighbours, and opens an About panel with the icon, name,
  version and copyright. The Windows exe carries the right ProductName, version, company
  and copyright, and all seven sizes from `icon.ico` are embedded in it byte for byte. On
  Linux, the deb installs through `apt` with its dependencies resolved and the AppImage's
  squashfs payload unpacks cleanly; **both open a real window titled with the product
  name**, driven under Xvfb in a container and read back with `xdotool`, and both carry
  the right `.desktop` entry (name, `StartupWMClass`, `Categories=Graphics`, the
  description as `Comment`) and a 512² icon.
- **Three E5 findings worth carrying forward** — all written up under the phase: `files`
  had to exclude `node_modules` explicitly (the packaged app was 63 MB of build-time tree
  and two native `.node` binaries otherwise), the deb's dependency list needed ALSA added
  by hand, and the NSIS installer builds under Wine but cannot be *run* there.
- **Three E5 follow-ups, fixed before E6.** The window opened too small for its own
  layout — the character set cut off at launch, and in sprite mode a toolbar wrapping onto
  a second row — the sprite picker had no min-height and crushed itself rather than
  letting the column scroll, and closing the last window left the app running on macOS.
  All three are measured and verified in the running app: a fresh window opens at
  1600×1200 of *content* (§5), where in both editors nothing wraps, nothing scrolls and
  both pickers are worth looking at; `SpritePicker` gained the character set picker's
  `min-h-64` floor; and `window-all-closed` quits on every platform. The autosave flush
  still runs on that path — an edit made a fraction of a second before the window closed
  is on disk after a relaunch.
- **One environment trap worth recording**, because it cost time and looks like an app
  defect: a shell inherited from the VS Code extension host has `ELECTRON_RUN_AS_NODE=1`
  set, which makes the Electron binary run as plain Node. `npm run preview` then dies with
  `The requested module 'electron' does not provide an export named 'BrowserWindow'` — the
  builtin module is never installed, so every ESM import of `electron` resolves to the npm
  shim. Nothing is wrong with the app; run it with `env -u ELECTRON_RUN_AS_NODE`.

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

### 3.5 A menu accelerator fires the menu item *and* still reaches the page

Measured on Electron 43 with a real menu and real keystrokes — via `System Events`, since
`webContents.sendInputEvent` injects straight into the renderer and bypasses the native
menu entirely, so the first attempt at this spike measured nothing at all:

| Menu item | Menu click fires | Renderer `keydown` fires |
| --- | --- | --- |
| `accelerator: 'CmdOrCtrl+S'` | yes | **yes** |
| same, plus `registerAccelerator: false` | **yes** | yes |
| `accelerator: 'CmdOrCtrl+D'`, `enabled: false` | no | yes |

Two things follow. The common belief that an accelerator *consumes* the key is false here,
so an accelerated menu item whose click dispatches an action would run that action **twice**
on every press. And `registerAccelerator: false` — the escape hatch documented for exactly
this case — did not suppress the click either, so it is not the fix.

The third row is the useful one: a **disabled** item is genuinely inert, and lets the key
through untouched.

**Consequence:** D11. Action items carry no accelerator, and the keyboard stays the
renderer's job alone.

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

**D11 — No accelerators on menu items that dispatch an action.**
Forced by §3.5: an accelerator would double-fire the action, and would fire it in the very
contexts the renderer's key handler deliberately skips — while a text field has focus, or
while a dialog is open. So keys are handled in exactly one place, the renderer, identically
on the web and on the desktop, and the menu is a click surface. What this costs is the key
hint beside the menu item, which is why Help ▸ Keyboard shortcuts is the Help menu's first
entry. Items built from Electron *roles* (Copy, Reload, Quit, Toggle Full Screen) keep
their standard accelerators — the editors' map binds none of those keys. One consequence
worth knowing: with a dialog open the keyboard is inert but the menu is not, so Edit ▸ Undo
works there while ⌘Z does nothing.

**D10 — Menu items dispatch the existing shortcut actions.** `src/utils/shortcuts.ts` is
already the single source of truth for the keyboard map, with a typed action union. Native
menu items send those same action ids over IPC rather than inventing a parallel command
list, so a menu item and its keyboard shortcut cannot disagree. Which items are live is
decided the same way: the renderer runs the shortcut map's own mode predicate and sends
main the resulting action ids together with their wording for the open mode, so main
receives the answer and never restates the question. **Menu titles are not the shortcut
descriptions**, though: the help sheet's sentences ("Save now", "Fill the character") are
wrong in a menu, so `src/shared/menu.ts` words items as Title Case menu titles per the
macOS HIG and `menu.spec.ts` checks the capitalisation. Only the handful of items the
shortcut map itself marks as mode-varying may carry a second title, and the test holds
those two lists together.

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
| Left column min-height floor   | sprite picker `min-h-64`       | —                            |
| Current version | `1.5.0` | `1.0.0` |
| Storage key prefix (unchanged) | `tms9918-editor:` | `vic20-editor:` |

Shared: author `A.C. Wright <acwrightdesign@gmail.com>`, MIT, copyright
`© 2026 A.C. Wright`, macOS category Developer Tools, Linux category `Graphics`.

Minimum window size (both): **1024×640** — measured in Phase E3 against both running
layouts, which agree to the pixel. 1024 is the width at which the character and screen
columns stop sitting side by side and collapse into the tab split, the responsive layout
the web build needs on a phone and not something a desktop window should be resizable
into; 640 is the height at which the screen preview drops from 2× to 1×. Nothing overflows
below either number — the layout simply stops being the desktop one.

The **default** size is a different kind of number: **1600×1200** in both apps, and a
*content* size rather than a window size. It is applied with `useContentSize` on a first
launch only — what has to fit is the viewport, and the title bar wrapped around it is
32 px on macOS and something else on Windows and Linux; a saved window is restored as
window bounds, which is what `getNormalBounds` reports. It is clamped to the display's
work area on launch, so a smaller screen gets the largest window it can show rather than
one hanging off the edge.

Both numbers are measured in the running app across every sample, and both are the
requirement plus real headroom rather than the requirement itself — this is the size the
editor is meant to be *used* at:

|                | wraps a toolbar below         | left column clipped below | default     |
| -------------- | ----------------------------- | ------------------------- | ----------- |
| TMS9918 Editor | 1490 (Graphics II screen bar) | 1133 (sprite picker)      | 1600 × 1200 |
| VIC-20 Editor  | 1500 (screen bar)             | 1103 (mixed mode)         | 1600 × 1200 |

Sprite mode drove both TMS numbers and needed a renderer fix of its own: `SpritePicker`
was `min-h-0`, so instead of scrolling the column it squeezed itself to ~124 px — below
the sprite sheet's own `min-h-32` — and the bottom rows of sprites were clipped at any
window size. It now carries the same `min-h-64` floor the character set picker has.

---

## 6. Target layout

After Phase E1 + E2, each repo looks like this. Files marked **new** did not exist before.

```
.
├── build/                          new   electron-builder resources (tracked)
│   ├── entitlements.mac.plist      new
│   ├── entitlements.mac.inherit.plist  new
│   ├── gen-icon.mjs                new   master PNG → icns/ico/png (Phase E5)
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
    │   ├── api.ts                  new   the AppApi type, shared by both sides
    │   └── menu.ts                 new   the menu's action table (Phase E3)
    └── renderer/
        ├── index.html                    moved from ./index.html
        ├── public/                       moved from ./public/
        └── src/                          moved from ./src/  (everything, unchanged)
            ├── utils/menu.ts       new   what the menu offers, read off the shortcut map
            └── utils/upload.ts     new   pick a project file (Phase E4)
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

- [x] **Spike first (D1):** install `electron-vite@6.0.0-beta.1` alongside Vite 8 and build
      a hello-world main + the real renderer. If it fails, take fallback 1 (pin Vite 7 +
      `electron-vite@5`) and record the switch here before continuing.
- [x] Add devDependencies: `electron`, `electron-vite`, `electron-builder`,
      `@electron-toolkit/preload`, `@electron-toolkit/tsconfig`; dependency:
      `@electron-toolkit/utils`
- [x] `package.json`: `main` field pointing at the built main entry (confirm the extension
      electron-vite emits under `"type": "module"` — `.js` vs `.mjs` — and match it
      exactly); scripts `dev`, `build`, `preview` (Electron) and `dev:web`, `build:web`,
      `preview:web`
- [x] `electron.vite.config.ts`: `main`/`preload` with `externalizeDepsPlugin()`; `renderer`
      with `root: src/renderer`, the `@` alias, `vue()`, `tailwindcss()`, the
      `__APP_VERSION__` define, and **no** `vue-devtools` plugin
- [x] `src/shared/ipc.ts` + `src/shared/api.ts` — channel constants and the `AppApi` type
- [x] `src/preload/index.ts`: expose `window.api` with the v1 surface —
      `app.getVersion()`, `app.platform`, `app.onBeforeQuit(cb)`, `app.saveComplete()`
- [x] `src/preload/index.d.ts`: `declare global { interface Window { api: AppApi } }`
- [x] `src/main/index.ts`: - `protocol.registerSchemesAsPrivileged` for `app` (standard, secure,
      supportFetchAPI) **before** `whenReady` - `protocol.handle('app', …)` serving `out/renderer`, with the extensionless-path →
      `index.html` fallback that makes deep links work (§3.2), and a guard against
      `..` path traversal - `createWindow()` per D5/D6; dev loads `process.env.ELECTRON_RENDERER_URL`,
      production loads `app://<host>/` - `setWindowOpenHandler` → `shell.openExternal` - `window-all-closed` → `app.quit()` on every platform, macOS included: one window
      is the whole app, and the platform default would leave a running app with an empty
      menu bar and nothing on screen - `electronApp.setAppUserModelId(appId)` and `optimizer.watchWindowShortcuts`
- [x] **Autosave-before-quit:** intercept `close`, send `APP_BEFORE_QUIT`, and have the
      renderer call the projects store's existing `flushAutosave()` then `api.saveComplete()`.
      Keep the reference's 5-second safety valve so a wedged renderer cannot block a quit.
- [x] Add a CSP `<meta>` to `src/renderer/index.html` that is satisfiable by both the
      `app://` production load and the Vite dev server
- [x] `env.d.ts` or a new renderer-side type file references the preload `AppApi`

**Exit criteria:** `npm run dev` opens the editor; create a project, edit it, quit, relaunch
— the project is still there; navigate to `/edit/:id`, hit ⌘R — the same route reloads;
external links open in the system browser; DevTools console is clean; `npm run build &&
npm run preview` runs the same from built output; `npm run build:web` still passes.

### Phase E3 — Native menus, window behaviour, About

**Goal:** it stops feeling like a web page in a frame.

- [x] `src/main/menu.ts`: a real menu — App (macOS: About, Services, Hide, Quit), File,
      Edit, View, Window, Help
- [x] Per D10, File/Edit/View items that map to editor behaviour send a shortcut **action
      id** over IPC; the renderer routes it into the same handler table the keyboard map
      already dispatches to. **No accelerators** — see D11; the plan's original
      "`CmdOrCtrl+…` mirroring `shortcuts.ts`" is what §3.5 ruled out.
- [x] Menu items whose action is meaningless in the current view or project mode are
      disabled rather than silently inert. The renderer reports the live action ids from
      `editorActionsFor(type)` / `editorActions()`, which runs the shortcut map's own
      predicate — main never restates it.
- [x] Help → "Keyboard shortcuts" opens the existing help sheet; Help → repo link
- [x] View: reload, toggle DevTools (unpackaged only), the editor's own paging/zoom/overlay
      items, an **Interface Size** submenu for the window zoom roles, toggle fullscreen.
      The window-zoom roles are named for what they scale so they cannot be mistaken for
      the editor's Zoom in/out, which scale the screen preview.
- [x] `src/main/windowState.ts`: persist size/position/maximized to
      `userData/window-state.json`, modelled on the reference's `SettingsService`
      (synchronous, tiny, defaults on any read failure); restore on launch, clamped to a
      currently-attached display
- [x] About panel: `app.setAboutPanelOptions` with name, version and copyright. **No icon
      yet** — `iconPath` needs a real file on disk and `build/icon.png` is generated in E5;
      wire it there.
- [x] Confirm and set the real minimum window size (§5) — measured, now **1024×640**
- [x] Tests: the menu→action mapping is a pure table in `src/shared/menu.ts`; `menu.spec.ts`
      asserts it covers the action union exactly, invents nothing of its own, titles every
      item in Title Case, and re-words for sprite mode only what the shortcut map says
      varies. The Title-Case checker has its own test — it is the only thing keeping the
      help sheet's voice out of the menu bar.
- [x] `app.setName(productName)` before anything reads `userData`. Unpackaged,
      `app.getName()` falls back to package.json's `name`, so the app menu read "About
      tms9918-editor". A packaged build gets this right from `productName`; setting it
      makes a dev run agree, and moves `userData` to the directory the packaged app will
      use. The **menu bar's own app title still reads "Electron" in a dev run** — that one
      comes from the bundle's `CFBundleName` and only a packaged build fixes it.

**Exit criteria:** every menu item does what it says on all three platforms (or is
correctly disabled); the window reopens where it was left; ⌘Q flushes an unsaved edit
before quitting; no menu item duplicates a shortcut with a different meaning.

**Met on macOS, verified in the running app** (see Current Status). Windows and Linux are
unverified until E5 produces artifacts to run — the only platform-conditional code is the
`isMac` branching in `menu.ts` (app menu vs. File ▸ Quit and Help ▸ About), so that is the
part to re-check there.

### Phase E4 — Native file dialogs

**Goal:** exports and imports use real save/open dialogs instead of the browser's download
folder and hidden file input. **Same call sites** — the branch lives in the utilities.

- [x] `src/main/dialogs.ts` + IPC: `dialog.showSaveDialog` (writes bytes/text) and
      `dialog.showOpenDialog` (reads a file back), both returning `null` on cancel
- [x] `src/renderer/src/utils/download.ts`: keep `downloadText` / `downloadBytes` /
      `downloadCanvasPng` signatures identical; add a `window.api`-present branch that
      opens a save dialog with a sensible default filename and the right filter
      (`.asm`, `.bas`, `.bin`, `.png`, `.json`). Callers change not at all.
- [x] Extract the project-import path from `ProjectManagerView.vue`'s hidden
      `<input type="file">` into a `pickProjectFile()` utility with the same two branches;
      the view calls the utility — it lives in a new `src/renderer/src/utils/upload.ts`,
      the mirror of `download.ts`, rather than inside the download module
- [x] Remember the last-used export directory in the window-state/settings JSON so the
      second export starts where the first one landed — its own
      `<userData>/dialog-state.json`, on `windowState.ts`'s model, since window geometry
      and dialog history are read at different moments and neither wants the other's
      failure mode. Open remembers separately from save.
- [x] Unit tests for both branches with a stubbed `window.api` — the web path must keep its
      existing coverage

**Exit criteria:** every export in both apps writes through a native dialog on desktop and
still downloads in the browser; importing a project works from both; cancelling a dialog is
a no-op with no error toast. **All met** — see Current Status.

Three things the phase list did not anticipate, all now settled:

- **The renderer sends bytes, never a path.** One `SaveFileRequest` (`{ filename, data }`)
  carries text, binary and PNG alike — text is `TextEncoder`-encoded at the call site — so
  there is one channel and one main-side write rather than a text and a binary variant.
  The filter row is read off the filename's extension, which keeps the format list in the
  renderer where it already lives.
- **A failed write is reported by main, not returned to the renderer.** `save` resolves to
  `null` for both a cancel and a failure, and main puts up a native error box in the
  failure case. The renderer has one thing to check, and the side that knows *why* the
  write failed is the side that says so.
- **`ProjectManagerView`'s own inline blob download went too.** It predated
  `download.ts` and duplicated it; it now calls `downloadText`, so the project export is a
  native sheet on the desktop for free.

**Deliberately not done here:** the "Download" and "Upload Project" button labels still say
the web words in the native app. Changing them means a branch in a view, which is exactly
what this phase exists to avoid — so the wording is a §9 item, to be settled together with
the native project files D4 defers.

### Phase E5 — Icons and packaging

**Goal:** installable artifacts on all three platforms.

- [x] Extend `scripts/generate-icons.mjs` (it already generates the whole icon set
      procedurally from the glyph array, zero-dependency) to also emit a 1024×1024
      `build/icon-master.png`. Preferred over hand-authoring a master bitmap — the icon
      stays generated from one source of truth. The master is **not** the favicon at a
      larger size: it insets the tile to 824 of 1024 with rounded corners on a
      transparent canvas, which is the proportion macOS draws app icons at. Full-bleed
      art reads as oversized in the Dock beside every other icon — verified by eye
      against the running Dock, not assumed.
- [x] `build/gen-icon.mjs`, adapted from the reference: master PNG → `icon.iconset/` →
      `icon.icns` (via `sips` + `iconutil`), `icon.ico` (via ImageMagick `magick`),
      `icon.png` 512². `npm run icons` runs both halves — the master generator and then
      this — so one command takes the glyph array all the way to packaged formats.
- [x] Copy `build/entitlements.mac.plist` and `build/entitlements.mac.inherit.plist`.
      The reference's `disable-library-validation` is dropped (D7: nothing here loads an
      unsigned dylib) and `allow-dyld-environment-variables` added; notarization and a
      hardened-runtime launch both pass without it.
- [x] `electron-builder.yml` per §5, `directories.buildResources: build`,
      `directories.output: dist`, mac dmg arm64 + hardened runtime + notarize, win nsis
      x64 (non-one-click, changeable install dir), linux AppImage + deb x64,
      `npmRebuild: false`, no `asarUnpack` (D7)
- [x] `files` needed more than `out/**/*` — see the note below.
- [x] The `dist/` sharing is fine. `dist/web` sat untouched through a `--dir` pack, a
      signed `--mac`, and a `--win`: electron-builder cleans only the output subdirectory
      it is about to write (`dist/mac-arm64`, `dist/win-unpacked`), never the whole
      `directories.output`. No move to `release/` — the evidence says there is nothing to
      fix.
- [x] `scripts/dist-win.sh` (Wine, `CSC_IDENTITY_AUTO_DISCOVERY=false`) and
      `scripts/dist-linux.sh` (Docker `electronuserland/builder`, per-app volume name).
      The reference's serialport-bindings `rm -rf` goes away with D7.
- [x] `deb.depends` restates electron-builder's default list plus ALSA — see below.
- [x] Scripts: `icons`, `pack`, `dist:mac`, `dist:win`, `dist:linux`, `dist`
- [x] Notarization: the credentials were already in the environment, so `notarize: true`
      shipped from the first build and the `notarize: false` fallback was never needed.
- [x] E3's deferred About-panel icon is wired here, along with the Linux window icon.

**Exit criteria:** `npm run dist:mac` produces a dmg that installs and launches from
`/Applications` (Gatekeeper-clean if notarizing); `dist:win` produces an installer that
runs under Wine or a VM; `dist:linux` produces an AppImage and a deb that both launch;
all three show the right icon, name and version.

Three things the phase list did not anticipate:

- **`files: [out/**/*]` does not mean "only out".** electron-builder adds every
  production dependency's `node_modules` on top of whatever `files` lists, so the first
  packaged app carried 63 MB of build-time tree — Vue, Pinia, Tailwind, the fonts — and,
  in `app.asar.unpacked`, the `lightningcss` and Tailwind-oxide `.node` binaries. That is
  exactly the native-dependency baggage D7 says these apps do not have, arriving through
  the back door: Vite has already inlined all of it into `out/renderer`. The fix is in
  `files`: exclude `node_modules` wholesale, then add back
  `@electron-toolkit/utils`, the one package `externalizeDepsPlugin` keeps out of the
  main bundle and so the one the app actually resolves at runtime. **52 MB of asar
  became 696 KB**, and `app.asar.unpacked` stopped existing.
- **The About panel's icon needs a real file, and `app.asar` is not one.** `iconPath`
  (Linux, Windows) and `BrowserWindow`'s `icon` (Linux) are read by native code that
  cannot see inside the archive, so `build/icon.png` ships as the single
  `extraResources` entry and `appIconPath()` in `src/main/index.ts` resolves it either
  side of packaging, returning `undefined` — never a broken path — if it is absent.
- **The NSIS installer builds under Wine but will not run there.** electron-builder's
  installer script shells out to PowerShell for `Get-CimInstance`; Wine's PowerShell is a
  stub, so the installer exits 2 having installed nothing. Nothing is wrong with the
  artifact — its payload, version resources and all seven embedded icon sizes check out —
  but *running* it is a real-Windows or VM job, and this half of the exit criterion is
  what stays unverified until then.
- **electron-builder's default deb `Depends` omits ALSA, and Electron needs it.** A
  container with every declared dependency installed still died on `libasound.so.2:
  cannot open shared object file`. A desktop install has it and would never have shown
  this; a minimal one would have shipped a package that cannot start. `deb.depends` now
  restates the default list plus `libasound2 | libasound2t64` — the alternative covers
  Ubuntu 24.04's rename, which the old name alone does not always pull in.

One thing about *verifying* Linux on this machine, so the next session does not chase it:
the Docker builder image runs amd64 under emulation, and an AppImage will not execute
there — the type-2 runtime's `AI\x02` magic sits in the ELF identification bytes, which
the emulation layer rejects as an exec-format error. It is not a defect in the artifact.
Unpack the squashfs at its superblock offset (`unsquashfs -o`) and run the extracted
`AppRun` instead; that is a plain ELF and behaves. The AppImage also assumes the host
carries the same libraries the deb declares, so install those in the container first.

### Phase E6 — CI, release, docs

- [x] Extend the existing workflow with an Electron build smoke check —
      `npx electron-vite build` with `ELECTRON_SKIP_BINARY_DOWNLOAD: '1'` so CI never pulls
      a 100 MB binary just to prove the main process compiles. The env var alone was not
      enough — see below.
- [x] Confirm the Pages deploy still passes end to end after E1's path changes. **It did
      not, and had not since E1** — see below.
- [x] Release process: build the three artifacts locally (Wine/Docker prerequisites), then
      `gh release create` with the dmg/exe/AppImage/deb attached. A cloud release workflow
      is possible but needs a macOS runner and notarization secrets — out of scope here
      (§9).
- [x] README: a **Desktop** section — download links, what the desktop build adds over the
      web app, and the from-source build instructions including the Wine/Docker
      prerequisites. Two existing sections were stale and went with it: `npm run dev` has
      opened the desktop app since E2 rather than a Vite server, `npm run build` no longer
      writes `dist/`, and VIC's Layout tree still showed a source root with no
      `src/renderer/` in it.
- [x] `CLAUDE.md` (or create one, as the reference has) noting the layout and the two build
      targets, so future sessions don't rediscover §3
- [x] Version bump + tag in both repos — `1.6.0`. TMS's `package.json` is already there
      (PLAN.md Phase 32 bumped it); VIC still needs the bump. The TMS release notes cover
      the desktop builds *and* Round 9's sprite picker layouts.

**Exit criteria:** CI green; a GitHub Release exists with all four artifacts; a reader of
the README can build every target from a clean clone.

**The Pages deploy had been publishing nothing since E1.** This checkbox was written
expecting a confirmation and got a defect. The workflow runs `npm run build` and uploads
`dist/web` — and after E2, `npm run build` is the *Electron* build, which writes `out/`.
On a clean CI checkout `dist/web` does not exist, so the run died at
`cp dist/web/index.html dist/web/404.html`. Both repos, both unnoticed, because nobody had
pushed to `main` between E1 and here: E1–E5 were eight local commits, and the first push
was the one that carried this fix. The workflows now call `build:web`, and the path is
checked rather than assumed — the bundle hashes served live at
`acwright.github.io/<repo>/` are the ones the local `build:web` emitted, and a deep link
to `/edit/abc123` returns the SPA through the 404 fallback (HTTP 404 with the app in the
body is what GitHub Pages does, and is correct).

The lesson worth keeping: **a build command that changes meaning is invisible to a
workflow that names it.** `npm run build` stayed spelled the same and started doing
something else. Nothing in CI could have caught it, because CI *was* the thing that broke.

**`ELECTRON_SKIP_BINARY_DOWNLOAD` needed code, not just YAML.** Electron 43 ships with no
`scripts` in its own `package.json`, which is why both repos carry an explicit
`postinstall` calling `electron/install.js` — and that file has no opt-out; it reads
`ELECTRON_INSTALL_PLATFORM`, `electron_config_cache` and several others, but not the skip
flag electron's own installer honoured before v43. `scripts/install-electron.mjs` wraps
it and checks the variable, so the workflows read the way the reference's do. Checked both
ways: set, it prints and exits 0 without touching the network; unset, it installs (and
no-ops when the dist is already there). The only other package in either tree with an
install script is `electron-winstaller`, a transitive dependency of electron-builder that
selects a 7z binary and matters only to targets neither repo builds — so
`npm ci --ignore-scripts` would also have worked, less precisely.

**CI is split in two.** `deploy.yml` keeps the gates it already had and runs on `main`;
`ci.yml` is the same gates minus the deploy, on pull requests, where there is nothing to
publish. Neither duplicates the other on a given event. Both now end at
`electron-vite build`: before this, nothing in CI had ever compiled `src/main` or
`src/preload`, because the only build CI ran was the web one, which does not include them.

**`${arch}` is not one value.** The `artifactName` templates in `electron-builder.yml` all
say `${arch}`, and it expands per target: `arm64` for the dmg, `x64` for the NSIS exe,
`x86_64` for the AppImage and `amd64` for the deb — the conventions of four different
packaging worlds, not a mistake to normalise. The README's download table lists the names
as they actually land, which is what a reader will be matching against.

**The dmg is not itself stapled, and the plan said it was.** electron-builder notarizes
and staples the `.app`, then wraps the stapled app in the dmg; the dmg's own hash was
never submitted, so `xcrun stapler staple` on it fails with "Could not find base64 encoded
ticket". Verified on both: `stapler validate` and `spctl -a -vvv -t exec` on the `.app`
inside say *accepted / source=Notarized Developer ID*, and the code directory carries
`flags=0x10000(runtime)`. This is the ordinary electron-builder outcome and E5's real
exit criterion still holds — the copy installed into `/Applications` is stapled and opens
with no prompt — but the *dmg* asks Gatekeeper for an online check the first time it is
opened. Notarizing the dmg as a second artifact would close that and is a §9 item.

---

## 8. Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `electron-vite@6` beta has a defect | Medium | Phase E2 opens with a spike; two documented fallbacks (D1) |
| ESM main entry filename mismatch in `package.json` `main` | Medium | Verified ESM works (§3.3); confirm the emitted extension before writing the field |
| ~~Notarization credentials/profile not ready~~ | — | Did not happen: the credentials were in the environment and E5's first dmg notarized and stapled |
| Wine or Docker missing on the build machine | Medium | Prerequisites documented in the README; both are the reference's existing workflow. Present here — Wine 11, Docker Desktop |
| `app://` handler mis-serves an asset type | Low | Standard scheme + `net.fetch` of a `file://` URL preserves MIME; spike already served HTML and resolved a deep link |
| ~~electron-builder cleaning `dist/` eats `dist/web`~~ | — | Did not happen: builder cleans only its own `dist/<target>-unpacked`. `dist/web` survived a pack, a mac dist and a win dist |
| ~~Menu accelerators colliding with renderer key handling~~ | — | Happened, and worse than feared: an accelerator double-fires (§3.5). Closed by D11 |

---

## 9. Deferred / future work

Explicitly out of scope for this plan, listed so it's clear they were considered:

- **Native project files** — File > New/Open/Save As against real `.json` files on disk, a
  recent-files menu, `.tms9918`/`.vic20` file associations and "Open With". The most
  valuable desktop-only feature, and a product round of its own (D4).
- **Notarizing the dmg itself.** electron-builder notarizes and staples the `.app` and
  then wraps it, so the dmg carries no ticket of its own and Gatekeeper checks it
  online the first time it is opened. Submitting the dmg as a second artifact would
  make the download verify offline too (E6).
- **Auto-update** (`electron-updater` + a release feed).
- **A cloud release workflow** — macOS runner, notarization secrets, artifact upload.
- **macOS Intel (x64) and Apple silicon universal builds** — the reference ships arm64 only.
- **Linux arm64**, Snap, Flatpak.
- **Windows code signing** (an unsigned NSIS installer shows a SmartScreen warning).
- **A shared package** for the code these two editors duplicate (`download.ts`,
  `platform.ts`, the whole Electron shell). Worth doing only if a third editor appears —
  and this plan's phases are what would be extracted.
