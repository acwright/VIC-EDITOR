import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IPC } from '../shared/ipc'
import { EMPTY_MENU_CONTEXT, type MenuContext } from '../shared/menu'
import { registerDialogHandlers } from './dialogs'
import { buildMenu, setMenuContext } from './menu'
import { MIN_WINDOW_SIZE, loadWindowState, trackWindowState } from './windowState'

const APP_ID = 'com.acwright.vic20editor'
const PRODUCT_NAME = 'VIC-20 Editor'

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

/**
 * The app icon as a path on disk.
 *
 * macOS reads the icon from the bundle and needs none of this, but Linux wants
 * one for the window and both Linux and Windows want one for the About panel —
 * and all three of those take a *path*, read by native code that cannot see
 * inside `app.asar`. So `build/icon.png` ships as an extra resource rather than
 * as part of the bundle, and this resolves to it either side of packaging.
 * Returns `undefined` if it is missing, since a working icon is not worth a
 * failed launch (a checkout that has never run `npm run icons` has no `build/`).
 */
function appIconPath(): string | undefined {
  const path = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build', 'icon.png')
  return existsSync(path) ? path : undefined
}

let mainWindow: BrowserWindow | null = null

/** Set once the renderer has flushed, so the re-issued close is allowed through. */
let readyToClose = false
/** Whether the pending close came from a real quit (⌘Q, menu) or just the button. */
let quitting = false

// Must run before `whenReady`, or the scheme is registered too late to be
// treated as standard/secure and the origin comes back opaque.
/**
 * Unpackaged, `app.getName()` falls back to package.json's `name`, so the
 * macOS app menu offers "About vic20-editor" / "Quit vic20-editor". A
 * packaged build takes the name from electron-builder's `productName` and
 * reads correctly on its own; setting it here makes a dev run agree with that
 * instead of showing a slug. It also moves `userData` to the directory the
 * packaged app will use, which is where dev data belongs anyway — so it has to
 * happen before anything asks for that path.
 */
app.setName(PRODUCT_NAME)

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
  const state = loadWindowState()

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    // A first launch sizes the *viewport* the layout has to fit into; a
    // restored window is the window bounds that were saved (§windowState).
    useContentSize: state.useContentSize,
    // Absent on a first launch, and dropped when the display they named is no
    // longer attached — either way the window centres instead.
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    center: state.x === undefined,
    title: PRODUCT_NAME,
    // Only Linux needs this: macOS and Windows take the window and taskbar
    // icon from the packaged bundle.
    ...(process.platform === 'linux' ? { icon: appIconPath() } : {}),
    backgroundColor: '#0a0a0a',
    // Shown on `ready-to-show` so the first paint is the app, not a white flash.
    show: false,
    webPreferences: {
      preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // An ESM preload cannot run in a sandboxed renderer. The bridge exposes
      // a handful of named functions and no `ipcRenderer` passthrough, so the
      // surface this gives up is small and explicitly enumerated (D5).
      sandbox: false,
    },
  })

  if (state.maximized) mainWindow.maximize()
  trackWindowState(mainWindow)

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
    // The app is on its way out (see `window-all-closed`), but the menu bar
    // outlives the window by a moment on macOS. Nothing in it has a view to
    // act on any more, so it all goes grey rather than staying lit over a
    // window that is gone.
    setMenuContext(EMPTY_MENU_CONTEXT)
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
 * `close` handler has already cancelled the quit — `preventDefault` there
 * cancels the whole quit, not just the close — so re-issuing it is what
 * actually finishes the job. Closing the window alone is enough the other way
 * round, since the last window closing quits anyway.
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

  // macOS reads this for the About panel under the app menu; Windows and Linux
  // for the panel `app.showAboutPanel()` opens from Help.
  const iconPath = appIconPath()
  app.setAboutPanelOptions({
    applicationName: PRODUCT_NAME,
    applicationVersion: app.getVersion(),
    copyright: '\u00a9 2026 A.C. Wright',
    // Ignored on macOS, which uses the bundle icon.
    ...(iconPath ? { iconPath } : {}),
  })

  // F12 opens DevTools in development and does nothing in a packaged build;
  // Cmd/Ctrl+R reloads. Both without a menu entry of their own (E3 adds those).
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerAppProtocol()

  ipcMain.handle(IPC.APP_GET_VERSION, () => app.getVersion())
  ipcMain.on(IPC.APP_SAVE_COMPLETE, () => finishClose())
  ipcMain.on(IPC.MENU_SET_CONTEXT, (_event, context: MenuContext) => setMenuContext(context))
  registerDialogHandlers()

  createWindow()

  // Everything is disabled until the view on screen reports what it offers,
  // which it does as it mounts. The menu bar exists from launch on macOS, so
  // it is built here rather than waiting for that first report.
  buildMenu()
})

/**
 * One window is the whole app, so closing it quits — on macOS too, where the
 * platform default would instead leave a running app with an empty menu bar
 * and nothing on screen. A single-window document-less editor has nothing to
 * offer in that state, so there is no reason to stay in it.
 */
app.on('window-all-closed', () => {
  app.quit()
})
