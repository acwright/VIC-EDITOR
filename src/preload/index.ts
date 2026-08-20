import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { AppApi } from '../shared/api'
import type { MenuContext } from '../shared/menu'

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
