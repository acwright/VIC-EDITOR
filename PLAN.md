# Document Storage — Implementation Plan

The desktop editors stop keeping projects in browser storage and start opening **project
files**. Double-clicking `Star Voyager.tms9918` launches straight into the Graphics II
editor with that project loaded; the file lives wherever you keep it — beside the assembly
in a game's repository — and goes through version control with everything else.

There is no workspace, no folder to choose and no project list on the desktop. The operating
system's file manager, or the file tree already open beside your source, is the project
list. The **web build is unchanged**: it has no file system, so its project manager and its
browser storage stay exactly as they are.

This document is the source of truth across agent sessions. **Update the checkboxes and the
"Current Status" section as work progresses.**

The two editors are structurally identical — same stack, same layout, same tooling, same
persistence design — so this is one plan with a table of the handful of values that differ
(§9). An identical copy lives in each repo; when a decision changes, change both.

---

## Current Status

- **Status: written, nothing built.** No phase has started and none of the spikes in §6 has
  been run. §5 is measured; everything else here is design intent, and as phases land this
  section records which parts became measurements.
- **Last updated:** 2026-08-23
- Baseline: `v1.6.1` in both repos. Electron 43.4.1, `electron-vite@6.0.0-beta.1`, Vite 8,
  Vue 3 + Pinia, `vue-router` 5.
- **Three shapes for this change were written up and compared before this one was chosen**
  — a workspace folder, a workspace file, and this. §3 records what the other two were and
  why they lost; the full documents are in this conversation's history and not in the repo.
- The desktop shell itself shipped as `v1.6.0` under `ELECTRON-PLAN.md`, which deferred
  exactly this round as "Native project files" (its D4). That document was removed once its
  work shipped; what survived it is the load-bearing list in `CLAUDE.md`, and the rest is in
  the git history.
- Target: **`v2.0.0` in both repos**, released together (D22, Phase F8).

---

## 1. Goal

| Today | After |
| --- | --- |
| Desktop projects live in the app's own `localStorage` | Each project is a file, wherever you keep it |
| Getting one into a git repo: *Download*, then *Upload* to edit it again | The file in the repo **is** the document |
| Launch → a list in browser storage → pick a project → edit | Double-click → **edit** |
| The app owns a list of your projects | Your file system owns it, as it already does for every other source file |
| A diff of an exported project is one enormous line | A diff names the characters and screen rows that changed |

Non-negotiables, in priority order:

1. **No web user loses a project.** For a browser user, `localStorage` is the only copy that
   exists. The web build's storage behaviour does not change in this round (D20).
2. **No desktop user loses a project.** Whatever `v1.6.x` desktop put in `localStorage` is
   copied out to files on first run and is *left in place* afterwards (D19).
3. **The renderer still never imports from `src/main/`**, and reaches the desktop only
   through `window.api`. The one new fork this round introduces is a route, not a component
   (D13).
4. **The file format does not change.** A project exported by `v1.0` opens as a document in
   `v2.0`; a document written by `v2.0` imports into the web app (D2).
5. **Every existing gate stays green** — `oxlint`, `eslint`, `vue-tsc --build`, `vitest`,
   `npm run build`, `npm run build:web`.

---

## 2. The shape

**The file** is exactly today's project JSON — same schema, same `version: 1`, same
`validateProject`, no envelope and no new fields. What changes is the name it is written
under: `Star Voyager.tms9918` rather than `star-voyager.tms9918.json`, because a
double-click association cannot be registered on a compound extension (D3).

**The app**, on the desktop, has one screen: the editor. Launching it does one of two things:

1. **A document was open when you quit, and it still exists** → it reopens, in its own mode.
   Launching puts you back where you were, which is what an editor should do (D11).
2. **Otherwise** → a small start screen: Recent Documents, *New…*, *Open…*, *New from
   Sample…*, the keyboard-shortcut sheet and the version footer. It is a launcher, not a
   project manager — it lists what you opened recently, never "all your projects", because
   the app no longer knows what those are (D12).

**The web app is untouched**, project manager and all.

What the manager's other jobs become on the desktop:

| Manager does today | Becomes |
| --- | --- |
| Lists your projects | Finder / Explorer / your editor's file tree |
| Rename | Rename the file, anywhere |
| Duplicate | Duplicate the file, anywhere — or *Save a Copy…* |
| Delete | Delete the file, anywhere |
| Download / Upload | *Save a Copy…* / *Open…* |
| Load a Sample | *New from Sample…*, on the start screen and in the File menu |
| Share link | Unchanged, from the editor |

---

## 3. Why this shape, and what was rejected

Settled with the user after all three were written up and compared. **Do not re-litigate
without user input.**

- **A workspace folder** — the app lists a directory you point it at, one project per file.
  Keeps an in-app project list *and* per-project git history, and needs no new format. It
  loses the double-click: a folder cannot be associated with an application, so every
  session starts with *Open Folder…*. It also has to encode file paths into route ids to get
  past the `app://` protocol handler's extension check (D9), and it needs a folder listing,
  a summary cache, a granted-path set and folder watching in the main process. Rejected: the
  in-app list is close to redundant when the files already sit in a repository you browse in
  an editor, and it is the most machinery for the least distinct benefit.
- **A workspace file** — one document holding an array of projects in today's per-project
  format. Gets the double-click *and* keeps an in-app list. It gives up per-project
  `git log` and `git blame` (one history for everything), makes any two projects collide in
  one file on a merge, puts every project in one blast radius, and adds an envelope format to
  own. Rejected: history granularity is a large part of why this round exists.
- **Untitled documents** — the native document-app convention, where ⌘N gives you an editor
  immediately and ⌘S asks where. Rejected as D10 explains: it adds a document state the app
  has never had, which autosave, the save indicator and the quit flush would each have to
  learn.
- **A zip archive or a macOS bundle** as the container. A zip is binary to git — no diff, no
  blame, no merge — which defeats the round. A bundle is a single file only on macOS, so the
  model would have to work as a folder on the other two anyway.

**What this plan buys** is the double-click and per-project git history at once — the two
things the other two shapes each gave up — plus no new format, the smallest main-process
surface of the three, and no new concept for the user to learn. **What it pays** is the
in-app project list, and §4 is the honest accounting of that.

---

## 4. What is removed, and what that costs

**`ProjectManagerView.vue` stops being reachable on the desktop.** It stays in the tree,
unchanged, as the web build's home route. The desktop routes to a new, much smaller
`StartView.vue` instead. Three consequences worth being clear about:

- **"One renderer, two shells" bends here for the first time.** Until now the shells
  differed only in utilities — `desktop.ts`, `download.ts`, `upload.ts`, `platform.ts` — and
  every view was shared. This round gives the desktop a view the web does not use and takes
  away one the web still needs. **The fork is contained to which route `/` resolves to,
  decided once in the router from `isDesktop()`** (D13); no component branches on the shell,
  and that rule still holds. But the claim "the same component tree in two shells" becomes
  "the same component tree, two entry points", and `CLAUDE.md` and the README should say so
  rather than repeat the old sentence (Phase F8).

- **The `back` action changes meaning.** `EditorView`'s Escape and its menu item are "Back
  to Projects", which on the desktop no longer exists. It becomes *Close Document*, returning
  to the start screen, and the shortcut map grows a shell predicate beside its existing mode
  predicate (`editorActionsFor`). That machinery already exists and is tested —
  `menu.spec.ts` holds the map and the menu together — so this extends it rather than working
  around it (D14).

- **Cross-project operations leave the app.** Rename, duplicate and delete become file-manager
  operations. This is the honest half of "the OS is the project list": genuinely simpler, and
  genuinely more clicks when you wanted to duplicate a charset to try a variant. *Save a
  Copy…* covers the common case.

**One window becomes the most-felt limitation.** A document app that shows one document at a
time is an odd animal — comparing two charsets means closing one. Opening a second document
is the natural next gesture here rather than a rare one, which it was not in the other two
shapes. D17 states the interim behaviour plainly and §12 keeps multi-window as its first
item.

---

## 5. Measured before writing

What a document costs to write, since autosave writes one every 500 ms of editing. Measured
on synthesized **full-size** projects — every charset full, every screen full — formatted by
a stand-in implementation of D4's rules in plain node. **Not the running app**, so this is
the shape of the answer rather than the answer; Phase F2 re-measures with the real
serializer.

| Project | Lines | Formatted | Compact | Format time |
| --- | --- | --- | --- | --- |
| Graphics II independent (3 charsets, 1 screen) | 1,594 | 141 KB | 125 KB | 0.4 ms |
| Graphics II mirrored (1 charset, 2 screens) | 591 | 54 KB | 46 KB | 0.1 ms |
| Graphics I (1 charset, 1 screen) | 301 | 13 KB | 10 KB | < 0.1 ms |
| Text (1 charset, 1 screen 40×24) | 301 | 13 KB | 10 KB | < 0.1 ms |
| Multicolor (1 screen 64×48) | 67 | 15 KB | 11 KB | < 0.1 ms |

Two conclusions:

1. **Write cost is a non-issue.** The largest document any mode can produce formats in
   0.4 ms and writes in well under a millisecond, against a 500 ms autosave debounce. There
   are three orders of magnitude of headroom, and D5's elision means most autosave ticks
   write nothing at all.
2. **D4's chunking is load-bearing, not cosmetic.** The same Graphics II project through a
   naive `JSON.stringify(p, null, 2)` is **34,596 lines and 0.50 MB**; chunked to one
   character and one screen row per line it is **1,594 lines and 141 KB**. 22× fewer lines,
   3.5× smaller, and only 13% larger than compact JSON. That ratio is why the format rules
   are written the way they are and not "just pretty-print it".

---

## 6. Questions to settle first

Spikes, run before the phase that depends on each. Nothing below is measured yet. When one
is run, its result and what it rules out get written back here.

### S1 — Do file associations work, end to end, on all three platforms? *(before F4)*

**Go/no-go for the whole round.** The double-click is what this plan traded the project list
for; without it the trade was for nothing. electron-builder's `fileAssociations` covers macOS
(`CFBundleDocumentTypes` plus an exported UTI), Windows (NSIS registry entries) and Linux (a
MIME type and the `.desktop` entry). Verify by **double-clicking a real document** in each
platform's file manager: from a cold start, and again while the app is already running with
another document open.

### S2 — Does macOS `open-file` arrive before `whenReady`? *(before F4)*

A double-click on a cold start races window creation. Assume the event must be queued and
replayed once the window exists until measured — the failure mode is "the first double-click
does nothing", which this plan cannot ship with.

### S3 — What sees a `git checkout` under the editor? *(before F5)*

Branch switching is the workflow this round exists for, and it is where a file changes under
an open document. Candidates: `fs.watch` on the open file, versus polling `stat` on window
focus plus a low-frequency tick while focused. Run a real `git checkout` of a branch that
changes the open document, on macOS at minimum, and record whether `fs.watch` fires, how
often, with which event name, and whether it survives git's rename dance. **Focus + `stat`
ships either way** — a watcher is an optimisation on top of it, never the only mechanism.

### S4 — What does a bare extension cost in practice? *(before F3)*

Confirm what D3 assumes: that `git` still treats `.tms9918` as text (it decides by content,
not extension), that `git diff` renders it normally, and what VS Code and GitHub do with it
unaided. The answer decides whether D3 should recommend a one-line `.gitattributes` in the
user's own repository — not whether the plan works.

### S5 — Is `webUtils.getPathForFile` the drag-and-drop path on Electron 43? *(before F4)*

`File.path` was removed from Electron some releases ago and `webUtils.getPathForFile` is the
replacement, called from the preload. Confirm the API and where it must run before building
the drop handler on it.

---

## 7. Confirmed decisions

**D1 — One async `ProjectStore` port, and it splits in two.** Storage moves behind an
interface, and every method is `async` — disk I/O cannot be otherwise, and having the web
adapter be async too is what keeps one call site.

```ts
export interface ProjectStore {
  readonly kind: 'browser' | 'document'
  load(id: string): Promise<Project | null>
  save(project: Project): Promise<void>
}

/** The extra surface a *list* of projects needs. Browser build only. */
export interface ProjectLibrary extends ProjectStore {
  list(): Promise<ProjectSummary[]>
  rename(id: string, name: string): Promise<void>
  duplicate(id: string): Promise<string>
  remove(id: string): Promise<void>
}
```

The browser adapter implements `ProjectLibrary` — the web still has a manager. The document
adapter implements only `ProjectStore`. Nothing has to throw "unsupported", and the type
system says which surface exists where. `rename` and `duplicate` move down from the Pinia
store into the port, where the browser adapter already has everything they need.

**D2 — The file format does not change at all.** No envelope, no schema bump, no new fields;
`validateProject` is untouched and `version` stays `1`. Every project anyone has ever
exported is already a document this app opens, and every document it writes imports into the
web app. This is what makes migration a copy rather than a conversion.

**D3 — Documents are written as `.<ext>`, and `.<ext>.json` is read forever.** A double-click
association cannot be registered on a compound extension: Windows associates on the last
extension only, so claiming `.tms9918.json` would mean claiming `.json` system-wide, which is
not a thing an editor for an 8-bit video chip gets to do. New documents are therefore
`Star Voyager.tms9918`; existing `.tms9918.json` files open, import and stay valid forever.
The web build's *Download* writes the same bare extension, so both shells produce identical
files. What this costs is editor syntax highlighting and GitHub's JSON rendering, recoverable
with one `*.tms9918 linguist-language=JSON` line in the user's own `.gitattributes` — which
the app does not write for them (S4 confirms the rest).

**D4 — Serialization is git-first, and is the only serialization.** One `serializeProject`,
used by disk writes and by *Save a Copy…* alike:

- 2-space indent, LF, trailing newline (both repos are `* text=auto eol=lf`).
- **Keys in a fixed order** — `version, id, name, type, createdAt, modifiedAt, settings,
  charsets, colors, screens, animations`. `JSON.stringify` preserves insertion order, so
  without this the same project serializes differently depending on whether it came from
  `createProject` or from a file someone else wrote.
- **One character per line**: a pattern's 8 bytes stay on one line, `[0, 60, 66, …]`. A
  charset is then 256 lines and a diff names the characters that changed.
- **One screen row per line**: `cells` chunked at the mode's column count, so a row of the
  file is a row of the screen.
- Identical project → byte-identical output. Formatting is never semantic: a file round-trips
  through load and save unchanged.

Today's repository writes compact JSON and reserves pretty-printing for downloads; that
distinction disappears. §5 measures what the rules cost and what they save.

**D5 — A write that would not change the file does not happen, and `modifiedAt` moves only
when content moves.** Autosave fires every 500 ms of editing; against a git worktree that
would otherwise mean a file whose mtime and `modifiedAt` churn constantly while `git diff`
shows nothing. The save path hashes the project *excluding* `modifiedAt`, compares with the
hash of what it last wrote, and returns early when they match. `saveCurrent()` must stop
stamping `modifiedAt` before it knows whether anything changed — today it does so
unconditionally (`stores/projects.ts:182`).

**D6 — Writes are atomic and stamp-guarded.** Serialize, write `<file>.tmp` in the same
directory, `rename` over the target — so a crash mid-write cannot truncate a charset someone
spent an evening on. Every read returns a *stamp* (`{ mtimeMs, size }`, or a content hash if
S3 shows mtime granularity is not enough) and every write carries the stamp it expects; main
refuses a write whose stamp no longer matches rather than guessing.

**D7 — External changes win when we are clean, and are never overwritten when we are
dirty.** When the document is clean and the file changes, it reloads in place with a quiet
note. When it is dirty, a dialog names both sides and says plainly that taking the file
discards the edit. This is the safety property the round rests on: a `git checkout` must
never be eaten by a debounced autosave that was already in flight.

**D8 — The renderer never derives a path; main owns the open document.** Save takes no path
— it writes to whatever document main has open. Open and New go through dialogs run by main.
The only path the renderer can hand main is one the user just produced by dropping a file on
the window, and main treats that exactly as it treats a dialog result. The preload surface
therefore stays as narrow as it was: a handful of named functions, no `ipcRenderer`
passthrough, and no way for the renderer to name an arbitrary file.

**D9 — Route ids stay UUIDs.** `/edit/:projectId` keeps its meaning: the id is the project's
own `id` field, exactly as today, and `src/renderer/src/router/` needs no thought at all.
After a reload the renderer asks main which document is open and re-reads it — main is the
process that knows. This is worth stating because the rejected workspace-folder shape could
not do it: encoding a file path into the route would put `.json` on the URL, and
`src/main/index.ts`'s protocol handler decides "router route versus asset request" by
extension (`extname(pathname) === '' ? 'index.html' : …`), so a ⌘R at that route would ask
for a *file* and 404. Keeping ids opaque and UUID-shaped means that class of bug never
exists here.

**D10 — *New…* asks where the file goes; there are no untitled documents.** The existing
`NewProjectDialog` already collects mode and name; it grows a location, defaulting to the
directory of the last document opened. Autosave then works from the first pixel,
unconditional and identical to today. The native alternative — a real untitled document saved
on first ⌘S — is more conventional for a document app and is rejected because it introduces a
document state this app has never had, which autosave, the save indicator and the quit flush
would each have to learn. *Save a Copy…* covers "start from this one".

**D11 — Launching with no document reopens the last one.** Its path is remembered in
`userData` beside the window state. If it is gone, the start screen appears instead. An
editor that forgets what you were doing between launches is worse than one that does not, and
this is the plan with no list to fall back on.

**D12 — `StartView.vue` is a launcher, not a manager.** Recent Documents, *New…*, *Open…*,
*New from Sample…*, the shortcut sheet, the version footer. It never claims to list "your
projects", because the app does not know them. `ProjectManagerView.vue` is untouched and
stays the web build's home route.

**D13 — The router picks the home route once, from `isDesktop()`.** `/` resolves to
`StartView` in the desktop shell and `ProjectManagerView` in the browser; `/edit/:projectId`
is shared and unchanged. This is the only place the shells fork in the view layer, and it is
one decision in the router rather than a branch inside a component. The rule to keep is
unchanged: **no component branches on the shell.**

**D14 — `back` becomes *Close Document* on the desktop.** The shortcut map grows a shell
predicate beside its existing mode predicate, `src/shared/menu.ts` gets the new wording, and
`menu.spec.ts` covers both. Keys stay entirely the renderer's job, as they have been since
the shell shipped — menu items that dispatch an action carry no accelerator, because an
accelerator fires the item *and* still delivers the keydown to the page.

**D15 — Every way a document can arrive is one code path.** macOS `open-file` (queued if it
beats the window, S2), Windows and Linux `argv` on first launch, `second-instance` argv while
running, drag-and-drop onto the window (S5), *Open…* and *Open Recent*. All of them end in
the same main→renderer message: here is a document — path, text, stamp.

**D16 — Recents are the primary navigation and have to be good.** In `userData`, pruned of
paths that no longer exist, shown both in the File menu and on the start screen, and deep
enough to be useful (16 entries).

**D17 — One window; opening a document flushes the current one and replaces it.** Multi-window
is §12's first item, and §4 is honest that this is the shape where its absence is most felt.

**D18 — Autosave stays.** It is the app's character, D5 makes it quiet in git, and D6/D7 make
it safe across a branch switch. ⌘S still forces a write and still flushes on quit.

**D19 — Migration copies; it never moves.** The first `v2.0.0` desktop launch with projects
in `localStorage` writes each one as its own file into a folder chosen once (defaulting per
§9), **seeds Recent Documents with them** so they are reachable immediately, and sets a
marker so it happens once. `localStorage` is left untouched — if the migration wrote
something wrong the originals are still there, and the sheet says exactly that. A "remove
browser-stored copies" action is offered in the manager afterwards, never run automatically.
Seeding recents matters more here than it would elsewhere: after migration there is no list
view to find the files in.

**D20 — The web build is unchanged.** Same keys, same index, same manager view, same quota
error. It gains only honesty — saying where projects live and what clearing browsing data
does — and a pointer at the desktop app for people who want files. Giving the browser the
File System Access API was considered and deferred: support is not universal, so the
`localStorage` path would have to stay as a fallback anyway, and a browser cannot silently
autosave into a git worktree.

**D21 — Share links are rooted at the published web app.** `shareUrl` builds
`${window.location.origin}${BASE_URL}#p=…`, which on the desktop is `app://<host>/` — a link
that only resolves inside a copy of the app that will never receive it. The published Pages
URL becomes a build-time constant. This is a pre-existing `v1.6` defect and this round is the
natural place to fix it.

**D22 — `v2.0.0` in both repos, released together.** The desktop app's storage location and
its whole shape change, and a `v1.6` desktop user's projects move. That is a major. The web
build is unchanged, which is worth saying plainly in the release notes rather than letting
the version number imply otherwise.

---

## 8. What the change touches

**new** did not exist before; everything else is edited in place.

```
build/
├── icon-document.png       new   master for the document icon
└── document.icns / .ico    new   generated alongside the app icon
src/
├── main/
│   ├── document.ts         new   read/write/stat the open document: atomic, stamped
│   ├── openRequests.ts     new   open-file, argv, second-instance, drop → one message (D15)
│   ├── recent.ts           new   recent documents in userData (D16)
│   ├── windowState.ts            + the last document's path (D11)
│   ├── menu.ts                   File menu: New…, Open…, Open Recent ▸, Close Document
│   ├── dialogs.ts                unchanged — exports still go through it
│   └── index.ts                  launch-with-a-file, and reopen-last
├── preload/index.ts              + window.api.document
├── shared/
│   ├── api.ts / ipc.ts           + the document surface and its channels
│   ├── menu.ts                   + Close Document, and the File menu's new items
│   └── document.ts         new   Stamp, request/response types
└── renderer/src/
    ├── persistence/
    │   ├── store.ts        new   ProjectStore + ProjectLibrary (D1)
    │   ├── browserStore.ts new   today's repository behind the port
    │   ├── documentStore.ts new  the port over window.api.document
    │   ├── repository.ts         stays as the localStorage mechanics browserStore uses
    │   └── preferences.ts        unchanged — preferences stay in localStorage in both shells
    ├── domain/
    │   ├── serialization.ts      the git-first formatter (D4)
    │   └── share.ts              share links rooted at the web app (D21)
    ├── stores/projects.ts        async throughout; open/save/rename return promises
    ├── views/
    │   ├── StartView.vue   new   the desktop launcher (D12)
    │   ├── ProjectManagerView.vue  untouched — the web build's home
    │   └── EditorView.vue        async open; loading and missing-file states; the document
    │                             name and modified indicator in the header
    ├── router/index.ts           the home route picked from isDesktop() (D13)
    ├── utils/shortcuts.ts        `back` → Close Document on the desktop (D14)
    ├── utils/documents.ts  new   external-change handling and the conflict prompt (D7)
    └── utils/strings.ts    new   the words that differ per shell
```

Tests: the renderer suite runs in jsdom and cannot reach `src/main`. Phase F3 adds a second
vitest project with `environment: 'node'` over `src/main/**`, because the atomic write, the
stamp guard and the filename derivation are exactly the kind of logic that should not be
verified only by driving the app.

---

## 9. Per-app values

Everything that differs between the repos. Every other instruction in this document is
identical for both.

| | TMS9918 Editor | VIC-20 Editor |
| --- | --- | --- |
| Document extension (written) | `.tms9918` | `.vic20` |
| Also opened, forever (v1 exports) | `.tms9918.json` | `.vic20.json` |
| macOS UTI | `com.acwright.tms9918editor.project` | `com.acwright.vic20editor.project` |
| MIME type | `application/x-tms9918-project` | `application/x-vic20-project` |
| Migration target folder | `~/Documents/TMS9918 Editor` | `~/Documents/VIC-20 Editor` |
| Published web app (D21 share root) | GitHub Pages URL for `TMS9918-EDITOR` | GitHub Pages URL for `VIC-EDITOR` |
| Screen row chunking (D4) | the mode's column count (40 / 32 / 64) | `settings.columns` |
| Storage key prefix (web + preferences, unchanged) | `tms9918-editor:` | `vic20-editor:` |
| Current version | `1.6.1` | `1.6.1` |

`~/Documents` is `app.getPath('documents')`; the migration folder is created if missing.

**The document icon is a design item, not a config line.** It should read as a document
containing the app's subject rather than as a second app icon. The existing
`scripts/generate-icons.mjs` and `build/gen-icon.mjs` pipeline is extended to emit a second
set from a second master.

---

## 10. Phases

Nine phases. Each leaves both builds green and shippable; no phase needs a later one to make
the repo work again. F1 and F2 are renderer-only and change no behaviour — deliberately, so
the async conversion and the format change are each verified alone before anything touches a
disk.

### Phase F0 — Spikes

**Goal:** the five questions in §6 answered, and §6 rewritten with what was measured.

- [ ] S1 — double-click on all three platforms, cold start and running app
- [ ] S2 — macOS `open-file` versus `whenReady`
- [ ] S3 — what sees a `git checkout`, on macOS at minimum
- [ ] S4 — what a bare extension costs in git, VS Code and GitHub
- [ ] S5 — `webUtils.getPathForFile` on Electron 43

**Exit criteria:** every assumption in §6 is a measurement or a documented failure to
measure. **S1 is go/no-go**: without the double-click this plan has given up the project list
for nothing, and the decision in §3 should be reopened with the user rather than worked
around.

### Phase F1 — The storage port (renderer only, no behaviour change)

**Goal:** storage is async and behind an interface, with `localStorage` still the only
implementation. Both builds behave exactly as they do today.

- [ ] `persistence/store.ts` — `ProjectStore` and `ProjectLibrary` (D1)
- [ ] `persistence/browserStore.ts` — today's repository behind the port, including `rename`
      and `duplicate` moved down from the Pinia store
- [ ] `stores/projects.ts` — async throughout: `open`, `create`, `createFrom`, `rename`,
      `duplicate`, `remove`, `importProject`, `adopt`, `saveCurrent`, `flushAutosave`
- [ ] The before-quit path: `onBeforeQuit` must now `await` the flush before calling
      `saveComplete()`. Main's 5-second safety valve stays as it is
- [ ] `EditorView` — the `projectId` watcher awaits `open`; add a loading state and a "this
      project could not be opened" state that offers the way back
- [ ] `ProjectManagerView` — awaits `refresh`, `create`, `duplicate`, `remove`
- [ ] One spec suite written against the *port*, run against `browserStore`, so F3's adapter
      inherits it

**Exit criteria:** the full suite green, both builds green, and in the running desktop app an
edit made a fraction of a second before ⌘Q is still on disk after a relaunch — the check the
shell's own phases used, because the flush is what this phase is most likely to break.

### Phase F2 — Git-first serialization

**Goal:** one serialization, formatted for diffs, used by downloads now and by disk writes in
F3.

- [ ] `serializeProject` per D4: fixed key order, one character per line, one screen row per
      line, LF, trailing newline
- [ ] Round-trip specs: `deserialize(serialize(p))` deep-equals `p`, and
      `serialize(deserialize(text))` is byte-identical to `text` for a file the app wrote
- [ ] Stability spec: two projects built the same way serialize identically regardless of key
      insertion order
- [ ] A golden file per mode in both repos, so a formatting regression shows up as a diff
- [ ] Re-measure §5's table with the real serializer and update it
- [ ] Content hash excluding `modifiedAt`, and D5's early return, in the store
- [ ] `saveCurrent()` stops stamping `modifiedAt` unconditionally

**Exit criteria:** a project downloaded from the web build and one written by the desktop app
are byte-identical; editing one character and saving produces a one-line diff; saving a
project nobody edited produces no write at all.

### Phase F3 — Documents on disk

**Goal:** the desktop app opens, edits and saves a project file. `localStorage` is no longer
the desktop's project storage.

- [ ] `src/main/document.ts` — `read`, `write` (atomic, stamped), `create`, `pick`, `reveal`,
      holding the open document so the renderer never names a path (D8)
- [ ] `src/shared/document.ts`, the channels, the preload surface
- [ ] `persistence/documentStore.ts` — the port over `window.api.document`
- [ ] `StartView.vue`, and the router's `isDesktop()` home route (D12, D13)
- [ ] `EditorView` — the document's name and a modified indicator in the header, since no
      list view carries them any more; a missing-or-unreadable state that offers the start
      screen
- [ ] `back` becomes *Close Document* on the desktop; the shortcut map grows its shell
      predicate and `menu.spec.ts` covers it (D14)
- [ ] *New…* grows a location field (D10); *New from Sample…* uses the same dialog
- [ ] Node-environment vitest project over `src/main/**`

**Exit criteria, verified in the running app** (the standard `CLAUDE.md` sets): *New…* writes
a file where it said it would and lands in the editor in the right mode; editing a character
changes the file on disk; ⌘R returns to the same document; *Open…* opens both a `.tms9918`
and a legacy `.tms9918.json`; a file edited by hand in a text editor opens; a deliberately
corrupt file reports why rather than opening blank.

### Phase F4 — Double-click

**Goal:** the operating system opens the editor when a project file is opened.

- [ ] Document icon: a second master and a second `gen-icon` output
- [ ] `fileAssociations` in `electron-builder.yml` for all three platforms
- [ ] `openRequests.ts` — `open-file`, `argv`, `second-instance`, drag-and-drop, all reduced
      to one main→renderer message (D15); macOS queueing per S2; the drop path per S5
- [ ] Opening a document while one is open flushes the current one first, then replaces it
- [ ] Reopen-the-last-document on launch (D11), and recents (D16) in the File menu and on the
      start screen

**Exit criteria:** double-clicking a document from each platform's file manager opens the
editor in the right mode, from a cold start and while already running; `open <file>` and
`<app> <file>` from a shell do the same; a dropped file opens; quitting with a document open
and relaunching returns to it; the document icon is what Finder and Explorer show.

### Phase F5 — Living in a git worktree

**Goal:** switching branches under the editor does the right thing, in both directions.

- [ ] Detection per S3: focus + `stat` always; a watcher only if the spike earned it
- [ ] The stamp guard on every write, and the conflict answer it returns (D6)
- [ ] Clean document + changed file → reload in place, with a quiet "Reloaded from disk"
- [ ] Dirty document + changed file → a dialog naming both sides; taking the file discards
      the edit, and the dialog says so
- [ ] Deleted or moved file → the editor says so rather than silently recreating it on the
      next autosave tick

**Exit criteria, verified against a real repository:** a `git checkout` of a branch where the
open document differs reloads the editor with the branch's version; the same with an unsaved
edit in flight prompts and never writes over the checkout; `git stash`, `git checkout .` and
deleting the file behind the app's back all behave.

### Phase F6 — Migration and first run

**Goal:** nobody loses anything, and everybody knows where their projects are.

- [ ] First `v2.0.0` desktop launch with projects in `localStorage`: a sheet explaining what
      is about to happen, then one file per project in the chosen folder, then recents seeded
      with them, then a marker so it happens once (D19)
- [ ] Name collisions get suffixes; a project that fails validation is reported by name and
      skipped, not silently dropped
- [ ] The originals stay. A "Remove browser-stored copies" action, offered after a successful
      migration and never automatic
- [ ] Migration specs against a seeded storage stub, including the corrupt-entry case
- [ ] Web build: the manager says where projects live and what clearing browsing data does,
      and points at the desktop app for people who want files (D20)

**Exit criteria:** a `v1.6.1` desktop profile with several projects — including one corrupt
entry — upgrades to `v2.0.0` with every valid project written as a file and reachable from
recents, the corrupt one named, and `localStorage` untouched. Downgrading to `v1.6.1` still
shows the old list.

### Phase F7 — The desktop file affordances

**Goal:** the app says desktop words and offers desktop commands.

- [ ] File menu: New…, New from Sample…, Open…, Open Recent ▸, Close Document, Save,
      Save a Copy…, Reveal in Finder / Show in Explorer / Show in Files
- [ ] `utils/strings.ts` — *Upload Project* → *Open…*, *Download* → *Save a Copy…*, and the
      editor header's "Back to Projects" → "Close Document". This is the wording fork the
      shell's own plan deferred; it stays out of the views
- [ ] Share links from the desktop resolve against the published web app (D21)

**Exit criteria:** every File menu item works from the menu in both apps; Open Recent survives
a restart and drops files that were deleted; a share link copied on the desktop opens the web
app with the project in it.

### Phase F8 — Docs and release

**Goal:** `v2.0.0` in both repos, and documentation that describes the app that now exists.

- [ ] README in both: the desktop section rewritten around documents and double-click; the web
      section says plainly that projects live in the browser. Two existing claims go with it —
      that the menu carries "the keyboard map as accelerators" (it deliberately carries no
      accelerators), and that the desktop app is the same views as the web (now "the same
      tree, two entry points", §4)
- [ ] `CLAUDE.md` in both: the port and its split, the git-first format, the stamp rule, the
      renderer-never-names-a-path invariant, and the router's one shell fork — the things a
      future session must not "clean up"
- [ ] `2.0.0` in `package.json`, both repos; tag and release with all four artifacts each
- [ ] Release notes lead with what a desktop user must know: that projects are now files,
      where the old ones were copied to, that they were copied and not moved, and that the web
      app is unchanged

**Exit criteria:** both repos tagged `v2.0.0`, artifacts published, Pages deploy green, and a
fresh install on each platform opens a document by double-click and edits it.

---

## 11. Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| A file association does not work on some platform, and the round has traded away the list for nothing | Medium | S1 is go/no-go *before* F3 builds anything on it; §3's decision reopens with the user rather than being worked around |
| The async conversion breaks the before-quit flush, and the failure is silent — an edit lost only on quit | Medium | F1 does the conversion alone, with no storage change under it, and re-runs the shell's own flush check in the running app |
| A debounced autosave overwrites a `git checkout` | Medium | D6's stamp guard: every write states what it expects to find, and main refuses when the file moved. F5 verifies against a real repository |
| Losing the project list is regretted after release | Medium | It is the explicit trade (§3, §4); §12's sibling-documents item restores most of it cheaply if it is missed |
| One window becomes the standing complaint | Medium | Stated up front (§4, D17); multi-window is §12's first item and nothing here blocks it |
| The web/desktop view fork spreads beyond the router | Medium | D13 confines it to the home route; the rule that survives is that no *component* branches on the shell |
| `fs.watch` behaves differently on three platforms | High | S3 decides; focus + `stat` ships regardless and is the mechanism the app relies on |
| Migration writes the files wrong and the user has no way back | Low | D19 copies rather than moves, and the sheet says the originals are still in the browser store |
| The bare extension annoys in day-to-day use | Low | S4 measures it; the fix is one line in the user's own `.gitattributes` |
| Two repos, one plan, divergent execution | Medium | Identical copies of this file, per-app values confined to §9, both repos moved phase by phase rather than one racing ahead |

---

## 12. Deferred / future work

Considered and out of scope, so it is clear they were not overlooked:

- **Multiple windows**, one document each. The first thing to want here, and the plan's
  most-felt limitation (§4). Needs per-window menu context — `setMenuContext` is app-wide
  today — per-window state and quit coordination.
- **Sibling documents.** A list of the other project files in the *same directory as the open
  document* — no workspace to choose and no configuration, just a `readdir` of
  `dirname(path)` filtered by extension. It restores most of what the project list did for
  the cost of a few lines, and is the obvious answer if the missing list turns out to be
  missed. Deliberately not in this round: it should be built when it is wanted, not on
  speculation.
- **A web document adapter** over the File System Access API, if support ever becomes
  universal enough for it to be the *only* web path. D1's port is shaped to take a third
  adapter.
- **File → Open Folder**, opening the first document in a directory. This is where the
  rejected workspace shapes start to creep back in; worth resisting unless asked for.
- **A merge driver or `.gitattributes` guidance** for project files. Conflicts in a 2000-line
  charset are readable with D4's format but not mergeable.
- **Export every project in a directory as assembly** — the obvious next thing to want from a
  build-integrated editor, and a round of its own.
- **Watching for external change while the app is in the background**, rather than catching up
  on focus. Only worth it if S3 shows a watcher is reliable everywhere.
- **A shared package** for the storage layer both editors now duplicate — the same call the
  shell's plan made about the shell, and the same answer: worth it only if a third editor
  appears.
