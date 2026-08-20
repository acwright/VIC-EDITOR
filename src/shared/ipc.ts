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
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
