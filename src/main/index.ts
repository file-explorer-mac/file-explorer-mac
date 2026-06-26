import { app, shell, BrowserWindow, dialog, ipcMain, nativeImage, type IpcMainEvent } from 'electron'
import { join, dirname } from 'path'
import { existsSync, writeFileSync, statSync } from 'fs'
import { IPC, type ConflictPolicy } from '../shared/types'
import * as FS from './fileSystem'
import { trackAppStarted } from './analytics'
import { initAutoUpdater, checkForUpdates, installUpdate } from './updater'
import { installAppMenu } from './menu'

// Name the running app before it's ready so the macOS menu bar, notifications,
// and the userData directory use "File Explorer" instead of Electron's default.
// (The packaged build's Dock tile/bundle name comes from build.productName in
// package.json; under `electron-vite dev` the Dock tile is Electron's own
// launcher bundle, so the hover label there still reads "Electron".)
app.setName('File Explorer')

// Parallelize filesystem stats (libuv threadpool) so large directories scan fast.
if (!process.env['UV_THREADPOOL_SIZE']) process.env['UV_THREADPOOL_SIZE'] = '16'

// Folders the OS asked us to open before a window was ready.
const pendingOpenPaths: string[] = []

/** Open a folder (or a file's parent) the OS handed us, in a window. */
function openPathInExplorer(p: string): void {
  let target = p
  try {
    if (!statSync(p).isDirectory()) target = dirname(p)
  } catch {
    return
  }
  const win = BrowserWindow.getFocusedWindow() ?? [...windows][0] ?? null
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
    win.webContents.send(IPC.navigateToPath, target)
  } else {
    const w = createWindow()
    w.webContents.once('did-finish-load', () => w.webContents.send(IPC.navigateToPath, target))
  }
}

// macOS delivers folders/files opened via the default handler or "Open With" here.
app.on('open-file', (event, p) => {
  event.preventDefault()
  if (app.isReady() && windows.size > 0) openPathInExplorer(p)
  else pendingOpenPaths.push(p)
})

// 1x1 transparent PNG used as a last-resort drag icon (startDrag requires one).
const FALLBACK_DRAG_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let cachedDragIcon: Electron.NativeImage | null = null
function dragIcon(): Electron.NativeImage {
  if (cachedDragIcon && !cachedDragIcon.isEmpty()) return cachedDragIcon
  const p = appIconPath()
  let img = p ? nativeImage.createFromPath(p) : nativeImage.createEmpty()
  img = img.isEmpty()
    ? nativeImage.createFromDataURL(FALLBACK_DRAG_ICON)
    : img.resize({ width: 64, height: 64 })
  cachedDragIcon = img
  return img
}

const windows = new Set<BrowserWindow>()

function appIconPath(): string | undefined {
  // build/icon.png ships in the app root in dev and in resources when packaged.
  const candidates = [
    join(app.getAppPath(), 'build', 'icon.png'),
    join(process.resourcesPath || '', 'build', 'icon.png')
  ]
  return candidates.find((p) => p && existsSync(p))
}

function createWindow(): BrowserWindow {
  // Cascade new windows off the currently focused one.
  const focused = BrowserWindow.getFocusedWindow()
  const base = focused?.getBounds()

  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 640,
    minHeight: 420,
    x: base ? base.x + 30 : undefined,
    y: base ? base.y + 30 : undefined,
    show: false,
    title: 'File Explorer',
    backgroundColor: '#f3f3f3',
    // Frameless so we can render the title bar / tab strip ourselves.
    frame: false,
    titleBarStyle: 'hidden',
    // Push macOS traffic lights off-screen; we draw our own controls.
    trafficLightPosition: { x: -100, y: -100 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  windows.add(win)
  win.on('closed', () => windows.delete(win))
  win.on('ready-to-show', () => win.show())

  // Optional diagnostics: forward renderer/preload problems to the terminal.
  if (process.env['FE_DEBUG']) {
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
    })
    win.webContents.on('preload-error', (_e, preloadPath, error) => {
      console.error('[preload-error]', preloadPath, error)
    })
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error('[render-process-gone]', details.reason)
    })
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      console.error('[did-fail-load]', code, desc)
    })
  }

  // Optional one-shot screenshot for verification (captures only this window).
  if (process.env['FE_SHOT']) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (process.env['FE_DEMO']) {
            await win.webContents.executeJavaScript(
              `window.__feDemo && window.__feDemo(${JSON.stringify(process.env['FE_DEMO'])})`
            )
            await new Promise((r) => setTimeout(r, process.env['FE_DEMO'] === 'perf' ? 6000 : 800))
          }
          const img = await win.webContents.capturePage()
          writeFileSync(process.env['FE_SHOT'] as string, img.toPNG())
        } catch (err) {
          console.error('[shot] failed', err)
        }
        app.quit()
      }, 1800)
    })
  }

  const emitMaximize = (): void => {
    win.webContents.send(IPC.windowMaximizeChanged, win.isMaximized())
  }
  win.on('maximize', emitMaximize)
  win.on('unmaximize', emitMaximize)

  // Only hand http(s) URLs to the OS; never open arbitrary schemes externally.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // This app only ever renders its own bundled page. Block any attempt to
  // navigate the top frame elsewhere — navigated content would inherit the
  // privileged `window.api` bridge (full filesystem + exec).
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function registerIpc(): void {
  ipcMain.handle(IPC.readDirectory, (_e, p: string) => FS.readDirectory(p))
  ipcMain.handle(IPC.getHomeDir, () => FS.getHomeDir())
  ipcMain.handle(IPC.getQuickLinks, () => FS.getQuickLinks())
  ipcMain.handle(IPC.getDrives, () => FS.getDrives())
  ipcMain.handle(IPC.getFileItem, (_e, p: string) => FS.getFileItem(p))
  ipcMain.handle(IPC.pathExists, (_e, p: string) => FS.pathExists(p))
  ipcMain.handle(IPC.parentOf, (_e, p: string) => FS.parentOf(p))
  ipcMain.handle(IPC.joinPath, (_e, base: string, parts: string[]) => FS.joinPath(base, parts))
  ipcMain.handle(IPC.openPath, (_e, p: string) => FS.openPath(p))
  ipcMain.handle(IPC.revealInFinder, (_e, p: string) => FS.revealInFinder(p))
  ipcMain.handle(IPC.getThumbnail, (_e, p: string, size: number) => FS.getThumbnail(p, size))
  ipcMain.on(IPC.startDrag, (e, paths: string[]) => {
    if (!Array.isArray(paths) || paths.length === 0) return
    try {
      e.sender.startDrag({ file: paths[0], files: paths, icon: dragIcon() })
    } catch (err) {
      console.error('[startDrag] failed', err)
    }
  })
  ipcMain.on(IPC.openFullDiskAccessSettings, () => {
    // Full Disk Access cannot be requested via a dialog; deep-link to its pane.
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
  })
  ipcMain.handle(IPC.createFolder, (_e, dir: string, name: string) => FS.createFolder(dir, name))
  ipcMain.handle(IPC.createTextFile, (_e, dir: string, name: string) => FS.createTextFile(dir, name))
  ipcMain.handle(IPC.rename, (_e, p: string, name: string) => FS.rename(p, name))
  ipcMain.handle(IPC.moveToTrash, (_e, paths: string[]) => FS.moveToTrash(paths))
  ipcMain.handle(IPC.listConflicts, (_e, src: string[], dest: string) =>
    FS.listConflicts(src, dest)
  )
  ipcMain.handle(IPC.copy, (e, src: string[], dest: string, policy: ConflictPolicy) =>
    FS.copy(src, dest, policy, (p) => e.sender.send(IPC.opProgress, p))
  )
  ipcMain.handle(IPC.move, (e, src: string[], dest: string, policy: ConflictPolicy) =>
    FS.move(src, dest, policy, (p) => e.sender.send(IPC.opProgress, p))
  )
  ipcMain.handle(IPC.search, (_e, root: string, q: string) => FS.search(root, q))
  ipcMain.handle(IPC.getProperties, (_e, p: string) => FS.getProperties(p))
  ipcMain.handle(IPC.getFolderSize, (_e, p: string) => FS.getFolderSize(p))
  ipcMain.handle(IPC.readTextPreview, (_e, p: string, max?: number) =>
    FS.readTextPreview(p, max)
  )
  ipcMain.handle(IPC.compressZip, (_e, src: string[], dest: string) =>
    FS.compressZip(src, dest)
  )
  ipcMain.handle(IPC.extractZip, (_e, zip: string, dest: string) => FS.extractZip(zip, dest))
  ipcMain.handle(IPC.openInTerminal, (_e, dir: string) => FS.openInTerminal(dir))
  ipcMain.handle(IPC.openWith, async (e, filePath: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = {
      title: 'Choose an application to open the file',
      defaultPath: '/Applications',
      properties: ['openFile' as const],
      filters: [{ name: 'Applications', extensions: ['app'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths.length) return { ok: true }
    return FS.openWithApp(res.filePaths[0], filePath)
  })

  const senderWindow = (e: IpcMainEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(e.sender)

  ipcMain.on(IPC.windowMinimize, (e) => senderWindow(e)?.minimize())
  ipcMain.on(IPC.windowToggleMaximize, (e) => {
    const w = senderWindow(e)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on(IPC.windowClose, (e) => senderWindow(e)?.close())
  ipcMain.on(IPC.windowNew, () => createWindow())

  ipcMain.on(IPC.updateCheck, () => checkForUpdates())
  ipcMain.on(IPC.updateInstall, () => installUpdate())
}

app.whenReady().then(() => {
  const icon = appIconPath()
  if (icon && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon)
  }
  registerIpc()
  installAppMenu({ onNewWindow: () => createWindow() })
  createWindow()

  // Fire-and-forget anonymous usage ping (no-op in dev / when opted out).
  trackAppStarted()

  // Check GitHub Releases for an update and download it in the background
  // (no-op in dev / when opted out). The renderer shows a banner when ready.
  initAutoUpdater()

  // If launched by opening a folder, navigate to it once the window has loaded.
  if (pendingOpenPaths.length) {
    const w = [...windows][0]
    const flush = (): void => pendingOpenPaths.splice(0).forEach(openPathInExplorer)
    if (w && w.webContents.isLoading()) w.webContents.once('did-finish-load', flush)
    else flush()
  }

  app.on('activate', () => {
    if (windows.size === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
