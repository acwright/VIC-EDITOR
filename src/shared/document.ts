/**
 * The open document, as main and the renderer agree to talk about it
 * (PLAN.md D6, D8).
 *
 * **Main owns the open document.** The renderer asks for a write and never
 * says where it goes; it asks for a new document and never builds the path.
 * Everything here that carries a path carries it *outwards* — for the header
 * to show and for Reveal to act on — and no call in the surface takes one.
 * That is what keeps `src/renderer/` free of filenames.
 *
 * Every entry point answers with a `DocumentResult`, because "the user
 * cancelled" and "the write failed" are different things and collapsing them
 * into `null` loses the reason the renderer wants to show.
 */

/**
 * What a document was when we last touched it (D6). Every read returns one and
 * every write produces one, so Phase F5 can refuse a write whose file has
 * moved underneath it rather than guessing.
 *
 * `{ mtimeMs, size }` is enough on APFS, where six back-to-back writes of the
 * same length produced six distinct mtimes (PLAN.md S3). A filesystem with
 * one-second granularity would need a content hash instead.
 */
export interface DocumentStamp {
  mtimeMs: number
  size: number
}

/** The open document: what it holds, what it is called, and where it lives. */
export interface OpenDocument {
  /**
   * Absolute path. **Outbound only** — for the window title, the conflict
   * dialog and Reveal. No call in this surface accepts one back.
   */
  path: string
  /** The file's name without its extension: what the editor's header shows. */
  name: string
  /** The file's contents, UTF-8. */
  text: string
  stamp: DocumentStamp
}

/** A new document: a name to build the filename from, and what to put in it. */
export interface CreateDocumentRequest {
  /** The project's name. Main derives the filename; the renderer does not. */
  name: string
  /** The serialized project (D4). */
  text: string
}

/**
 * The answer to every document request.
 *
 * `none` is the benign empty case — the user cancelled a dialog, or nothing is
 * open — and is never an error the renderer should show. `error` carries a
 * sentence written for a person, because main is the side that knows why.
 */
export type DocumentResult<T> =
  { status: 'ok'; value: T } | { status: 'none' } | { status: 'error'; reason: string }

/** The extension new documents are written under (PLAN.md D3, §9). */
export const DOCUMENT_EXTENSION = 'vic20'

/**
 * The v1 export name, opened forever (D3). A double-click association cannot
 * be registered on a compound extension, so nothing is *written* under this
 * one any more — but every project anyone exported from `v1.6` still opens.
 */
export const LEGACY_DOCUMENT_EXTENSION = 'vic20.json'

/** What the open and save dialogs call the type in their filter row. */
export const DOCUMENT_TYPE_NAME = 'VIC-20 Project'

/**
 * A project name as a filename (D3).
 *
 * Only what a filesystem refuses is touched — the separators and Windows'
 * reserved set — so "Title Screen" stays `Title Screen.vic20` rather than
 * becoming a slug.
 *
 * It lives here, rather than beside the file mechanics it was written for,
 * because **both** writers of a document have to agree on it: main derives the
 * name a new document is created under (D8, D10), and the renderer derives the
 * one *Save a Copy…* suggests to the save dialog (F7). A copy saved out of the
 * editor and a document created by the app are the same file, and are named the
 * same way.
 */
export function documentFileName(name: string): string {
  const safe =
    name
      .replace(/[<>:"/\\|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      // A leading dot hides the file; a trailing dot or space is dropped by Windows.
      .replace(/^[.\s]+|[.\s]+$/g, '') || 'Project'
  return `${safe}.${DOCUMENT_EXTENSION}`
}

/**
 * One entry of Recent Documents (D16).
 *
 * **No path crosses in either direction.** `id` is main's own opaque handle on
 * a file it already knows about, so *Open Recent* names a document without the
 * renderer ever being able to name a file (D8); `directory` is the folder as it
 * reads on screen, home collapsed to `~`, and is display text rather than
 * something the renderer can act on.
 */
export interface RecentDocument {
  /** Opaque and stable for a given file: what `openRecent` takes. */
  id: string
  /** The document's name, extension taken off — as the header shows it. */
  name: string
  /** Where it lives, for the second line of the entry. */
  directory: string
}

/**
 * What happened to the open document behind the app's back (PLAN.md D7).
 *
 * Two things can, and they are answered differently: a file that *changed* can
 * be reloaded, and a file that is *gone* cannot. Everything else — a branch
 * switch, a `git stash`, another editor saving over it, a file moved out from
 * under the app — reduces to one of these two.
 */
export type DocumentChange = 'modified' | 'deleted'

/**
 * What a write answers (D6, D7).
 *
 * The usual three, plus the one only a write has: main holds the stamp the
 * open document had when it was last read or written, and refuses a write to a
 * file that no longer matches it. `conflict` is not a failure — nothing is
 * wrong with the disk — it is the app declining to overwrite something it did
 * not put there, and the renderer answering it is D7.
 */
export type DocumentWriteResult =
  DocumentResult<DocumentStamp> | { status: 'conflict'; change: DocumentChange }

/**
 * Where a `v1.6` user's projects are copied to on the first `v2.0` launch
 * (PLAN.md D19, §9). A folder of the app's own inside `~/Documents`, created if
 * it is missing — the projects being copied have no folder of their own, since
 * until now they had no files.
 */
export const MIGRATION_FOLDER_NAME = 'VIC-20 Editor'

/**
 * One project on its way out of browser storage (D19).
 *
 * The renderer reads and serializes; main writes. `id` is the project's own —
 * the same opaque string the route already carries — and comes back in the
 * result so the renderer knows exactly which browser copies were written and
 * which were not. No path crosses in either direction (D8).
 */
export interface MigrationDocument {
  id: string
  /** The project's name. Main derives the filename, as it does for New (D10). */
  name: string
  /** The serialized project (D4). */
  text: string
}

/** A project that was written, and the file it landed in. */
export interface MigrationWritten {
  id: string
  /** The filename as written, suffix included — what the sheet lists. */
  file: string
}

/** A project that could not be written, and why. */
export interface MigrationFailure {
  id: string
  name: string
  reason: string
}

/**
 * What a migration did (D19).
 *
 * Deliberately not a boolean: the sheet afterwards names every file that was
 * written and every project that was not, because the originals are still in
 * browser storage and the user is about to be asked whether to remove them.
 */
export interface MigrationResult {
  /** The folder as it reads on screen, home collapsed to `~`. */
  folder: string
  written: MigrationWritten[]
  failed: MigrationFailure[]
  /**
   * Whether the marker was set, so this happens once.
   *
   * False when *nothing* could be written — an unwritable folder, a volume
   * that is not there — because that is a migration that has not happened yet
   * and should be offered again, not a migration that is over.
   */
  done: boolean
}
