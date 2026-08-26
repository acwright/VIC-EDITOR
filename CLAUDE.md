# Working in this repository

## One renderer, two entry points

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
`platform.ts`, `strings.ts` — and each one falls back to browser behaviour. A new platform
difference belongs in one of those files, not in an `if (electron)` inside a component.

Adding to the preload surface means adding to `src/shared/api.ts` and `src/shared/ipc.ts`
too. Keep it narrow and explicitly typed; there is deliberately no `ipcRenderer`
passthrough.

It is "two entry points" rather than "two shells over one view tree" because `v2.0` gave
each shell a home route the other does not use — see the next section. That is the *only*
view-layer fork, and it is decided once.

## Storage: one port, two adapters, one file format

`v2.0` moved the desktop off browser storage and onto **project files**. The shape of that
is five rules, and every one of them is load-bearing:

- **One async port, split in two** (`src/renderer/src/persistence/store.ts`). `ProjectStore`
  is what an *editor* needs — `load`, `save` — and both adapters implement it, so
  `stores/projects.ts` has one call site rather than a branch per shell. `ProjectLibrary`
  adds what a *list* needs and exists in the browser build alone; `DocumentStore` adds what
  the *open file* needs and exists on the desktop alone. Nothing throws "unsupported": the
  type system says which surface exists where. Every method is async because a disk-backed
  one cannot be anything else — that is why the browser adapter is async too.
- **The renderer never names a file path.** `save` takes no path; it hands main serialized
  text and main writes whatever it has open. Paths cross *outwards* only — the window title,
  the conflict dialog, Reveal. `src/shared/document.ts` is where that rule is written down,
  and no call in that surface accepts a path back. Do not add one.
- **Every read and write carries a stamp** (`{ mtimeMs, size }`), and main refuses a write
  whose file no longer matches. This is what makes a debounced autosave safe against a
  `git checkout` landing under it, and it is the reason `DocumentConflictError` exists. A
  filesystem with one-second mtime granularity would need a content hash instead; APFS was
  measured and does not.
- **Serialization is git-first, and there is exactly one of it.** `serializeProject` writes
  one screen row per line and one character per line, in a stable key order, so a diff shows
  the bytes that changed. Both writers — the desktop's document and the web's download — go
  through it, and golden documents per mode hold the format still. A write that would not
  change the file does not happen, so an idle editor does not churn a working tree.
- **Change detection watches the document's *directory*, non-recursively, plus a `stat` on
  focus.** A watch on the open *file* is single-shot — a `git checkout` replaces the inode
  and the watch dies with it. Measured; do not "simplify" it back.

`src/main/` owns the rest: `document.ts` (the open document, atomic writes),
`documentFile.ts`, `documentWatch.ts`, `openRequests.ts`, `recent.ts`, `migration.ts`.
**Every way a document can arrive ends in `openRequests.ts`** — `open-file`, `argv`,
`second-instance`, a drop, the Open dialog, Open Recent, the reopen-at-launch — and it
*announces* rather than adopts, so the renderer can flush what it holds into the old file
before taking the new one.

## Things that look odd and are load-bearing

Each of these was measured in the running app before it was written. The spikes and the
numbers behind them are in the git history — they lived in `ELECTRON-PLAN.md`, which was
removed once the desktop shell shipped — and this is the short list of what not to
"clean up".

- **The renderer is served over `app://vic20/` in production, not `file://`.** Under
  `file://` the router's `createWebHistory` is broken twice over: `location.pathname` on
  startup is the renderer's absolute disk path, and a reload after a `pushState` resolves
  against `file:///edit/<id>`, which does not exist. A custom *standard* scheme fixes both
  and gives `localStorage` a real per-app origin. This is why the router needs no Electron
  branch for *history* — the one fork in `src/renderer/src/router/` is which component `/`
  resolves to, and nothing else belongs there.
- **`electron.vite.config.ts` has a small plugin that puts `base` back to `'/'`.**
  electron-vite's preset assigns `base: './'` in an `enforce: 'pre'` hook on every
  production build, which overwrites ours. Given `'./'`,
  `createWebHistory(import.meta.env.BASE_URL)` silently resolves *every* route to `/`.
  The plugin is the fix; deleting it breaks routing in the packaged app only.
- **`electron-vite` is pinned exactly (`6.0.0-beta.1`), not caret-ranged.** It is the only
  release that supports Vite 8, and it is a beta — a silent bump is a real risk. Change it
  deliberately or not at all.
- **Menu items that dispatch an action carry no accelerator, with one exception.** An
  accelerator does *not* take the key away from the page: the menu item fires *and* the
  renderer's `keydown` fires, so the action would run twice on every press.
  `registerAccelerator: false` does not suppress it either — both were measured. The
  keyboard is therefore the renderer's job (`src/renderer/src/utils/shortcuts.ts` is the
  single map) and the menu is a click surface. Items built from Electron **roles** — Copy,
  Reload, Quit, Toggle Full Screen — keep their standard accelerators, because the
  editor's map binds none of those keys.
  **File ▸ Save prints ⌘S**, because a File menu without it reads as a bug. It is safe
  where the rule's two hazards are not hazards: a second `save` finds the content hash
  unchanged and writes nothing, and ⌘S with a text field focused is Save in every app. A
  shortcut opts in with `menuKey` in the map — the full rule for what may is in the field's
  own comment — and the accelerator travels in the `MenuContext`, so main still spells no
  key of its own. The renderer keeps handling the key, which is what makes this need no
  per-platform measurement: fire the item and the second run is a no-op; print it without
  firing and the page's keydown still does the work.
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
- **The file association claims `.vic20`, never `.vic20.json`.** Windows associates on
  the *last* extension only, so claiming the compound one would claim `.json` system-wide.
  Legacy v1 exports still open through Open… and by drop, and deliberately not by
  double-click.
- **macOS needs `UTExportedTypeDeclarations` in `extendInfo` as well as `fileAssociations`.**
  electron-builder emits `CFBundleDocumentTypes` and nothing else, which leaves the extension
  resolving to a *dynamic* UTI — no name, no description, no icon, and that is what Get Info
  shows. Exporting the type is what names it. Only the declaration goes there: a second
  `CFBundleDocumentTypes` entry for the same extension would be one more thing for
  LaunchServices to choose between.
- **A drop target reads its path in the preload, via `webUtils.getPathForFile`.** `File.path`
  was removed in Electron 32 and the renderer has no `webUtils`; `dragover` must be cancelled
  or the browser engine takes the drop itself.

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
values. They are all in one place per file:

| What | Where |
| --- | --- |
| Product name, appId, file association, UTI, MIME type | `electron-builder.yml` |
| `app://` host, protocol registration | `src/main/index.ts` |
| Window measurements | `src/main/windowState.ts` |
| Document extension, legacy extension, migration folder | `src/shared/document.ts` |
| Published web app URL (share links) | `vite.web.config.ts`, `electron.vite.config.ts` |
| Storage key prefix | `src/renderer/src/persistence/repository.ts` |

Two things genuinely differ in the *editor* rather than the shell: how a screen row is
chunked by the git-first serializer (`settings.columns` here, the mode's column count
there) and the document key order. `PLAN.md` §9 is the full table. A fix to the shell here
is almost always a fix there too — and that repo carries a sprite mode this one does not,
so its shortcut map and menu have entries with no counterpart here. The parts that differ
are the editor, not the shell.

Its `PLAN.md` is meant to be **identical** in both repos: when a decision changes, change
both copies. The rest of the desktop shell is duplicated rather than shared, on purpose —
extracting a package is worth it only if a third editor appears.

`PLAN.md` is the record of the document-storage round that shipped as `v2.0.0` — its
spikes, its confirmed decisions (D1–D22), what it measured, and what it deliberately
defers (§12: multiple windows, sibling documents, a web document adapter, a merge driver).
It is complete rather than in flight, and it is the reference behind the storage section
above. Read it before changing anything under `src/renderer/src/persistence/`, `src/main/`
or the router — particularly §6 (what was measured) and §7 (why each decision is what it
is), so a rule is changed deliberately rather than tidied away.

One thing it leaves standing and unproven: **the double-click association is verified on
macOS and Linux and taken on trust on Windows** (S1, §11). Testing it is a real Windows job,
like the NSIS installer.
