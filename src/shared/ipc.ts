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
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
