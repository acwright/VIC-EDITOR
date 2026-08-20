import type { AppApi } from '../shared/api'

declare global {
  interface Window {
    /** The Electron bridge — **undefined in the browser build**. */
    api?: AppApi
  }
}

export {}
