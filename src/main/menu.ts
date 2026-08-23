import { app, shell, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { is } from '@electron-toolkit/utils'
import { IPC } from '../shared/ipc'
import { requestOpen } from './openRequests'
import { clearRecentDocuments, recentDocumentPaths } from './recent'
import { documentName } from './documentFile'
import {
  EMPTY_MENU_CONTEXT,
  MENU_ACTIONS,
  type MenuContext,
  type MenuSection,
} from '../shared/menu'

const PRODUCT_NAME = 'VIC-20 Editor'
const REPO_URL = 'https://github.com/acwright/VIC-EDITOR'

const isMac = process.platform === 'darwin'

/**
 * What the view on screen currently offers. Replaced wholesale each time the
 * renderer reports, and read while rebuilding — the menu is cheap enough to
 * rebuild outright, and a rebuilt menu cannot hold a stale enabled flag.
 */
let context: MenuContext = EMPTY_MENU_CONTEXT

/** Rebuild the application menu against the current context. */
export function buildMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template()))
}

/**
 * Take the renderer's report and rebuild — but only when something actually
 * changed. A view reports on every mode change, and on macOS reassigning the
 * application menu while one of its menus is open closes it.
 */
export function setMenuContext(next: MenuContext): void {
  if (sameContext(context, next)) return
  context = next
  buildMenu()
}

/**
 * Where a chosen action goes. Resolved at click time rather than captured when
 * the menu is built: on macOS the app outlives its window, and the window the
 * dock icon recreates is a different object from the one the menu was built
 * against.
 */
function send(action: string): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  window?.webContents.send(IPC.MENU_ACTION, action)
}

function sameContext(a: MenuContext, b: MenuContext): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * The items of one section, with the separators their entries ask for.
 *
 * `extras` puts main's *own* items into the run — items that are not actions
 * the renderer dispatches and so have no place in `MENU_ACTIONS`. Open Recent
 * is the first of them: each entry is a file main knows about, opened by a path
 * the renderer never sees (D8, D16). Keyed by the action they follow, so the
 * order is stated where the reason for it is rather than as an index.
 */
function actionItems(
  section: MenuSection,
  extras: Record<string, MenuItemConstructorOptions[]> = {},
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []
  for (const entry of MENU_ACTIONS) {
    if (entry.section !== section) continue
    // A leading separator would draw a rule against the top of the menu.
    if (entry.separatorBefore && items.length > 0) items.push({ type: 'separator' })
    items.push({
      label: context.labels[entry.action] ?? entry.label,
      enabled: context.enabled.includes(entry.action),
      click: () => send(entry.action),
    })
    items.push(...(extras[entry.action] ?? []))
  }
  return items
}

/**
 * Open Recent (D16).
 *
 * Always present, disabled when the list is empty rather than absent — a menu
 * whose items come and go is one people stop trusting. Clicking an entry goes
 * through the same arrival path as a double-click (D15), so the renderer still
 * flushes what it is holding before the document is swapped.
 *
 * The paths never leave this process: the item closes over one, and what the
 * renderer is given for its own copy of this list is an opaque id.
 */
function openRecentItem(): MenuItemConstructorOptions {
  const paths = recentDocumentPaths()
  if (paths.length === 0) {
    return { label: 'Open Recent', submenu: [{ label: 'No Recent Documents', enabled: false }] }
  }
  return {
    label: 'Open Recent',
    submenu: [
      ...paths.map((path) => ({ label: documentName(path), click: () => requestOpen(path) })),
      { type: 'separator' as const },
      // The HIG's own wording for this item, and the reason it sits under a
      // separator: it clears the list, it does not close anything.
      { label: 'Clear Menu', click: () => clearRecentDocuments() },
    ],
  }
}

function template(): MenuItemConstructorOptions[] {
  const items = actionItems

  return [
    // About / Services / Hide / Quit, in the order and with the accelerators
    // macOS users expect. The About panel's contents come from
    // `app.setAboutPanelOptions` in `index.ts`.
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: '&File',
      submenu: [
        // Open Recent belongs with the commands that bring a document *in*,
        // which on this menu is New Project… — Open… and the rest of the File
        // menu are Phase F7's.
        ...items('file', { newProject: [{ type: 'separator' }, openRecentItem()] }),
        { type: 'separator' },
        // macOS quits from the app menu; everywhere else File is where Quit lives.
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        ...items('edit'),
        // The clipboard roles are not decoration: without them the text fields
        // in the project and export dialogs lose ⌘X/⌘C/⌘V on macOS entirely.
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        // Three submenus rather than one long list: what a stroke draws with
        // is a different question from what it draws on, and both are
        // different from editing the character under the cursor.
        { label: 'Character', submenu: items('character') },
        { label: 'Brush', submenu: items('brush') },
        { label: 'Color Target', submenu: items('color') },
      ],
    },
    {
      label: '&View',
      submenu: [
        { role: 'reload' },
        ...(is.dev ? [{ role: 'toggleDevTools' } as MenuItemConstructorOptions] : []),
        { type: 'separator' },
        ...items('view'),
        { type: 'separator' },
        // The editor's own Zoom in/out above scale the screen preview. These
        // scale the whole interface, so they are named for what they do rather
        // than left as a second pair of "Zoom" items meaning something else.
        {
          label: 'Interface Size',
          submenu: [
            { role: 'zoomIn', label: 'Increase' },
            { role: 'zoomOut', label: 'Decrease' },
            { role: 'resetZoom', label: 'Reset' },
          ],
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      label: '&Help',
      submenu: [
        ...items('help'),
        { type: 'separator' },
        {
          label: `${PRODUCT_NAME} on GitHub`,
          click: () => void shell.openExternal(REPO_URL),
        },
        // On macOS About lives in the app menu; the other platforms put it here.
        ...(isMac
          ? []
          : [
              { type: 'separator' } as MenuItemConstructorOptions,
              { label: `About ${PRODUCT_NAME}`, click: () => app.showAboutPanel() },
            ]),
      ],
    },
  ]
}
