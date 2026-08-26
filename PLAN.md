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

- **Status: this plan is done. `v2.0.0` shipped from both repos.** Phase F8
  rewrote both READMEs around documents and double-click and said plainly that
  the web build keeps projects in the browser; it retired two claims that were
  no longer true — that the menu carries "the keyboard map as accelerators"
  (it deliberately carries none) and that the two shells are the same view tree
  (now "the same tree, two entry points", §4) — and it fixed both READMEs'
  links to the removed `ELECTRON-PLAN.md`. `CLAUDE.md` in both repos gained a
  *Storage* section holding the five rules a future session must not tidy away:
  the split port, the renderer-never-names-a-path invariant, the stamp guard,
  the git-first format, and the watch-the-directory measurement. The macOS
  builds of both apps were run from their own dmgs and open a document through
  the OS's own `open-file` path; the phase notes below say what that measured
  and what it could not. Windows and Linux double-click remains **declared and
  not driven** — the position S1 and §11 have held since F0.
- Phase F6 before it made sure a `v1.6` desktop user's projects are no
  longer trapped in browser storage. The first `v2.0` launch says what is about
  to happen, copies each project into the app's own folder in `~/Documents`
  (§9) — a name already taken gets a number, a project that cannot be read is
  named and skipped — seeds Recent Documents so they are reachable with no list
  view to find them in, and sets a marker so it happens once. **Nothing is moved:** the
  originals stay until *Remove Browser Copies* is pressed, and only the copies
  that were actually written are ever removed. The web build gains the honesty
  half of D20: the manager now says where projects live, what clearing browsing
  data does, and where the desktop app is.
- Phase F5 before it made the editor live in a git worktree without fighting
  it. A `git checkout` under a clean document reloads it in place and says so
  quietly; one under an unsaved edit asks, naming both versions, and writes
  nothing until it is answered. Every write states the stamp it expects and main
  refuses the ones whose file has moved (D6) — measured against a real
  repository, with the autosave firing 500 ms into a branch switch and the
  checkout still whole afterwards. A file deleted behind the app's back is
  reported rather than silently recreated. Detection is S3's: a non-recursive
  watch on the document's *directory*, plus a `stat` on focus.
- Phase F4 before it made the operating system open the editor. A
  `.tms9918` file carries its own icon, its own named type, and a double-click
  launches straight into it — cold, or into the app already running. Every way a
  document can arrive is one path (D15): `open-file`, `argv`, `second-instance`,
  a drop, the Open dialog, Open Recent and the reopen-at-launch all end in
  `openRequests.ts`, which announces rather than adopts. The renderer flushes
  what it holds into the *old* file and only then takes the new one, which is
  what D17 actually is. Recents are in the File menu and on the start screen
  (D16), and quitting with a document open returns to it (D11).
- Phase F3 before it made the desktop app open, edit and save a *file*.
  `src/main/document.ts` owns the open document — atomic writes, a stamp on every
  read and write, and the renderer never naming a path (D6, D8). `documentStore.ts`
  puts that behind the same `ProjectStore` port the browser adapter implements, so
  `stores/projects.ts` still has one `load` and one `save`; the shells differ only
  in the surface *around* them. `/` routes to `StartView` on the desktop and to the
  untouched `ProjectManagerView` in the browser, decided once in the router (D13),
  and `back` is *Close Document* there (D14). `localStorage` is no longer the
  desktop's project storage.
- Phase F2 before it gave both repos one serialization — `serializeProject`, git-first per D4
  — with golden documents per mode holding the format still, and D5's early return so a
  project nobody edited is not written and its stamp does not churn.
- Phase F1 before it put storage behind the async `ProjectStore` / `ProjectLibrary` port
  (D1), with `localStorage` still the only implementation. Phase F0 before *that* left §6 as
  measurements rather than assumptions, including the two things this document had wrong
  (macOS gets no exported UTI, and a watch on the open *file* is single-shot); the spikes'
  temporary `fileAssociations` were reverted on purpose, so that neither app declares a
  document type it cannot yet open — F4 added the declaration and the handler together.
- **S1 is GO on macOS and Linux and unverified on Windows**, so §3's decision stands and is
  not reopened. Windows is the one platform where the double-click is still taken on trust,
  and it is a real Windows job (§6, §11).
- **Last updated:** 2026-08-23 (`v2.0.0` released)
- Baseline: `v1.6.1` in both repos. Electron 43.4.1, `electron-vite@6.0.0-beta.1`, Vite 8,
  Vue 3 + Pinia, `vue-router` 5.
- **Three shapes for this change were written up and compared before this one was chosen**
  — a workspace folder, a workspace file, and this. §3 records what the other two were and
  why they lost; the full documents are in this conversation's history and not in the repo.
- The desktop shell itself shipped as `v1.6.0` under `ELECTRON-PLAN.md`, which deferred
  exactly this round as "Native project files" (its D4). That document was removed once its
  work shipped; what survived it is the load-bearing list in `CLAUDE.md`, and the rest is in
  the git history.
- Target: **`v2.0.0` in both repos**, released together (D22, Phase F8) — **shipped**.

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

## 5. Measured

What a document costs to write, since autosave writes one every 500 ms of editing.
**Re-measured in Phase F2 with the shipped `serializeProject`**, through each repo's own
vitest runner, on synthesized **full-size** projects — every character filled, every screen
cell set. These numbers replace F0's, which came from a stand-in implementation of D4's
rules in plain node; the shape held, the sizes and the times did not.

TMS9918 Editor:

| Project | Lines | Formatted | Compact | Format time |
| --- | --- | --- | --- | --- |
| Graphics II independent (3 charsets, 1 screen) | 1,596 | 169 KB | 115 KB | 5.6 ms |
| Graphics II mirrored (1 charset, 2 screens) | 593 | 61 KB | 41 KB | 2.0 ms |
| Graphics I (1 charset, 1 screen) | 336 | 13 KB | 8 KB | 0.4 ms |
| Text (1 charset, 1 screen 40×24) | 304 | 12 KB | 8 KB | 0.5 ms |
| Multicolor (1 screen 64×48) | 68 | 10 KB | 6 KB | 0.4 ms |
| Sprite (256 patterns, no screen) | 301 | 10 KB | 6 KB | 0.4 ms |

VIC-20 Editor — smaller documents throughout: one charset, one screen, and no colour table
to speak of, so nothing here approaches Graphics II's three sets of per-row colour pairs.

| Project | Lines | Formatted | Compact | Format time |
| --- | --- | --- | --- | --- |
| Mixed, 256 chars × 16 rows, 22 × 23 screen | 353 | 21 KB | 14 KB | 0.7 ms |
| Hires, 256 chars × 8 rows, 22 × 23 screen | 335 | 12 KB | 8 KB | 0.4 ms |
| Hires, 64 chars × 8 rows, 20 × 12 screen | 121 | 4 KB | 3 KB | 0.1 ms |

Three conclusions:

1. **Write cost is a non-issue, with an order of magnitude less headroom than F0 thought.**
   The largest document either app can produce formats in **5.6 ms**, not 0.4 — the real
   serializer walks the tree and builds strings where the stand-in did not. D5's hash
   serializes a second time, so an autosave tick that *writes* costs ~11 ms against a 500 ms
   debounce. That is still 45× headroom, on the largest document of the more complex of the
   two apps, and D5's elision means most ticks serialize once and write nothing at all. Not
   a concern; worth knowing it is 45× and not 1,000×.
2. **D4's chunking is load-bearing, not cosmetic.** The same Graphics II project through a
   naive `JSON.stringify(p, null, 2)` is **34,596 lines and 0.49 MB**; chunked to one
   character and one screen row per line it is **1,596 lines and 169 KB**. 22× fewer lines
   and 3.0× smaller. It is 47% larger than compact JSON rather than F0's guessed 13% —
   indentation and the space after every comma cost more than the stand-in charged for —
   and 47% of a document nobody will notice is the right trade for 22× fewer lines.
3. **The one-character edit is a two-line diff, not a one-line diff.** `git diff --numstat`
   on a Graphics II document before and after one character's pattern changed reported
   `2 2` — the character, and `modifiedAt`. The second line is D5 working as intended
   (`modifiedAt` moves when content moves) rather than noise, and `2 2` rather than `- -`
   is git confirming it reads the document as text (S4).

---

## 6. Questions settled

All five spikes were run on **2026-08-23**: macOS 26.5.2 (arm64), Electron 43.4.1, Node
26.4.0, git 2.50.1, Wine 11.0, and Debian bookworm under Docker. Each was run against both
repos where the answer could differ. What follows is what was measured; where something
could not be measured, it says so rather than rounding up.

### S1 — Do file associations work, end to end, on all three platforms? — **GO**

**macOS — verified in the running app.** `fileAssociations` produces a
`CFBundleDocumentTypes` entry with the bare extension, `CFBundleTypeRole: Editor` and
`LSHandlerRank: Owner`. Opening a document through LaunchServices — the same binding a
Finder double-click resolves — launched the app from a cold start *and* delivered a second
document to the already-running instance. `NSWorkspace.urlForApplication(toOpen:)`, the API
Finder consults to pick a handler, resolved the document to the app.

Two things the spike found that the plan had wrong or had not considered:

- **electron-builder emits no `UTExportedTypeDeclarations`** — only `CFBundleDocumentTypes`.
  This spike's own premise ("plus an exported UTI") was wrong. The association still works,
  but the document resolves to a *dynamic* UTI (`dyn.ah62d4rv4ge81k5pxhe6xcsa`), which is a
  type with no name and no identity of its own. **F4 must declare the UTI from §9 through
  `mac.extendInfo`** if the document type is to be named and to carry its own icon.
- **Paths arrive fully resolved.** `open-file` delivered `/private/tmp/…`, not `/tmp/…`, and
  S5's drop path resolves the same way. Anything that compares a remembered path with an
  incoming one — recents, "is this already open?", the stamp guard — must compare resolved
  paths or it will miss matches.

**Linux — verified against an installed package, short of a GUI click.** The deb carries a
`.desktop` entry with `MimeType=application/x-…-project;` and `Exec="…" %U`, plus a MIME
package declaring `<glob pattern="*.tms9918"/>` / `*.vic20`. After the `update-mime-database`
and `update-desktop-database` a real install runs, `xdg-mime query filetype` returned the
project MIME type and `xdg-mime query default` returned the editor's `.desktop` file, and the
entry passes `desktop-file-validate`. What was **not** measured is an actual double-click in
a GUI file manager — the container has no desktop session — but the two queries above are
precisely what a file manager consults.

**Windows — not measured, and it is the one platform still open.** The NSIS installer builds
under Wine but cannot be *run* there: it exited 0 and installed nothing, which is
`CLAUDE.md`'s standing example rather than a new finding. Modern 7-Zip no longer decompiles
NSIS scripts, so the compiled artifact could not be inspected either. At source level,
electron-builder emits a `registerFileAssociations` macro whenever `fileAssociations` is
non-empty, `installSection.nsh` inserts it unconditionally, and `APP_ASSOCIATE` writes the
extension and its file class under `SHELL_CONTEXT\Software\Classes`. Worth noting because the
documentation misleads: electron-builder's own docs say associations "work only if
`nsis.perMachine` is set to `true`", and the code does not say that — with `oneClick: false`
the assisted installer already establishes the shell context. **Testing this is a real
Windows job**, and it is the one part of S1 taken on trust.

**A cost D3 should state plainly:** the legacy compound extension is associated *nowhere*.
`.tms9918.json` / `.vic20.json` resolves to `application/json` on Linux and to whatever owns
`.json` on macOS (Xcode, on the machine this was run on). Legacy files open through *Open…*
and by drag-and-drop, and never by double-click. That is a consequence of D3, not a defect —
but it is the honest half of "existing files stay valid forever".

### S2 — Does macOS `open-file` arrive before `whenReady`? — **Yes. It must be queued.**

Measured on a cold start, with the handler registered at module scope:

```
+  0ms  module eval             argv=[]   ready=false
+ 18ms  will-finish-launching
+ 72ms  open-file  …/Star Voyager.tms9918   app.isReady()=false   window=false
+ 72ms  whenReady RESOLVED
```

The VIC-20 editor produced the same shape (`open-file` at +81ms). Three consequences:

- **`open-file` fires before `whenReady` and before any window exists.** The plan's working
  assumption was right and is now a measurement: **queue the path and replay it once the
  window exists.** The failure mode this rules out — "the first double-click does nothing" —
  is real and would have shipped without the queue.
- **The handler must be registered at module scope.** Registering it inside
  `whenReady().then()` would miss the cold-start event entirely.
- **`argv` is empty on macOS.** The document arrives *only* through `open-file`. argv is the
  Windows and Linux mechanism (`Exec=… %U`), never macOS's — so D15's one code path must not
  read argv on darwin, or a cold-start double-click would open nothing.

Opening a second document while the app was already running delivered `open-file` with
`app.isReady()=true` and a window present, to the same instance — no second process.

### S3 — What sees a `git checkout`? — **Watch the directory, not the file.**

Ten trials per row, on macOS/APFS, against a real repository whose branches differ in the
open document:

| | reported the checkout | still alive for the *next* write |
| --- | --- | --- |
| `fs.watch(<the document>)` | 10/10 | **0/10** |
| `fs.watch(dirname(document))` | 10/10 | 10/10 |

- **git replaces the document rather than rewriting it** — the inode changes across a branch
  switch — and a watch on the file is therefore **single-shot**: it reports the checkout that
  kills it and then sees nothing, silently, forever. That is worse than unreliable, and it is
  why a file watcher cannot be the mechanism.
- **A non-recursive watch on `dirname(document)`, filtered by basename, survives everything
  and is quiet.** One branch switch touching 21 files produced exactly **2** events, both
  naming the document, **0** from `.git/` and **0** from `src/` — subdirectory churn does not
  reach a non-recursive watch.
- **Event names carry no information on macOS.** FSEvents reports `rename` even for an
  in-place write. Filter on the filename and treat every event as "re-stat", never as a
  description of what happened.
- **Arm latency is not a concern**: a write 0 ms after `fs.watch()` was still seen.
- **`{mtimeMs, size}` is a usable stamp.** Six same-size writes back to back produced six
  distinct `mtimeMs` values, 0.13–0.72 ms apart (APFS keeps sub-millisecond granularity), so
  D6 needs no content hash. This is an APFS answer: HFS+'s one-second granularity would not
  be enough, which is worth remembering rather than relying on.
- `git stash`, `git checkout .`, deleting the file and recreating it all produced directory
  events and a `stat` change.

**Focus + `stat` still ships regardless**, exactly as the plan said. The directory watcher is
an optimisation on top of it. Two implementation notes it earns: the watch is per *directory*,
so it must be re-armed when the open document moves to another one, and a watcher's event is
a hint to re-stat, never evidence of what changed.

### S4 — What does a bare extension cost in practice? — **Highlighting only.**

- **git treats it as text, and D4's format pays off.** A 295-line document with one
  character's pattern changed produced a **one-line diff**; `git diff --numstat` reported
  `1  1`, not the `-  -` it prints for binary. The document holds zero NUL bytes, so git's
  binary heuristic never trips, and `* text=auto eol=lf` applies exactly as it does to any
  other file in the repo.
- **VS Code 1.134.0 shows it as Plain Text.** Nothing in the bundled extension set claims
  `.tms9918` or `.vic20`; the `json` extension claims `.json` and twelve others. So a
  document opens with no highlighting, no folding and no bracket matching. The user's fix is
  `"files.associations": { "*.tms9918": "json" }`.
- **GitHub renders it as plain text.** Linguist's current `languages.yml` declares neither
  extension, so a document is shown unhighlighted and excluded from the repository's language
  statistics. The `linguist-language` override is documented in linguist's `overrides.md`,
  and git honours the attribute — `git check-attr` returned `linguist-language: JSON` with
  the one-line rule in place. **Not verified:** GitHub's actual rendering, which needs a
  pushed repository.
- The legacy `.tms9918.json` keeps JSON treatment everywhere, since `.json` is claimed by
  both linguist and VS Code.

**So D3 stands, and should recommend** `*.tms9918 linguist-language=JSON` in the user's own
`.gitattributes` — one documented line, still never written by the app.

### S5 — `webUtils.getPathForFile` on Electron 43 — **Yes, from the preload.**

Measured against a **real drop**, synthesized through the debugger's
`Input.dispatchDragEvent` with a file path and cross-checked with `DOM.setFileInputFiles`, on
Electron 43.4.1 in the app's real posture (ESM preload, `contextIsolation: true`,
`sandbox: false`):

- `webUtils` is **`undefined` in the main process** — it is a renderer-side export, so main
  cannot call it.
- In the **preload** it is an object and `getPathForFile` is a function. It returned the
  correct absolute path for a genuinely dropped file, including one whose name contains a
  space.
- The isolated renderer world has no `require` and no electron global, so it cannot reach
  `webUtils` itself. **The call therefore happens in the preload and only the resulting
  string crosses the bridge** — which is exactly D8's shape: the renderer never derives a
  path, it forwards one the user just produced.
- `File.path` is `undefined`, confirming it is gone.
- The path comes back fully resolved, as in S1.

### A harness note worth keeping

Every macOS launch measurement failed at first in a way that looked like a broken app: the
icon bounced in the Dock and the process exited cleanly, with no window, no log and no crash
report. The cause was **`ELECTRON_RUN_AS_NODE=1` set in the shell that ran the spike** —
which `CLAUDE.md` already warns about for `npm run dev`, but which also poisons `open`: the
launched app runs as plain Node and exits immediately. `env -u ELECTRON_RUN_AS_NODE open
<file>` is the fix. Any future launch test should compare `launchctl getenv
ELECTRON_RUN_AS_NODE` with the shell's own value before concluding anything about the app.

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
- **Keys in a fixed order** — the schema's own order, which is the one place the two apps'
  documents differ (§9). `JSON.stringify` preserves insertion order, so without this the
  same project serializes differently depending on whether it came from `createProject` or
  from a file someone else wrote. A key the order does not name is kept, after the ones it
  does, sorted — a hand-edited document must not lose anything by being reformatted.
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
accelerator fires the item *and* still delivers the keydown to the page. *(Amended after
`v2.0.0`: File ▸ Save prints ⌘S, the one place where firing twice and firing into a text
field are both harmless. The rule and its exception are in `CLAUDE.md`.)*

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
│   ├── documentFile.ts     new   the file mechanics, with no Electron in them
│   ├── documentWatch.ts    new   the directory watch that sees a `git checkout` (D7, S3)
│   ├── openRequests.ts     new   open-file, argv, second-instance, drop → one message (D15)
│   ├── recent.ts           new   recent documents in userData (D16)
│   ├── migration.ts        new   write the copies, seed recents, hold the marker (D19)
│   ├── windowState.ts            + the last document's path (D11)
│   ├── menu.ts                   the File menu, Open… and Reveal among it (F7)
│   ├── dialogs.ts                + the document type's own filter row (F7)
│   └── index.ts                  launch-with-a-file, and reopen-last
├── preload/index.ts              + window.api.document
├── shared/
│   ├── api.ts / ipc.ts           + the document surface and its channels
│   ├── menu.ts                   + Close Document, Save a Copy…, the samples (D14, F7)
│   └── document.ts         new   Stamp, request/response types
└── renderer/src/
    ├── persistence/
    │   ├── store.ts        new   ProjectStore + ProjectLibrary (D1)
    │   ├── browserStore.ts new   today's repository behind the port
    │   ├── documentStore.ts new  the port over window.api.document
    │   ├── migration.ts    new   read localStorage, hand it to main, once (D19)
    │   ├── repository.ts         stays as the localStorage mechanics browserStore uses
    │   └── preferences.ts        unchanged — preferences stay in localStorage in both shells
    ├── domain/
    │   ├── serialization.ts      the git-first formatter (D4)
    │   └── share.ts              share links rooted at the web app (D21)
    ├── stores/projects.ts        async throughout; open/save/rename return promises
    ├── components/projects/
    │   ├── DocumentConflictDialog.vue  new  the two answers to a changed file (D7)
    │   └── MigrationDialog.vue  new  what is about to happen, then what did (D19)
    ├── composables/newDocument.ts new  the New dialog, shared by the two views (F7)
    ├── views/
    │   ├── StartView.vue   new   the desktop launcher (D12)
    │   ├── ProjectManagerView.vue  untouched — the web build's home
    │   └── EditorView.vue        async open; loading and missing-file states; the document
    │                             name and modified indicator in the header
    ├── router/index.ts           the home route picked from isDesktop() (D13)
    ├── utils/shortcuts.ts        `back` → Close Document on the desktop (D14)
    ├── testing/documentBridge.ts new  one fake of main, for the three specs that need it
    ├── utils/documents.ts  — not written: external-change handling lives in the
    │                             store and the dialog above, not in a util (D7)
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
| Document key order (D4) | `… settings, charsets, colors, screens, animations` | `… settings, charset, charModes, screens` |
| Storage key prefix (web + preferences, unchanged) | `tms9918-editor:` | `vic20-editor:` |
| Current version | `2.0.0` | `2.0.0` |

`~/Documents` is `app.getPath('documents')`; the migration folder is created if missing.

**The document icon is a design item, not a config line.** It should read as a document
containing the app's subject rather than as a second app icon. The existing
`scripts/generate-icons.mjs` and `build/gen-icon.mjs` pipeline is extended to emit a second
set from a second master.

---

## 10. Phases

Nine phases. Each leaves both builds green and shippable; no phase needs a later one to make
the repo work again. F1 and F2 are renderer-only — deliberately, so the async conversion and the
format change are each verified alone before anything touches a disk. Neither changes what a
user sees; F2 does change what a *download* contains, and what an idle autosave tick does,
which is the point of it.

### Phase F0 — Spikes

**Goal:** the five questions in §6 answered, and §6 rewritten with what was measured.

- [x] S1 — double-click on all three platforms, cold start and running app
- [x] S2 — macOS `open-file` versus `whenReady`
- [x] S3 — what sees a `git checkout`, on macOS at minimum
- [x] S4 — what a bare extension costs in git, VS Code and GitHub
- [x] S5 — `webUtils.getPathForFile` on Electron 43

**Exit criteria: met.** §6 is measurements, and the one thing that could not be measured —
the Windows double-click, because the NSIS installer cannot run under Wine — says so in
place of a claim. **S1 came back GO**: the double-click works from a cold start and against
a running app on macOS, and the MIME association resolves to the editor on Linux, so the
trade §3 made stands and is not reopened.

What F0 changed downstream, all recorded in §6 and carried into the phases that own them:
F4 must declare the macOS UTI itself and must queue `open-file`, and must not read `argv` on
darwin; F5's detection watches the document's *directory*, never the document; D3 gains the
fact that legacy `.json`-suffixed files never double-click anywhere.

### Phase F1 — The storage port (renderer only, no behaviour change)

**Goal:** storage is async and behind an interface, with `localStorage` still the only
implementation. Both builds behave exactly as they do today.

- [x] `persistence/store.ts` — `ProjectStore` and `ProjectLibrary` (D1)
- [x] `persistence/browserStore.ts` — today's repository behind the port, including `rename`
      and `duplicate` moved down from the Pinia store
- [x] `stores/projects.ts` — async throughout: `open`, `create`, `createFrom`, `rename`,
      `duplicate`, `remove`, `importProject`, `adopt`, `saveCurrent`, `flushAutosave`
- [x] The before-quit path: `onBeforeQuit` must now `await` the flush before calling
      `saveComplete()`. Main's 5-second safety valve stays as it is
- [x] `EditorView` — the `projectId` watcher awaits `open`; add a loading state and a "this
      project could not be opened" state that offers the way back
- [x] `ProjectManagerView` — awaits `refresh`, `create`, `duplicate`, `remove`
- [x] One spec suite written against the *port*, run against `browserStore`, so F3's adapter
      inherits it

**Exit criteria: met.** Both repos: full suite green (TMS9918 526, VIC-20 620), `oxlint`,
`eslint`, `vue-tsc --build`, `npm run build` and `npm run build:web` all green, and the
pre-quit edit verified **in the running desktop app** — a project made through the app's own
New Project dialog, a character filled 30 ms before the window closes (inside the 500 ms
autosave debounce), and the fill present in storage after a relaunch.

What F1 settled, for the phases that inherit it:

- **`duplicate` returns an id, not a project.** That is the port's signature (D1), so the
  Pinia action returns `Promise<string | null>` and the manager view, which never used the
  copy, is unchanged. F3's document adapter never implements it at all.
- **The port's own suite is `persistence/__tests__/storeContract.ts`**, called from
  `browserStore.spec.ts` as `describeProjectLibrary`. F3's `documentStore` calls
  `describeProjectStore` from the same file — the suite reaches for no repository, no
  `localStorage` and no path, so that it can.
- **Saves are serialised and `flushAutosave` awaits the chain.** A save queues behind
  whatever is still in flight rather than racing it, and `open`/`close` carry a token so a
  load that lost a navigation race drops its result. Both are what an awaited port needs and
  neither was necessary when storage was synchronous.
- **`AppApi.app.onBeforeQuit` now takes `() => void | Promise<void>`.** The preload does not
  await it; the renderer still signals with `saveComplete()`, and main's 5-second valve is
  unchanged.
- **`src/renderer/src/testing/project.ts` is new**, and every editor-store and
  editor-component spec uses it. Opening is async now, and those specs are about the editor
  rather than about storage, so they seed `current` directly instead of turning several
  hundred `it` blocks async. It has to keep leaving behind exactly what `open()` leaves.
- **A harness worth keeping for F3 and F5.** The running-app check drove the *built* app
  over the DevTools protocol — `electron out/main/index.js --remote-debugging-port=9222`,
  plus `--user-data-dir` pointed at a throwaway profile so the probe cannot touch the
  projects a real install holds. Two things it taught: the first page target listed is not
  yet the app's document, so wait for `readyState === 'complete'` on the `app://` origin
  before evaluating, and main's `will-navigate` handler sends an assigned `location.href`
  to the external browser — drive the router with `pushState` + a `popstate` event instead.
  The probe was run with a **negative control**: with a 300 ms delay spiked into the
  adapter's `save`, the awaited flush keeps the edit and an un-awaited one loses it, so the
  check can tell a working flush from a broken one. Both spikes were reverted and the
  measurement re-run on the shipped code. The `ELECTRON_RUN_AS_NODE` trap in §6's harness
  note applies here too.

### Phase F2 — Git-first serialization

**Goal:** one serialization, formatted for diffs, used by downloads now and by disk writes in
F3.

- [x] `serializeProject` per D4: fixed key order, one character per line, one screen row per
      line, LF, trailing newline
- [x] Round-trip specs: `deserialize(serialize(p))` deep-equals `p`, and
      `serialize(deserialize(text))` is byte-identical to `text` for a file the app wrote
- [x] Stability spec: two projects built the same way serialize identically regardless of key
      insertion order
- [x] A golden file per mode in both repos, so a formatting regression shows up as a diff
- [x] Re-measure §5's table with the real serializer and update it
- [x] Content hash excluding `modifiedAt`, and D5's early return, in the store
- [x] `saveCurrent()` stops stamping `modifiedAt` unconditionally

**Exit criteria: met, with one number corrected.** Both repos: full suite green (TMS9918 553,
VIC-20 643), `oxlint`, `eslint`, `vue-tsc --build`, `npm run build` and `npm run build:web`
all green. Saving a project nobody edited produces no write at all — asserted against a spy
on `localStorage.setItem`, with `modifiedAt` unmoved. Editing one character and saving
produces a **two**-line diff, not the one-line diff this phase asked for: the character and
`modifiedAt`, measured with `git diff --numstat` (§5). That second line is D5 doing what it
says rather than a defect, and it is the honest number.

**Verified in the running desktop app**, the standard `CLAUDE.md` sets, in both repos: a
project seeded into a throwaway profile, opened in the built app, then ⌘S twice with no edit
— `modifiedAt` in storage did not move. The **negative control** ran in the same session:
Fill on the same character wrote the pattern and moved the stamp, so the check can tell a
working elision from a broken save. F1's harness carried over unchanged, `pushState` +
`popstate` and all.

**Half of the first criterion cannot be checked yet, and is not claimed.** "A project
downloaded from the web build and one written by the desktop app are byte-identical" has no
desktop write until F3; what is true today is that both shells reach the same
`serializeProject`, and there is one of them.

What F2 settled, for the phases that inherit it:

- **The formatter is table-driven, not a chain of special cases.** Two maps keyed by node
  path — `KEY_ORDER` and `LAYOUT` — and one `render` walk. What is *absent* from `LAYOUT`
  carries the rule: a character's pattern bytes and a Graphics II character's eight colour
  pairs fall through to the inline default, and that is what puts one character on one line.
  The only per-project value is the screen wrap width, which is why `serializeProject` builds
  its layout map per call.
- **Unknown keys survive.** Listed keys serialize in their listed order, and anything else
  follows, sorted. A hand-added key in a hand-edited document round-trips rather than being
  silently dropped, which "formatting is never semantic" requires.
- **`projectContentHash` is change detection, not integrity** — two 32-bit FNV-1a passes
  under different offset bases, over the document serialized with `modifiedAt` blanked. F3's
  document adapter and F5's stamp guard both want the same question answered, and this is
  where it is answered.
- **The stored hash lives in the Pinia store, beside the save chain**, because it is a fact
  about the *open* project rather than about a repository: `open` seeds it, `close` and
  `remove` clear it, `rename` re-seeds it after the flush the rename already did, and
  `writeCurrent` returns early on a match before stamping anything.
- **The golden files are documents, not snapshots** —
  `src/renderer/src/domain/__tests__/golden/*.tms9918` / `*.vic20`, six of them here and
  four there, written by fixtures with a pinned id and pinned dates. A formatting change
  shows up in review as a diff of the thing users' repositories will hold. `UPDATE_GOLDEN=1`
  rewrites them after a deliberate change.
- **`import.meta.url` is an `http://` URL under the jsdom test environment**, not a file one,
  so a spec that reads a fixture off disk resolves from `process.cwd()` — which is vitest's
  root, the repo root. F3's node-environment project will not have this problem; specs that
  stay in jsdom will.
- **The share link stays on compact `JSON.stringify`.** D4 is for files that go into a
  repository; a link is compressed bytes in a URL, where none of this would help.

### Phase F3 — Documents on disk

**Goal:** the desktop app opens, edits and saves a project file. `localStorage` is no longer
the desktop's project storage.

- [x] `src/main/document.ts` — `read`, `write` (atomic, stamped), `create`, `pick`, `reveal`,
      holding the open document so the renderer never names a path (D8)
- [x] `src/shared/document.ts`, the channels, the preload surface
- [x] `persistence/documentStore.ts` — the port over `window.api.document`
- [x] `StartView.vue`, and the router's `isDesktop()` home route (D12, D13)
- [x] `EditorView` — the document's name and a modified indicator in the header, since no
      list view carries them any more; a missing-or-unreadable state that offers the start
      screen
- [x] `back` becomes *Close Document* on the desktop; the shortcut map grows its shell
      wording and `menu.spec.ts` covers it (D14) — **wording, not a predicate**, see below
- [x] *New…* grows a location field (D10); *New from Sample…* uses the same dialog
- [x] Node-environment vitest project over `src/main/**`

**Exit criteria: met.** Both repos: full suite green (TMS9918 617, VIC-20 707), `oxlint`,
`eslint`, `vue-tsc --build`, `npm run build` and `npm run build:web` all green.

**Verified in the running desktop app**, the standard `CLAUDE.md` sets, in both repos —
driven over CDP against the built app in a throwaway profile, with the native Open dialog
driven through System Events rather than stubbed:

- *New…* showed `~/Documents` as its location, and Create wrote
  `F3 Harness Voyager.tms9918` there — the name the user typed, spaces intact — and landed
  in the editor in Graphics Mode II, with the header showing the **file's** name and the
  route id equal to the file's own `id` (D9).
- **Editing a character changed the file on disk**: `git diff --numstat` reported `2 2` —
  the character's line and `modifiedAt` — through a real file, which is F2's honest number
  measured a second way. No `.tmp` was left beside it.
- **An idle ⌘S wrote nothing**: file bytes and mtime both unmoved. D5 survives the move to
  disk. The negative control ran in the same session — pressing `F` a second time on an
  already-filled character also wrote nothing, and *Invert* on the same character wrote.
- **⌘R returned to the same document**, same route, same name, same mode: the renderer asked
  main what was open and re-read it (D9).
- ***Open…* opened a v1 `Legacy Export.tms9918.json`** under the name `Legacy Export` — the
  compound extension stripped whole, not half of it (D3).
- **A hand-edited file opened**: 4-space indent, keys reordered, and a `note` key added in a
  text editor. It opened, and after an edit rewrote it through `serializeProject` the `note`
  was **still there** and the file was back to 2-space indent. D4's "a hand-edited document
  must not lose anything by being reformatted", on disk.
- **A corrupt file reported why**: `Project "name" must be a non-empty string.` in the start
  screen's banner, and the app stayed on the launcher rather than opening blank.
- **Escape closed the document**: back to the launcher, and `window.api.document.current()`
  answered `none` — main forgot the file rather than holding it behind the start screen.

What F3 settled, for the phases that inherit it:

- **D14 is a *wording* fork, not a predicate — and that is the honest shape of it.** The
  phase asked for "a shell predicate beside the mode predicate". Every editor action means
  something in both shells; the only thing that differs is what `back` is *called*. So the
  map grew `desktopDescription`, the menu table grew `desktopLabel`, and `shell()` picks —
  once, in `utils/shortcuts.ts` and `utils/menu.ts`, so no component branches on the shell.
  A filtering predicate would have had no user until F7's desktop-only File items; adding
  the parameter early would have been dead code, and F7 is where it belongs.
- **The editor's Back/Close button takes its words from `MENU_ACTIONS`**, through a new
  `actionLabel()`. The button and its File menu item cannot say different things, and this
  is why `utils/strings.ts` is still F7's rather than half-written here.
- **`DocumentResult<T>` has three cases, not two.** `ok`, `none` and `error`: cancelling a
  dialog and a disk that said no are different, and collapsing them into `null` — the shape
  `files.save`/`files.openText` use — loses the sentence the banner wants. Main writes that
  sentence, because main is the side that knows.
- **`DocumentStore` is the mirror of `ProjectLibrary`.** D1 split the port for the browser's
  *list*; this is the desktop's *file*. `stores/projects.ts` holds `adapter` plus two narrow
  references, and a job the running shell has no answer for returns null rather than
  throwing "unsupported" — the view that would have called it is not reachable there anyway.
- **The document adapter satisfies the port's contract suite once a document is open.** That
  is the one precondition the two adapters do not share, and `documentStore.spec.ts` says so
  where it calls `describeProjectStore`.
- **The location the renderer shows never comes back to main.** *Choose Folder…* asks main
  to run the dialog; main remembers the answer and returns it *for display*; `create` then
  writes into what main is holding. The renderer displays a path and can still never name
  one (D8).
- **`documentName` is a fallback in the header, not a branch.** It is null in the browser, so
  `documentName ?? project.name` reads correctly in both shells with no `if`.
- **The temporary file lives beside the target, not in the system temp directory** — `rename`
  is atomic only within a filesystem. Both failure paths are covered in the node project:
  a write that fails leaves the old document whole, and a rename that fails leaves no `.tmp`.
- **`app.setName()` does not rename the *process*.** Driving the unpackaged app through
  System Events needs `process "Electron"`; "TMS9918 Editor" is the menu bar's name and
  System Events has never heard of it. Two more harness notes from the same session, both
  of which read as app bugs and are not: the Open dialog's **Go to Folder** field keeps what
  was typed into it last, so a script has to ⌘A before typing or the paths concatenate; and
  Go to Folder does not take when the dialog is *already showing* that directory — which it
  is on the second open, because D10's remembered location is working. Put each fixture in
  its own folder.

### Phase F4 — Double-click

**Goal:** the operating system opens the editor when a project file is opened.

- [x] Document icon: a second master and a second `gen-icon` output
- [x] `fileAssociations` in `electron-builder.yml` for all three platforms, **plus the macOS
      UTI from §9 via `mac.extendInfo`** — electron-builder emits only `CFBundleDocumentTypes`,
      so without this the document type is an unnamed dynamic UTI (S1)
- [x] `openRequests.ts` — `open-file`, `argv`, `second-instance`, drag-and-drop, all reduced
      to one main→renderer message (D15); macOS **queues `open-file` until the window exists**
      and never reads `argv` (S2); the drop path calls `webUtils.getPathForFile` in the
      preload (S5)
- [x] Opening a document while one is open flushes the current one first, then replaces it
- [x] Reopen-the-last-document on launch (D11), and recents (D16) in the File menu and on the
      start screen

**Exit criteria: met on macOS and on Linux short of a GUI click; Windows is unverified and
is not claimed.** Both repos: full suite green (TMS9918 656, VIC-20 746), `oxlint`, `eslint`,
`vue-tsc --build`, `npm run build` and `npm run build:web` all green.

**Verified in the running desktop app**, the standard `CLAUDE.md` sets — the packaged
`--dir` build, registered with LaunchServices, driven by real `open` calls and by the real
menu, with the app's own profile moved aside and restored afterwards. The list below was
run in **TMS9918**; the **VIC-20** app was then driven for the cold-start double-click, the
reopen-at-launch, the drop and Open Recent, and behaved identically — a
`Title Screen.vic20` resolved to `com.acwright.vic20editor.project`, opened cold, and came
back as "Title Screen · Mixed" after a quit and relaunch. The measurements that are about
one implementation rather than one app — the flush ordering, the corrupt-file banner — were
made once, in TMS9918, against code the two repos share line for line.

- **`mdls` on a project file answers `com.acwright.tms9918editor.project`**, with a Kind of
  "TMS9918 Editor Project" — the exported UTI is live, and S1's unnamed
  `dyn.ah62d4rv4ge81k5pxhe6xcsa` is gone. `document.icns` ships in `Contents/Resources` and
  both the type declaration and the document-type entry name it.
- **A cold-start double-click opened the document**: `open "…/Alpha Voyager.tms9918"` with
  the app not running launched it and *adopted* the file — which only happens inside
  `takePending`, so this is the renderer having asked for it, not main having guessed.
  The path was recorded fully resolved (`/private/tmp/…`), as S1 said it would be.
- **A double-click against the running app opened the second document**, in the same
  process — one instance, recents reordered newest-first.
- **Quitting and relaunching returned to the document**, in its own mode: the route was
  `/edit/bbbb…` and the header read "Beta Sprites · Sprite Mode" on the first paint. The
  launcher never appeared, because the pending document is taken before `app.mount`.
- **Closing the document and relaunching showed the launcher**: `lastDocument` went to
  `null` on close, so a document put away deliberately is not dragged back (D11).
- **The flush ordering was measured, with a negative control.** With Beta open, a fill was
  dispatched and another document asked for *inside* the 500 ms autosave window: Beta's file
  changed on disk and Alpha's did not, and the editor then showed Alpha. The control ran in
  the same session — with Alpha open, an edit changed Alpha and left Beta alone — so the
  measurement can tell which file a write lands in.
- **File ▸ Open Recent listed both documents and opened the one clicked**, driven through
  System Events. The menu reads New Project… │ Open Recent ▸ │ Save │ Close Document, and
  the submenu ends in a separator and *Clear Menu*.
- **A dropped file opened**, synthesized as a real drop over CDP (`Input.dispatchDragEvent`)
  as S5 was. So did a legacy `.tms9918.json`, under the name `Legacy Export` — while `mdls`
  reports it as `public.json`, which is D3's stated cost measured again.
- **A corrupt file that arrived while a document was open reported why and changed
  nothing**: the banner read `Unsupported project version: undefined.` and Beta Sprites
  stayed on screen.
- **The start screen listed both recents with their folders**, and *Open…* went through the
  same arrival path — the dialog was driven for real, and the document it picked opened.

**Linux: verified against the built package, short of a GUI click.** The deb carries
`MimeType=application/x-tms9918-project;` and `Exec=… %U`, and a MIME package with
`<glob pattern="*.tms9918"/>`. In a Debian container, after the `update-mime-database` and
`update-desktop-database` a real install runs, `xdg-mime query filetype` returned the
project type and `xdg-mime query default` returned `tms9918-editor.desktop`; the entry
passes `desktop-file-validate`. The compound legacy name still resolves to
`application/json`. What was **not** measured is a click in a GUI file manager.

**Windows: still not measured, and still the one platform taken on trust** — the NSIS
installer builds under Wine and cannot be run there (§6, §11). `fileAssociations` is
non-empty, so electron-builder emits its `registerFileAssociations` macro; that is a source
reading, not a run.

What F4 settled, for the phases that inherit it:

- **Main announces; the renderer adopts.** `requestOpen` only makes a path *pending* and
  sends one message. Nothing moves the open document except `takePending`, which the
  renderer calls after `flushAutosave` — so the debounced write that was already in flight
  lands in the file it was written for. Main cannot do this on its own: the unsaved edit is
  in the renderer, and F5's reload prompt will need the same ordering.
- **The Open dialog is not special.** It puts what the user picked into the same queue, and
  answers with nothing. `DocumentStore.requestOpen()` returning `void` reads oddly until you
  notice that it is what stops the dialog and a double-click from drifting apart.
- **The renderer holds an opaque id for a recent, never a path** — a hash of the resolved
  path, stable across launches. D8 survives Open Recent intact, and the start screen still
  shows the folder, because a *directory to display* was already outbound-only (D10).
- **`documentFile.ts` is the file mechanics with no Electron in it.** `recent.ts` needs
  `documentName` and `document.ts` needs `recent.ts`; splitting the pure half out is what
  avoids a cycle, and the node spec now runs without mocking Electron at all.
- **`window-state.json` is the launch-state file, not just the window's.** The document to
  reopen lives beside the bounds because they are one question, asked once; both writers
  merge rather than replace, which a debounced bounds save and a document opening at the
  same moment require. A `v1.6` file simply has no `lastDocument` key.
- **The single-instance lock is D17's, not a nicety.** Without it a double-click on Windows
  or Linux starts a second copy of the app, with a second window and a second autosave loop
  over the same files.
- **The document icon is a silhouette, not a second app icon.** A page with a turned corner
  and the app's own 8×8 glyph on it, generated from the same source as the favicons. There
  is no Linux document icon: electron-builder's MIME package hard-codes freedesktop's
  `x-office-document` and offers no way to point at ours.
- **Two fakes became one.** `src/renderer/src/testing/documentBridge.ts` is a small model of
  main — a map of path → text, one open document, one pending one — and the adapter's, the
  store's and the start screen's specs all build on it. It hands the renderer no path, so a
  spec cannot pass on something the app could not do.

### Phase F5 — Living in a git worktree

**Goal:** switching branches under the editor does the right thing, in both directions.

- [x] Detection per S3: focus + `stat` always; a non-recursive `fs.watch` on the document's
      **directory**, filtered by basename — a watch on the file itself is single-shot and
      dies at the first `git checkout`
- [x] The stamp guard on every write, and the conflict answer it returns (D6)
- [x] Clean document + changed file → reload in place, with a quiet "Reloaded from disk"
- [x] Dirty document + changed file → a dialog naming both sides; taking the file discards
      the edit, and the dialog says so
- [x] Deleted or moved file → the editor says so rather than silently recreating it on the
      next autosave tick

**Exit criteria: met, and measured against a real repository.** Both repos: full suite green
(TMS9918 685, VIC-20 775), `oxlint`, `eslint`, `vue-tsc --build`, `npm run build` and
`npm run build:web` all green.

**Verified in the running desktop app**, the standard `CLAUDE.md` sets — the built app over
CDP against a throwaway profile, driving a real `git` in a real worktree whose two branches
hold different versions of the open document. The list was run in **TMS9918**; the **VIC-20**
app was then driven for the clean reload, the dirty prompt, the dialog's *Reload from Disk*
and the deletion, and behaved identically. The two repos' F5 code is the same lines apart
from names.

- **A `git checkout` under a clean document reloaded it in place**: the editor went from the
  main branch's project to the branch's, and said `Reloaded from disk.` The app was in the
  *background* throughout, so this is the directory watcher, not the focus check.
- **The same checkout with an unsaved edit in flight prompted, and wrote nothing.** A fill was
  dispatched and `git checkout` landed 16 ms later, inside the 500 ms autosave window. The
  debounced write fired, hit the guard and was refused: `git status --porcelain` was **empty**
  afterwards — the checkout was still on disk, whole — and the dialog named both sides.
- **Both answers were driven through the real dialog.** *Reload from Disk* took the branch's
  version and left the worktree clean; *Keep My Version* wrote the editor's version over it
  (`git diff --numstat` = `2 2`, the name and `modifiedAt`) and left no `.tmp` behind.
- **`git stash` and `git checkout .` both reloaded in place**, the second after the app's own
  save had made the worktree dirty — and the app's own write produced no "Reloaded from disk"
  of its own, which is the stamp being re-held rather than compared against itself.
- **Deleting the file behind the app's back said so and recreated nothing**: the *Document
  Deleted* dialog appeared, and an edit made afterwards — with the dialog dismissed — was
  refused with `Saving is paused: "…" is no longer on disk.` and left no file. *Save It Again*
  put it back.
- **A whole-directory swap was still caught** (`mv repo repo.old && cp -R`), because FSEvents
  watches by path.

**What was not isolated, and is not claimed:** the **focus + `stat`** half. It ships and is
wired to the window's `focus`, but on macOS the directory watcher noticed every change first —
including with the window hidden and including the directory swap above — so no case was
constructed in which focus was the thing that saw it. That matches S3's shape (focus is the
fallback that always works; the watcher is the prompt one), but it means the focus path was
exercised only by the unit-level checks and by reading. Windows and Linux remain unmeasured
here, as they were in F4.

What F5 settled, for the phases that inherit it:

- **The guard lives in main and needs nothing from the renderer.** D6 says "every write
  carries the stamp it expects"; the honest shape is that *main* carries it — it holds the
  stamp from the last read or write and compares before every write. The renderer never sees
  a stamp, which keeps the preload surface as narrow as D8 wants it and means no caller can
  forget to pass one.
- **A refused write is a fourth answer, not an error.** `DocumentWriteResult` adds
  `conflict`, and only to writes: collapsing it into `error` would have put a disk failure
  and "the file changed" in the same banner, and they need different endings. It crosses the
  renderer as `DocumentConflictError`, which is what the Pinia store catches to raise the
  question instead of the banner.
- **Three things detect a change and they all end in one place.** The directory watcher, the
  focus check and the guard on the write path all reduce to `externalChange()` + `announce()`,
  which is deduplicated by the stamp it announced for. A change can therefore be noticed twice
  without being *asked* about twice.
- **The dialog has no "cancel", only two answers and a deferral.** Reload takes the file;
  Keep My Version overwrites it; Escape defers, and because the guard keeps refusing until
  the conflict is resolved, deferring has to say so — the banner reads *Saving is paused* and
  the same question is not asked again until the file changes anew.
- **A reload must cancel the debounce.** The edit being discarded usually has a write already
  scheduled; without the `clearTimeout` in `reloadDocument` it lands 500 ms later and puts the
  discarded version straight back. Both specs and the running app cover this.
- **`EditorView` watches the *project*, not the route id.** A reload replaces the project
  under an unchanged `/edit/<id>`, and an undo stack describing the version that was just
  discarded is worse than none — so `editor.reset()` hangs off the project's identity now.
  This also fixes a smaller F4 case: a document arriving with the same id as the open route.
- **`fs.watch` replays.** A watch armed on a directory is handed the events that happened in
  it moments before, so opening a document immediately produces one for the read that just
  happened. Harmless — an event is only ever a reason to re-`stat` — but a spec that does not
  wait for it is asserting on its own fixture, which is why `documentWatch.spec.ts` arms and
  settles before it measures.
- **A harness fact worth keeping: a hidden window does not fire `<dialog>`'s `close` event.**
  Chromium withholds it while `document.visibilityState` is `hidden`, so an Escape-dismisses
  check run against a background window reads as an app bug and is not one. Activate the app
  (`System Events`, `process "Electron"`) before driving any dialog. Everything else measured
  here worked with the window in the background.

### Phase F6 — Migration and first run

**Goal:** nobody loses anything, and everybody knows where their projects are.

- [x] First `v2.0.0` desktop launch with projects in `localStorage`: a sheet explaining what
      is about to happen, then one file per project in the chosen folder, then recents seeded
      with them, then a marker so it happens once (D19)
- [x] Name collisions get suffixes; a project that fails validation is reported by name and
      skipped, not silently dropped
- [x] The originals stay. A "Remove browser-stored copies" action, offered after a successful
      migration and never automatic
- [x] Migration specs against a seeded storage stub, including the corrupt-entry case
- [x] Web build: the manager says where projects live and what clearing browsing data does,
      and points at the desktop app for people who want files (D20)

**Exit criteria: met.** Driven in the packaged renderer over `app://`, against a seeded
`v1.6` profile of four index entries — two projects sharing a name, and one corrupt. The
sheet named the corrupt one before copying and again afterwards; three files were written,
the duplicate name as `Star Voyager 2.tms9918`; recents came back newest-first and one of
them opened into the editor; the marker was set once and a relaunch did not ask again;
`localStorage` still held all four entries until *Remove Browser Copies* was pressed, which
removed the three that were written and left the corrupt one. Copying a second time into the
same folder produced ` 3` and ` 4` rather than touching a file.

**What it split, and where the line is.** `localStorage` belongs to the renderer's origin and
files belong to main, so the migration is the one operation in this round that needs both
halves: `persistence/migration.ts` reads, validates and serializes; `src/main/migration.ts`
writes, seeds recents and holds the marker. It sits beside the two adapters rather than inside
either, because it touches *both* stores at once — which is exactly what the Pinia store's
single adapter cannot express, and why D1's one storage call site is left alone.

**Things worth keeping:**

- **The marker is main's, in `userData` — not a `localStorage` key.** A marker stored beside
  the projects it describes would be cleared by the same "clear browsing data" that clears
  them, and the app would then offer to migrate projects that are no longer there.
- **What crosses the bridge has to be plain objects.** The plan is held in a `ref` by the view
  that shows it, so `plan.documents` is a reactive Proxy — and `ipcRenderer.invoke`
  structured-clones its arguments, which fails on one with *"An object could not be cloned"*.
  `run` rebuilds the array. Nothing below the bridge can see this: a fake never clones, so the
  unit specs were green while the app did nothing at all. It is the phase's own instance of
  the standard in `CLAUDE.md`.
- **Only what was *written* is ever removed.** The corrupt entry was never copied, so removing
  it would destroy the one project this phase has no other copy of. The result carries the
  project's own id per file for exactly this.
- **"Not Now" does not set the marker**, so the offer returns next launch. Deliberate: the
  desktop has no list view to run it from later, so a decline that is permanent would be a
  decline that strands the projects.
- **A run that wrote *nothing* has not happened.** The marker follows the writes, not the
  request — an unwritable folder is offered again rather than marked done.
- **`dir="rtl"` is wrong for a path written for a person.** The New dialog's location row uses
  it to keep the end of a long absolute path visible; on `~/Documents/<app folder>` it renders
  as `Documents/<app folder>/~`. The sheet truncates left-to-right instead.
- **A hidden window defers `showModal`.** The sheet did not open on the first launch driven
  before the window was shown — the same family as F5's note that a hidden window does not
  fire `<dialog>`'s `close`. Activate the app before concluding a dialog is broken.

### Phase F7 — The desktop file affordances

**Goal:** the app says desktop words and offers desktop commands.

- [x] File menu: New…, New from Sample…, Open…, Open Recent ▸, Close Document, Save,
      Save a Copy…, Reveal in Finder / Show in Explorer / Show in Files
- [x] `utils/strings.ts` — *Upload Project* → *Open…*, *Download* → *Save a Copy…*, and the
      editor header's "Back to Projects" → "Close Document". This is the wording fork the
      shell's own plan deferred; it stays out of the views
- [x] *Download* writes the bare extension in both shells (D3) — the file content already
      matches after F2; only the name the browser saves it under is still the v1 compound one
- [x] Share links from the desktop resolve against the published web app (D21)

**Exit criteria: met, bar two items driven only to their enabled state.** Read off the
*live* menu of the running app rather than from the source: the File menu is New Project…,
New from Sample ▸, Open…, Open Recent ▸ │ Close Document, Save, Save a Copy…, Reveal in
Finder │ Close Window. On the start screen only the first group is live and the other four
items are grey; with a document open all of them are live. Open Recent ▸ held the document
the app had been given, plus Clear Menu, and survived a relaunch — which reopened it (D11).
New from Sample ▸ ▸ Star Voyager opened the New dialog under the sample's own name with the
location row filled in, and *Save a Copy…* opened a native save sheet whose Format row read
"TMS9918 Project" — the filter row `dialogs.ts` picks from the bare extension.

**What is not verified, and why.** *Open…* and *Reveal in Finder* were driven only as far as
their enabled state: the machine's owner was working in another app throughout, and both
items' clicks raise something in front of whatever is on screen. Both are main's own
one-liners over functions the bridge already calls — `openDocumentDialog` is what F4 drove
through the start screen's *Open…* button, and `revealDocument` is `shell.showItemInFolder`
— so what F7 adds to them is the menu item and its enabled rule, which is the half that was
read from the live menu. The suggested name in the save sheet was measured *before* the
document-name change below and is covered by a spec afterwards, not by the sheet.

**Things worth keeping:**

- **A menu item that no key fires needs a table of its own.** Every item until now named a
  shortcut action, and `menu.spec.ts` holds those two lists equal in both directions — which
  is the property that stops the menu inventing commands. *Save a Copy…* is the first item
  with no key, so it is declared in `MENU_COMMANDS` and marked `command: true`, and the spec
  now checks three things instead of two: every shortcut appears exactly once, every command
  is declared, and no command is secretly a shortcut. The alternative — a keyless entry in
  `utils/shortcuts.ts` — would have put it in the help sheet and the README, which advertise
  keys.
- **The samples are the renderer's, so main is *told* them.** `MenuContext` grows `samples`
  and each item sends back the sample's own id (`sample:<id>`). This is the same rule the
  rest of the menu follows — the renderer answers, main renders the answer — and it means a
  sample added to `src/renderer/src/samples/` appears in the menu with nothing else edited.
- **Two views wanted the New dialog, so its state moved into a composable.**
  `composables/newDocument.ts` is what makes File ▸ New Project… work from the editor as well
  as the start screen, and it holds one more thing than the view did: `location` stays
  `undefined` until a shell answers with one, which is exactly the condition the dialog shows
  its location row on. No component branches on the shell (D13).
- **Creating a document from the editor has to flush first.** `create` adopts the new
  document in main, so the edit still in the autosave window would have landed in the *new*
  file — the same swap `takePendingDocument` guards, and the reason `admit` now flushes on
  the document path. F7 is the phase that made it reachable.
- **A copy is named after the document, not the project inside it.** They agree for anything
  this app made — main derives one from the other — and differ for a file renamed in Finder,
  where the name on screen is the one the user knows it by. Measured in the running app: the
  golden document `Star Voyager.tms9918` holds a project called `graphics1`, and the save
  sheet offered `graphics1.tms9918` until this was fixed.
- **The wording table does not carry `back`.** Its two words live in `src/shared/menu.ts`
  because the File menu has an item for it and main has to be sent the same string the button
  shows (D14). `utils/strings.ts` says so where a future session will look for it.
- **Reveal's enabled state needs main to say when it changed.** The menu rebuilds on the
  renderer's context report and on recents moving; *closing* a document moves neither, so
  `document.ts` announces open/close and `index.ts` wires that to `buildMenu`.

### Phase F8 — Docs and release

**Goal:** `v2.0.0` in both repos, and documentation that describes the app that now exists.

- [x] README in both: the desktop section rewritten around documents and double-click; the web
      section says plainly that projects live in the browser. Two existing claims go with it —
      that the menu carries "the keyboard map as accelerators" (it deliberately carries no
      accelerators), and that the desktop app is the same views as the web (now "the same
      tree, two entry points", §4)
- [x] `CLAUDE.md` in both: the port and its split, the git-first format, the stamp rule, the
      renderer-never-names-a-path invariant, and the router's one shell fork — the things a
      future session must not "clean up"
- [x] `2.0.0` in `package.json`, both repos; tag and release with all four artifacts each
- [x] Release notes lead with what a desktop user must know: that projects are now files,
      where the old ones were copied to, that they were copied and not moved, and that the web
      app is unchanged

**Exit criteria: met on macOS; Windows and Linux are declared and not driven.** Both repos
are tagged `v2.0.0` with all four artifacts each, and both packaged macOS builds were run.

What was measured in the packaged `2.0.0` binaries, not read from source:

- **Both are notarized and Gatekeeper-accepted** — `spctl -a -vv` answers *accepted, source=
  Notarized Developer ID* for each `.app` out of its own dmg.
- **The macOS double-click path opens a document.** The delivery mechanism a double-click
  uses is the `open-file` Apple Event, and that is what was sent. The VIC-20 app went from
  `app://vic20/` to `app://vic20/edit/00000000-0000-4000-8000-000000000001` — the golden
  document's *own* id, which is D9 holding — and the TMS9918 app's next cold launch, with no
  arguments at all, came up on `/edit/<the same id>`, which is D11's reopen. The route was
  read off the live renderer over the DevTools protocol rather than off a screenshot, which
  is why it is an id and not a guess.
- **Recents recorded it** in both: `recent-documents.json` in `userData` held the path, and
  `window-state.json` held it as `lastDocument`.
- **D5 held in the packaged build.** A document opened and then left alone was byte-identical
  to the golden it was copied from afterwards. An idle editor really does not dirty a working
  tree.
- **The exported UTI resolves.** With the app registered, Finder reports
  `kMDItemContentType = com.acwright.tms9918editor.project` and
  `kMDItemKind = "TMS9918 Editor Project"` for a `.tms9918` file — S1's named type rather
  than the dynamic UTI. The same for `.vic20`.
- **The first-run migration sheet appears in the packaged app**, reading *"Your projects are
  becoming files"*, offering `~/Documents/TMS9918 Editor`, and carrying D19's three
  promises — nothing moved or deleted, copies added to Recent Documents, a taken name gets a
  number.
- **The Linux packages declare the association.** The deb carries
  `usr/share/mime/packages/<app>.xml` with the `*.tms9918` / `*.vic20` glob and the MIME
  type, a `.desktop` entry with the matching `MimeType=` and `Exec … %U`, and the ALSA
  dependency the default list omits.

**What the push found: the stamp's mtime assumption is APFS's, not every filesystem's.**
F1–F7 had never run on CI — `main` was still at the pre-F1 commit — so the first push of this
round was the first time `documentFile.spec.ts` ran anywhere but a Mac, and one test failed in
both repos. *"Moves the stamp when the same-length text is written again"* asserted that two
back-to-back same-length writes get distinct mtimes. That is S3's measurement on APFS, and it
is **a property of the filesystem rather than of this code**: on the GitHub runner both writes
came back with the same `mtimeMs` to four decimal places.

A first attempt to keep the claim — probe the filesystem's resolution, assert strictly only
where it resolves — **failed again, and taught the sharper fact**: the probe's two *in-place*
writes did separate on that runner, while `writeDocumentAt`'s two write-temp-then-rename
cycles did not. Creating a fresh file twice inside one tick is what collides there, not
rewriting one. So distinctness is not something a test in this repo can honestly assert
without testing the runner, and it is now recorded here as the measurement it always was.
What the test asserts instead is what `writeDocumentAt` itself promises, on any filesystem:
the stamp handed back is the file's own rather than a cached guess, the size is the new
text's, mtime never goes backwards, and the bytes really changed.

**The product consequence is real but narrow, and is the one §6 already named.** Where mtime
does not resolve two writes, a `{ mtimeMs, size }` stamp cannot tell apart a same-length file
swapped in within the same tick as our own last write — so D6's guard is weaker on such a
filesystem than it is on APFS. A checkout arriving inside one tick of an autosave is not a
case that occurs in use, and every wider gap is caught. The fix if it is ever wanted is the
one §6 states: a content hash in the stamp. It is not taken now, because it would be a change
to shipped behaviour made after the release rather than a measured one, and it belongs in
§12 with the rest of the deferred work.

**What is not verified, and why.** *Editing and saving in the packaged binary* was driven
only as far as opening: the machine's owner was working in another app throughout and the
GUI could not be driven further without taking the screen from them. The save path is what
F3 and F5 drove in the running app and what the unit suites cover. **Windows and Linux
double-click is still declared rather than run** — the standing position from S1 and §11, and
the NSIS installer remains a real Windows job. The Pages deploy is CI's, on the push.

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
- **A content hash in the document stamp.** `{ mtimeMs, size }` is enough on APFS, where it
  was measured (S3), and it is not enough on a filesystem that gives two files created inside
  one clock tick the same timestamp — the CI runner's is one, which is how this surfaced
  (F8), and an atomic write creates a fresh file every time. Hashing the bytes on read
  and write would make D6's guard independent of the clock. Deferred rather than done: the
  gap it closes is a checkout landing inside one tick of an autosave, and the cost is a hash
  over the whole document on every stamp, which is the thing §5 measured the write budget
  against.
- **A merge driver or `.gitattributes` guidance** for project files. Conflicts in a 2000-line
  charset are readable with D4's format but not mergeable.
- **Export every project in a directory as assembly** — the obvious next thing to want from a
  build-integrated editor, and a round of its own.
- **Watching for external change while the app is in the background**, rather than catching up
  on focus. Only worth it if S3 shows a watcher is reliable everywhere.
- **A shared package** for the storage layer both editors now duplicate — the same call the
  shell's plan made about the shell, and the same answer: worth it only if a third editor
  appears.
