import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import { checkForUpdates } from './updater'

/** Hooks the menu calls back into; kept injectable so main owns window creation. */
export interface MenuHandlers {
  /** Open a new, independent File Explorer window (same as the in-app button). */
  onNewWindow: () => void
  /** Manually check GitHub Releases for an update. Defaults to the updater. */
  onCheckForUpdates?: () => void
}

/**
 * Builds the application menu.
 *
 * The app normally relies on Electron's default menu, but adding a
 * "Check for Updates…" item means installing a custom menu — which *replaces*
 * the default. So we rebuild the standard macOS menu from roles (keeping every
 * stock shortcut: Copy/Paste, Minimize, Close, fullscreen, devtools, …) and
 * splice our own items in: "Check for Updates…" under the app menu and
 * "New Window" under File.
 */
export function buildAppMenu(handlers: MenuHandlers): Menu {
  const isMac = process.platform === 'darwin'
  const appName = app.getName()
  const onCheck = handlers.onCheckForUpdates ?? checkForUpdates

  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => onCheck()
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: appName,
            submenu: [
              { role: 'about' as const },
              checkForUpdatesItem,
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          } as MenuItemConstructorOptions
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => handlers.onNewWindow() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
        ...(isMac ? [] : [{ type: 'separator' as const }, checkForUpdatesItem])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? ([{ type: 'separator' }, { role: 'front' }] as MenuItemConstructorOptions[])
          : ([{ role: 'close' }] as MenuItemConstructorOptions[]))
      ]
    }
  ]

  return Menu.buildFromTemplate(template)
}

/** Build and install the application menu. */
export function installAppMenu(handlers: MenuHandlers): void {
  Menu.setApplicationMenu(buildAppMenu(handlers))
}
