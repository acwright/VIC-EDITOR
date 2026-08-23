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
