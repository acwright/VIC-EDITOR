/**
 * IPC channel names.
 *
 * Shared by the main and preload processes so a typo cannot silently create a
 * channel nobody listens on. The renderer never sees these — it goes through
 * the typed `window.api` surface in `api.ts`.
 */
export const IPC = {
  /** Renderer → main, replies with `app.getVersion()`. */
  APP_GET_VERSION: 'app:get-version',
  /** Main → renderer: the window is closing, flush anything unsaved. */
  APP_BEFORE_QUIT: 'app:before-quit',
  /** Renderer → main: flushing is done, the close may proceed. */
  APP_SAVE_COMPLETE: 'app:save-complete',
  /** Renderer → main: which menu actions are live, and what to call them. */
  MENU_SET_CONTEXT: 'menu:set-context',
  /** Main → renderer: a menu item was chosen; here is its action id. */
  MENU_ACTION: 'menu:action',
  /**
   * Renderer → main: run a save dialog and write the bytes. Replies with the
   * path written, or `null` if the user cancelled.
   */
  FILE_SAVE: 'file:save',
  /**
   * Renderer → main: run an open dialog and read the file as UTF-8. Replies
   * with the file, or `null` if the user cancelled.
   */
  FILE_OPEN_TEXT: 'file:open-text',
  /**
   * Renderer → main: create a new document from a name and its contents.
   * Main derives the filename and picks the folder (D8, D10).
   */
  DOCUMENT_CREATE: 'document:create',
  /**
   * Renderer → main: run an open dialog. What the user chose goes through the
   * same arrival path as a double-click rather than coming back as a reply —
   * every way a document can arrive is one code path (D15).
   */
  DOCUMENT_OPEN: 'document:open',
  /**
   * Main → renderer: a document is waiting to be opened — a double-click, a
   * drop, Open Recent, the Open dialog, or the one that was open at the last
   * quit (D11, D15). The renderer answers by flushing what it has and calling
   * `DOCUMENT_TAKE_PENDING`; nothing is adopted until it does, so an edit still
   * in the autosave window lands in the *old* file (D17).
   */
  DOCUMENT_PENDING: 'document:pending',
  /**
   * Renderer → main: adopt whatever is waiting and hand it over. `none` when
   * nothing is — which is also how a launch with no document says so.
   */
  DOCUMENT_TAKE_PENDING: 'document:take-pending',
  /**
   * Renderer → main: the user dropped a file on the window. The path is
   * derived in the *preload* by `webUtils.getPathForFile` (S5) — the isolated
   * renderer cannot reach it — and goes straight into the arrival path.
   */
  DOCUMENT_DROPPED: 'document:dropped',
  /** Renderer → main, replies with Recent Documents for the start screen (D16). */
  DOCUMENT_RECENT: 'document:recent',
  /** Renderer → main: open the recent document with this id. Arrives as pending. */
  DOCUMENT_OPEN_RECENT: 'document:open-recent',
  /**
   * Renderer → main: re-read whatever document is open. This is how the
   * renderer recovers after a reload — main is the process that knows (D9).
   */
  DOCUMENT_CURRENT: 'document:current',
  /** Renderer → main: write these bytes to the open document, atomically (D6). */
  DOCUMENT_WRITE: 'document:write',
  /** Renderer → main: nothing is open any more. */
  DOCUMENT_CLOSE: 'document:close',
  /** Renderer → main: show the open document in the platform's file manager. */
  DOCUMENT_REVEAL: 'document:reveal',
  /** Renderer → main: where a new document would go, for the New dialog (D10). */
  DOCUMENT_DEFAULT_LOCATION: 'document:default-location',
  /** Renderer → main: run a folder dialog and remember what came back. */
  DOCUMENT_CHOOSE_LOCATION: 'document:choose-location',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
