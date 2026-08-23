import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { AppApi, OpenFileRequest, OpenedTextFile, SaveFileRequest } from '../shared/api'
import type {
  CreateDocumentRequest,
  DocumentResult,
  DocumentStamp,
  OpenDocument,
} from '../shared/document'
import type { MenuContext } from '../shared/menu'

const api: AppApi = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION),
    platform: process.platform,
    onBeforeQuit: (callback: () => void | Promise<void>): (() => void) => {
      // The renderer's flush is async; it signals completion with
      // `saveComplete()`, so nothing here awaits the promise.
      const handler = (): void => void callback()
      ipcRenderer.on(IPC.APP_BEFORE_QUIT, handler)
      return () => ipcRenderer.off(IPC.APP_BEFORE_QUIT, handler)
    },
    saveComplete: (): void => {
      ipcRenderer.send(IPC.APP_SAVE_COMPLETE)
    },
  },
  files: {
    save: (request: SaveFileRequest): Promise<string | null> =>
      ipcRenderer.invoke(IPC.FILE_SAVE, request),
    openText: (request: OpenFileRequest): Promise<OpenedTextFile | null> =>
      ipcRenderer.invoke(IPC.FILE_OPEN_TEXT, request),
  },
  // Every call writes to, or reads, whatever document main has open — none of
  // them names a file, which is what D8 asks of this side of the bridge.
  document: {
    create: (request: CreateDocumentRequest): Promise<DocumentResult<OpenDocument>> =>
      ipcRenderer.invoke(IPC.DOCUMENT_CREATE, request),
    open: (): Promise<DocumentResult<OpenDocument>> => ipcRenderer.invoke(IPC.DOCUMENT_OPEN),
    current: (): Promise<DocumentResult<OpenDocument>> => ipcRenderer.invoke(IPC.DOCUMENT_CURRENT),
    write: (text: string): Promise<DocumentResult<DocumentStamp>> =>
      ipcRenderer.invoke(IPC.DOCUMENT_WRITE, text),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.DOCUMENT_CLOSE),
    reveal: (): Promise<void> => ipcRenderer.invoke(IPC.DOCUMENT_REVEAL),
    defaultLocation: (): Promise<string> => ipcRenderer.invoke(IPC.DOCUMENT_DEFAULT_LOCATION),
    chooseLocation: (): Promise<string | null> => ipcRenderer.invoke(IPC.DOCUMENT_CHOOSE_LOCATION),
  },
  menu: {
    setContext: (context: MenuContext): void => {
      // Structured-cloned across the bridge, so what main receives is a copy
      // rather than a live handle on renderer state.
      ipcRenderer.send(IPC.MENU_SET_CONTEXT, context)
    },
    onAction: (callback: (action: string) => void): (() => void) => {
      const handler = (_event: unknown, action: string): void => callback(action)
      ipcRenderer.on(IPC.MENU_ACTION, handler)
      return () => ipcRenderer.off(IPC.MENU_ACTION, handler)
    },
  },
}

// contextIsolation is on (see D5), so this is always the exposeInMainWorld
// path; the else branch the electron-vite template ships exists for the
// isolation-off case we do not run.
try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('[preload] failed to expose window.api:', error)
}
