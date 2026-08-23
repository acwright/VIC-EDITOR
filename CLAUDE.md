# Working in this repository

## One renderer, two shells

This repo builds two products from one source tree:

| | Command | Config | Output |
| --- | --- | --- | --- |
| Desktop (Electron) | `npm run build` | `electron.vite.config.ts` | `out/` |
| Web (GitHub Pages) | `npm run build:web` | `vite.web.config.ts` | `dist/web/` |

`npm run dev` opens the **desktop** app; `npm run dev:web` is the browser one. That is a
change from before the Electron work — anything that still says `npm run dev` starts a
Vite server at localhost:5173 is out of date.

```
src/renderer/   the editor. Knows nothing about Electron.
src/main/       the Electron main process — window, menu, native dialogs, window state
src/preload/    the contextBridge API. Nothing else crosses.
src/shared/     the types and channel names main and renderer agree on
```

The rule that keeps this working: **the renderer never imports from `src/main/`**, and
reaches the desktop only through `window.api`, which is simply absent in the browser. The
forks live in `src/renderer/src/utils/` — `desktop.ts`, `download.ts`, `upload.ts`,
`platform.ts` — and each one falls back to browser behaviour. A new platform difference
belongs in one of those files, not in an `if (electron)` inside a component.

Adding to the preload surface means adding to `src/shared/api.ts` and `src/shared/ipc.ts`
too. Keep it narrow and explicitly typed; there is deliberately no `ipcRenderer`
passthrough.

## Things that look odd and are load-bearing

Each of these was measured in the running app before it was written. The spikes and the
numbers behind them are in the git history — they lived in `ELECTRON-PLAN.md`, which was
removed once the desktop shell shipped — and this is the short list of what not to
"clean up".

- **The renderer is served over `app://vic20/` in production, not `file://`.** Under
  `file://` the router's `createWebHistory` is broken twice over: `location.pathname` on
  startup is the renderer's absolute disk path, and a reload after a `pushState` resolves
  against `file:///edit/<id>`, which does not exist. A custom *standard* scheme fixes both
  and gives `localStorage` a real per-app origin. This is why `src/renderer/src/router/`
  needed no Electron branch at all — do not add one.
- **`electron.vite.config.ts` has a small plugin that puts `base` back to `'/'`.**
  electron-vite's preset assigns `base: './'` in an `enforce: 'pre'` hook on every
  production build, which overwrites ours. Given `'./'`,
  `createWebHistory(import.meta.env.BASE_URL)` silently resolves *every* route to `/`.
  The plugin is the fix; deleting it breaks routing in the packaged app only.
- **`electron-vite` is pinned exactly (`6.0.0-beta.1`), not caret-ranged.** It is the only
  release that supports Vite 8, and it is a beta — a silent bump is a real risk. Change it
  deliberately or not at all.
- **Menu items that dispatch an action carry no accelerator.** An accelerator does *not*
  take the key away from the page: the menu item fires *and* the renderer's `keydown`
  fires, so the action would run twice on every press. `registerAccelerator: false` does
  not suppress it either — both were measured. The keyboard is the renderer's job alone
  (`src/renderer/src/utils/shortcuts.ts` is the single map); the menu is a click surface.
  Items built from Electron **roles** — Copy, Reload, Quit, Toggle Full Screen — keep
  their standard accelerators, because the editor's map binds none of those keys.
- **Menu items are built from the shortcut map, not from a parallel command list.** The
  renderer runs the map's own mode predicate and sends main the live action ids *with*
  their wording for the open mode, so main never restates the question. Menu wording is
  Title Case per the macOS HIG and lives in `src/shared/menu.ts` — deliberately not the
  help sheet's sentences — and `menu.spec.ts` holds the two lists together.
- **The default window size is a *content* size, and only on a first launch.** What has to
  fit is the viewport; the frame around it differs per platform. A window the user has
  sized is restored from `getNormalBounds`, which is window bounds — hence
  `useContentSize` in the saved state being write-never. Both numbers in `windowState.ts`
  are measurements from the running app, and the comments say what each one clears.
- **`"type": "module"` stays.** ESM main + ESM preload were verified working; `sandbox:
  false` is what an ESM preload requires and is the intended posture here.

## Packaging traps

- **`electron-builder.yml` excludes `node_modules` wholesale**, then adds back
  `@electron-toolkit/utils` alone. electron-builder adds every production dependency on
  top of `files`, but Vite has already inlined Vue, Pinia and Tailwind into the bundle;
  shipping the tree again cost 52 MB and pulled in two platform-specific `.node` binaries.
  If something genuinely needs resolving at runtime, add it back by name.
- **The deb's `depends` restates the default list plus `libasound2 | libasound2t64`.**
  electron-builder's default omits ALSA and Electron will not start without it — invisible
  on a desktop install, fatal on a minimal one.
- **The NSIS installer builds under Wine but cannot be *run* there** (its script shells out
  to PowerShell's `Get-CimInstance`, which Wine stubs). Testing the installer is a real
  Windows job. The artifact itself is fine.
- **An AppImage will not execute in the amd64 Docker builder on Apple silicon** — the
  type-2 runtime's magic bytes sit where the emulation layer expects ELF identification.
  Unpack the squashfs (`unsquashfs -o <offset>`) and run the extracted `AppRun` instead.
- **`ELECTRON_RUN_AS_NODE=1` in the shell makes `npm run dev`/`preview` fail** with *"does
  not provide an export named 'BrowserWindow'"*. Some editors' integrated terminals set
  it. Nothing is wrong with the app — run `env -u ELECTRON_RUN_AS_NODE npm run dev`.

## Claims about the app need to have been run

The standard the Electron phases were held to, and worth keeping: behaviour is verified in
the **running app** — driving the real menu, the real save sheet, the real packaged
binary — not by reading the code that ought to produce it. That standard is what caught
the accelerator double-fire, the `base: './'` override and the missing ALSA dependency,
each of which reads as correct in the source.

If a check cannot be run, say which half is unverified rather than rounding up. The NSIS
installer is the standing example.

## The TMS9918 Editor is the same app

`../TMS9918-EDITOR` is structurally identical — same stack, same layout, same tooling, same
router and persistence design, and an Electron shell that differs only in a handful of
values — product name, appId, `app://` host, window measurements — which live in
`electron-builder.yml`, `src/main/index.ts` and `src/main/windowState.ts`. A fix to the
shell here is almost always a fix there too. It carries a sprite mode this repo does not, so
its shortcut map and menu have entries with no counterpart here — the parts that differ are
the editor, not the shell.

Its `PLAN.md` is meant to be **identical** in both repos: when a decision changes, change
both copies. The rest of the desktop shell is duplicated rather than shared, on purpose —
extracting a package is worth it only if a third editor appears.

`PLAN.md` is the source of truth for the work in flight — its spikes, its confirmed
decisions (D1–D22) and what it deliberately defers. It is currently the move off browser
storage and onto **project files the desktop app opens by double-click**, which is a change
big enough to touch two of the rules above: the desktop app will route `/` to its own start
view rather than the project manager (the only view-layer fork, decided once in the router —
no component branches on the shell), and the renderer will still never name a file path, the
main process owning whichever document is open. Read it before changing anything under
`src/renderer/src/persistence/`, `src/main/` or the router.
