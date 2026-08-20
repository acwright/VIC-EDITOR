import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { AppApi } from '../shared/api'

const api: AppApi = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION),
    platform: process.platform,
    onBeforeQuit: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on(IPC.APP_BEFORE_QUIT, handler)
      return () => ipcRenderer.off(IPC.APP_BEFORE_QUIT, handler)
    },
    saveComplete: (): void => {
      ipcRenderer.send(IPC.APP_SAVE_COMPLETE)
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
