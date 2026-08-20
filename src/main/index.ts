import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { dirname, extname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IPC } from '../shared/ipc'

const APP_ID = 'com.acwright.vic20editor'

/**
 * The renderer is served over a custom **standard** scheme rather than
 * `file://`. Under `file://` the router's history mode is unusable: on startup
 * `location.pathname` is the bundle's absolute disk path, and after a
 * `pushState` any reload resolves against `file:///edit/<id>`, which does not
 * exist. A standard scheme gives the app a real origin, so `createWebHistory`,
 * deep links, ⌘R and `localStorage` all behave exactly as they do on the web —
 * and `src/renderer/src/router/index.ts` needs no Electron branch at all.
 */
const SCHEME = 'app'
const HOST = 'vic20'

const RENDERER_DIR = join(dirname(fileURLToPath(import.meta.url)), '../renderer')

let mainWindow: BrowserWindow | null = null

/** Set once the renderer has flushed, so the re-issued close is allowed through. */
let readyToClose = false
/** Whether the pending close came from a real quit (⌘Q, menu) or just the button. */
let quitting = false

// Must run before `whenReady`, or the scheme is registered too late to be
// treated as standard/secure and the origin comes back opaque.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
])

/** Serve the built renderer, with an SPA fallback, out of `out/renderer`. */
function registerAppProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== HOST) return new Response('Not found', { status: 404 })

    const pathname = decodeURIComponent(url.pathname)
    // An extensionless path is a router route (`/`, `/edit/abc123`): serve the
    // shell and let vue-router resolve it. Anything else is an asset request.
    const target = extname(pathname) === '' ? 'index.html' : pathname.slice(1)
    const filePath = join(RENDERER_DIR, target)

    // `join` collapses `..` segments, so comparing after the fact is what
    // catches a request that walked out of the bundle.
    const rel = relative(RENDERER_DIR, filePath)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return new Response('Forbidden', { status: 403 })
    }

    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    // The editor's three columns stop being usable below this; revisited in E3.
    minWidth: 1024,
    minHeight: 700,
    center: true,
    title: 'VIC-20 Editor',
    backgroundColor: '#0a0a0a',
    // Shown on `ready-to-show` so the first paint is the app, not a white flash.
    show: false,
    webPreferences: {
      preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // An ESM preload cannot run in a sandboxed renderer. The bridge exposes
      // four functions and no `ipcRenderer` passthrough, so the surface this
      // gives up is small and explicitly enumerated (D5).
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Give the renderer a chance to flush its debounced autosave before the
  // window goes away.
  mainWindow.on('close', (event) => {
    if (readyToClose) return
    event.preventDefault()
    mainWindow?.webContents.send(IPC.APP_BEFORE_QUIT)
    // Safety valve: a wedged or crashed renderer must not make the app
    // unquittable.
    setTimeout(finishClose, 5000)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // `target=_blank` is covered above; this catches an in-window navigation to
  // somewhere that is not the app, which would replace the editor entirely.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin === rendererOrigin()) return
    event.preventDefault()
    void shell.openExternal(url)
  })

  void mainWindow.loadURL(rendererURL())
}

function rendererOrigin(): string {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  return is.dev && devServer ? new URL(devServer).origin : `${SCHEME}://${HOST}`
}

function rendererURL(): string {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  return is.dev && devServer ? devServer : `${SCHEME}://${HOST}/`
}

/**
 * Close for real.
 *
 * A quit and a window close need different endings: after ⌘Q the window's
 * `close` handler has already cancelled the quit, so closing the window alone
 * would leave a running app with no window on macOS. Re-issuing the quit is
 * what actually finishes the job.
 */
function finishClose(): void {
  if (readyToClose) return
  readyToClose = true
  if (quitting) app.quit()
  else if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
}

app.on('before-quit', () => {
  quitting = true
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId(APP_ID)

  // F12 opens DevTools in development and does nothing in a packaged build;
  // Cmd/Ctrl+R reloads. Both without a menu entry of their own (E3 adds those).
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerAppProtocol()

  ipcMain.handle(IPC.APP_GET_VERSION, () => app.getVersion())
  ipcMain.on(IPC.APP_SAVE_COMPLETE, () => finishClose())

  createWindow()

  // macOS keeps the app alive with no windows; clicking the dock icon reopens.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      readyToClose = false
      quitting = false
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
