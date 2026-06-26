// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../shared/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// fileSystem: every exported fn is a resolved vi.fn().
vi.mock('./fileSystem', () => {
  const fn = (): ReturnType<typeof vi.fn> => vi.fn().mockResolvedValue({ ok: true })
  return {
    readDirectory: fn(),
    getHomeDir: fn(),
    getQuickLinks: fn(),
    getDrives: fn(),
    getFileItem: fn(),
    pathExists: fn(),
    parentOf: fn(),
    joinPath: fn(),
    openPath: fn(),
    revealInFinder: fn(),
    getThumbnail: fn(),
    createFolder: fn(),
    createTextFile: fn(),
    rename: fn(),
    moveToTrash: fn(),
    listConflicts: fn(),
    copy: fn(),
    move: fn(),
    search: fn(),
    getProperties: fn(),
    getFolderSize: fn(),
    readTextPreview: fn(),
    compressZip: fn(),
    extractZip: fn(),
    openInTerminal: fn(),
    openWithApp: fn()
  }
})

// fs: existsSync / writeFileSync / statSync.
const fsState = {
  existsSync: vi.fn().mockReturnValue(true),
  writeFileSync: vi.fn(),
  statSync: vi.fn().mockReturnValue({ isDirectory: () => true })
}
vi.mock('fs', () => ({
  existsSync: (...a: unknown[]) => fsState.existsSync(...a),
  writeFileSync: (...a: unknown[]) => fsState.writeFileSync(...a),
  statSync: (...a: unknown[]) => fsState.statSync(...a)
}))

// ---- Fake BrowserWindow ----------------------------------------------------
type Handler = (...args: unknown[]) => unknown

interface FakeWin {
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  handlers: Record<string, Handler[]>
  emit: (event: string, ...args: unknown[]) => void
  webContents: {
    send: ReturnType<typeof vi.fn>
    once: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    wcHandlers: Record<string, Handler[]>
    wcEmit: (event: string, ...args: unknown[]) => unknown
    isLoading: ReturnType<typeof vi.fn>
    getURL: ReturnType<typeof vi.fn>
    setWindowOpenHandler: ReturnType<typeof vi.fn>
    windowOpenHandler: Handler | null
    executeJavaScript: ReturnType<typeof vi.fn>
    capturePage: ReturnType<typeof vi.fn>
  }
  loadURL: ReturnType<typeof vi.fn>
  loadFile: ReturnType<typeof vi.fn>
  isMinimized: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  isMaximized: ReturnType<typeof vi.fn>
  maximize: ReturnType<typeof vi.fn>
  unmaximize: ReturnType<typeof vi.fn>
  minimize: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  getBounds: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
}

const createdWindows: FakeWin[] = []

function makeFakeWin(): FakeWin {
  const handlers: Record<string, Handler[]> = {}
  const wcHandlers: Record<string, Handler[]> = {}
  const register =
    (store: Record<string, Handler[]>) =>
    (event: string, cb: Handler): unknown => {
      ;(store[event] ??= []).push(cb)
      return undefined
    }
  const win: FakeWin = {
    on: vi.fn(register(handlers)),
    once: vi.fn(register(handlers)),
    handlers,
    emit: (event, ...args) => (handlers[event] ?? []).forEach((h) => h(...args)),
    webContents: {
      send: vi.fn(),
      once: vi.fn(register(wcHandlers)),
      on: vi.fn(register(wcHandlers)),
      wcHandlers,
      wcEmit: (event, ...args) => {
        let last: unknown
        ;(wcHandlers[event] ?? []).forEach((h) => (last = h(...args)))
        return last
      },
      isLoading: vi.fn().mockReturnValue(false),
      getURL: vi.fn().mockReturnValue('app://index'),
      setWindowOpenHandler: vi.fn((cb: Handler) => {
        win.webContents.windowOpenHandler = cb
      }),
      windowOpenHandler: null,
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
      capturePage: vi.fn().mockResolvedValue({ toPNG: () => Buffer.from('png') })
    },
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    isMinimized: vi.fn().mockReturnValue(false),
    restore: vi.fn(),
    focus: vi.fn(),
    isMaximized: vi.fn().mockReturnValue(false),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    minimize: vi.fn(),
    close: vi.fn(),
    getBounds: vi.fn().mockReturnValue({ x: 10, y: 20, width: 800, height: 600 }),
    show: vi.fn()
  }
  return win
}

const BrowserWindowMock = vi.fn(function () {
  const win = makeFakeWin()
  createdWindows.push(win)
  return win
}) as unknown as {
  (): FakeWin
  getFocusedWindow: ReturnType<typeof vi.fn>
  fromWebContents: ReturnType<typeof vi.fn>
  mockImplementationOnce: (fn: (...args: unknown[]) => FakeWin) => unknown
}
BrowserWindowMock.getFocusedWindow = vi.fn().mockReturnValue(null)
BrowserWindowMock.fromWebContents = vi.fn().mockReturnValue(null)

// ---- app -------------------------------------------------------------------
const appHandlers: Record<string, Handler[]> = {}
const appState = {
  isReady: vi.fn().mockReturnValue(true),
  isPackaged: false
}
const appMock = {
  setName: vi.fn(),
  on: vi.fn((event: string, cb: Handler) => {
    ;(appHandlers[event] ??= []).push(cb)
  }),
  emitApp: (event: string, ...args: unknown[]) =>
    (appHandlers[event] ?? []).forEach((h) => h(...args)),
  whenReady: vi.fn().mockResolvedValue(undefined),
  isReady: (...a: unknown[]) => appState.isReady(...a),
  getAppPath: vi.fn().mockReturnValue('/app'),
  getPath: vi.fn().mockReturnValue('/userData'),
  dock: { setIcon: vi.fn() },
  quit: vi.fn(),
  get isPackaged() {
    return appState.isPackaged
  }
}

// ---- ipcMain ---------------------------------------------------------------
const ipcHandle: Record<string, Handler> = {}
const ipcOn: Record<string, Handler> = {}
const ipcMainMock = {
  handle: vi.fn((channel: string, cb: Handler) => {
    ipcHandle[channel] = cb
  }),
  on: vi.fn((channel: string, cb: Handler) => {
    ipcOn[channel] = cb
  })
}

// ---- dialog / shell / nativeImage ------------------------------------------
const dialogMock = { showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }) }
const shellMock = { openExternal: vi.fn() }

function makeImg(isEmpty: boolean): unknown {
  return {
    isEmpty: () => isEmpty,
    resize: vi.fn().mockReturnValue({ isEmpty: () => false, toPNG: () => Buffer.from('x') }),
    toPNG: () => Buffer.from('x')
  }
}
const nativeImageMock = {
  createFromPath: vi.fn(() => makeImg(false)),
  createEmpty: vi.fn(() => makeImg(true)),
  createFromDataURL: vi.fn(() => makeImg(false))
}

vi.mock('electron', () => ({
  app: appMock,
  shell: shellMock,
  BrowserWindow: BrowserWindowMock,
  dialog: dialogMock,
  ipcMain: ipcMainMock,
  nativeImage: nativeImageMock
}))

// Analytics is exercised in analytics.test.ts; here we only verify it's invoked.
vi.mock('./analytics', () => ({ trackAppStarted: vi.fn() }))

// Updater + menu have their own suites; stub them so index just wires them up.
vi.mock('./updater', () => ({
  initAutoUpdater: vi.fn(),
  checkForUpdates: vi.fn(),
  installUpdate: vi.fn()
}))
vi.mock('./menu', () => ({ installAppMenu: vi.fn() }))

import * as FS from './fileSystem'
import { trackAppStarted } from './analytics'
import { initAutoUpdater, checkForUpdates, installUpdate } from './updater'
import { installAppMenu } from './menu'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Import the module fresh, running app.whenReady().then() to completion. */
async function loadModule(): Promise<void> {
  await import('./index')
  // flush whenReady().then microtasks
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * Load with a manually-controlled whenReady. Returns `ready()` which resolves the
 * promise so the whenReady callback (registerIpc + createWindow + pending flush)
 * runs. This lets a test queue open-file paths BEFORE ready.
 */
async function loadModuleDeferred(): Promise<{ ready: () => Promise<void> }> {
  let resolveReady!: () => void
  const readyPromise = new Promise<void>((r) => {
    resolveReady = r
  })
  appMock.whenReady.mockReturnValue(readyPromise)
  await import('./index')
  return {
    ready: async () => {
      resolveReady()
      await readyPromise
      await Promise.resolve()
      await Promise.resolve()
    }
  }
}

function resetAll(): void {
  vi.resetModules()
  createdWindows.length = 0
  for (const k of Object.keys(ipcHandle)) delete ipcHandle[k]
  for (const k of Object.keys(ipcOn)) delete ipcOn[k]
  for (const k of Object.keys(appHandlers)) delete appHandlers[k]
  vi.clearAllMocks()
  fsState.existsSync.mockReturnValue(true)
  fsState.statSync.mockReturnValue({ isDirectory: () => true })
  appState.isReady.mockReturnValue(true)
  appState.isPackaged = false
  appMock.whenReady.mockResolvedValue(undefined)
  appMock.getAppPath.mockReturnValue('/app')
  appMock.getPath.mockReturnValue('/userData')
  BrowserWindowMock.getFocusedWindow.mockReturnValue(null)
  BrowserWindowMock.fromWebContents.mockReturnValue(null)
  dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
  nativeImageMock.createFromPath.mockImplementation(() => makeImg(false))
  nativeImageMock.createEmpty.mockImplementation(() => makeImg(true))
  nativeImageMock.createFromDataURL.mockImplementation(() => makeImg(false))
}

const ORIG_PLATFORM = process.platform
function setPlatform(p: string): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}

beforeEach(() => {
  resetAll()
})

afterEach(() => {
  setPlatform(ORIG_PLATFORM)
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('module init', () => {
  it('sets the app name and registers ipc + creates a window on ready', async () => {
    await loadModule()
    expect(appMock.setName).toHaveBeenCalledWith('File Explorer')
    // ipc registered
    expect(ipcMainMock.handle).toHaveBeenCalledWith(IPC.readDirectory, expect.any(Function))
    expect(ipcMainMock.on).toHaveBeenCalledWith(IPC.startDrag, expect.any(Function))
    // a window was created
    expect(createdWindows.length).toBeGreaterThanOrEqual(1)
    // dock icon set on darwin when icon found
    expect(appMock.dock.setIcon).toHaveBeenCalledWith(join('/app', 'build', 'icon.png'))
    // anonymous usage ping fired on ready
    expect(trackAppStarted).toHaveBeenCalled()
    // application menu installed and auto-update kicked off on ready
    expect(installAppMenu).toHaveBeenCalled()
    expect(initAutoUpdater).toHaveBeenCalled()
  })

  it('routes update IPC into the updater', async () => {
    await loadModule()
    ipcOn[IPC.updateCheck]({})
    expect(checkForUpdates).toHaveBeenCalled()
    ipcOn[IPC.updateInstall]({})
    expect(installUpdate).toHaveBeenCalled()
  })

  it('wires the menu New Window handler to createWindow', async () => {
    await loadModule()
    const before = createdWindows.length
    const handlers = vi.mocked(installAppMenu).mock.calls[0][0]
    handlers.onNewWindow()
    expect(createdWindows.length).toBe(before + 1)
  })

  it('sets UV_THREADPOOL_SIZE when unset', async () => {
    const prev = process.env['UV_THREADPOOL_SIZE']
    delete process.env['UV_THREADPOOL_SIZE']
    await loadModule()
    expect(process.env['UV_THREADPOOL_SIZE']).toBe('16')
    if (prev === undefined) delete process.env['UV_THREADPOOL_SIZE']
    else process.env['UV_THREADPOOL_SIZE'] = prev
  })

  it('does not overwrite UV_THREADPOOL_SIZE when already set', async () => {
    const prev = process.env['UV_THREADPOOL_SIZE']
    process.env['UV_THREADPOOL_SIZE'] = '4'
    await loadModule()
    expect(process.env['UV_THREADPOOL_SIZE']).toBe('4')
    if (prev === undefined) delete process.env['UV_THREADPOOL_SIZE']
    else process.env['UV_THREADPOOL_SIZE'] = prev
  })

  it('does not set the dock icon on non-darwin', async () => {
    setPlatform('win32')
    await loadModule()
    expect(appMock.dock.setIcon).not.toHaveBeenCalled()
  })

  it('does not set the dock icon when no icon file exists', async () => {
    fsState.existsSync.mockReturnValue(false)
    await loadModule()
    expect(appMock.dock.setIcon).not.toHaveBeenCalled()
  })
})

// path import for join expectations
import { join } from 'path'

describe('createWindow branches', () => {
  it('cascades off focused window bounds and loads file when no renderer url', async () => {
    const focused = makeFakeWin()
    BrowserWindowMock.getFocusedWindow.mockReturnValue(focused)
    const prevUrl = process.env['ELECTRON_RENDERER_URL']
    delete process.env['ELECTRON_RENDERER_URL']
    await loadModule()
    const win = createdWindows[createdWindows.length - 1]
    expect(win.loadFile).toHaveBeenCalled()
    expect(win.loadURL).not.toHaveBeenCalled()
    // constructor got x/y derived from focused bounds
    const cfg = (BrowserWindowMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(cfg.x).toBe(40)
    expect(cfg.y).toBe(50)
    if (prevUrl !== undefined) process.env['ELECTRON_RENDERER_URL'] = prevUrl
  })

  it('loads the renderer URL in dev', async () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
    await loadModule()
    const win = createdWindows[createdWindows.length - 1]
    expect(win.loadURL).toHaveBeenCalledWith('http://localhost:5173')
  })

  it('shows the window on ready-to-show and cleans the set on closed', async () => {
    await loadModule()
    const win = createdWindows[0]
    win.emit('ready-to-show')
    expect(win.show).toHaveBeenCalled()
    win.emit('closed')
    // after closed, activate should make a new window because set is empty
    appMock.emitApp('activate')
    expect(createdWindows.length).toBeGreaterThanOrEqual(2)
  })

  it('emits maximize-changed on maximize and unmaximize', async () => {
    await loadModule()
    const win = createdWindows[0]
    win.isMaximized.mockReturnValue(true)
    win.emit('maximize')
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.windowMaximizeChanged, true)
    win.isMaximized.mockReturnValue(false)
    win.emit('unmaximize')
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.windowMaximizeChanged, false)
  })

  it('window open handler opens http externally and denies; denies other schemes', async () => {
    await loadModule()
    const win = createdWindows[0]
    const handler = win.webContents.windowOpenHandler as Handler
    expect(handler({ url: 'https://example.com' })).toEqual({ action: 'deny' })
    expect(shellMock.openExternal).toHaveBeenCalledWith('https://example.com')
    shellMock.openExternal.mockClear()
    expect(handler({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' })
    expect(shellMock.openExternal).not.toHaveBeenCalled()
  })

  it('will-navigate allows same url, blocks different url', async () => {
    await loadModule()
    const win = createdWindows[0]
    const prevent = vi.fn()
    win.webContents.getURL.mockReturnValue('app://index')
    win.webContents.wcEmit('will-navigate', { preventDefault: prevent }, 'app://index')
    expect(prevent).not.toHaveBeenCalled()
    win.webContents.wcEmit('will-navigate', { preventDefault: prevent }, 'http://evil.com')
    expect(prevent).toHaveBeenCalled()
  })
})

describe('FE_DEBUG diagnostics', () => {
  it('wires console/preload/render-gone/did-fail-load handlers', async () => {
    vi.stubEnv('FE_DEBUG', '1')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await loadModule()
    const win = createdWindows[0]
    win.webContents.wcEmit('console-message', {}, 1, 'hello', 5, 'src.js')
    win.webContents.wcEmit('preload-error', {}, '/preload.js', new Error('boom'))
    win.webContents.wcEmit('render-process-gone', {}, { reason: 'crashed' })
    win.webContents.wcEmit('did-fail-load', {}, -3, 'failed')
    expect(logSpy).toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalled()
    logSpy.mockRestore()
    errSpy.mockRestore()
  })
})

describe('FE_SHOT screenshot', () => {
  it('captures page, writes png and quits (with FE_DEMO perf)', async () => {
    vi.useFakeTimers()
    vi.stubEnv('FE_SHOT', '/tmp/shot.png')
    vi.stubEnv('FE_DEMO', 'perf')
    await loadModule()
    const win = createdWindows[0]
    // trigger did-finish-load -> schedules outer setTimeout(1800)
    win.webContents.wcEmit('did-finish-load')
    await vi.advanceTimersByTimeAsync(1800)
    // executeJavaScript called for demo, then perf wait 6000
    expect(win.webContents.executeJavaScript).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(6000)
    await vi.runAllTimersAsync()
    expect(win.webContents.capturePage).toHaveBeenCalled()
    expect(fsState.writeFileSync).toHaveBeenCalledWith('/tmp/shot.png', expect.anything())
    expect(appMock.quit).toHaveBeenCalled()
  })

  it('uses 800ms wait for non-perf demo', async () => {
    vi.useFakeTimers()
    vi.stubEnv('FE_SHOT', '/tmp/shot.png')
    vi.stubEnv('FE_DEMO', 'other')
    await loadModule()
    const win = createdWindows[0]
    win.webContents.wcEmit('did-finish-load')
    await vi.advanceTimersByTimeAsync(1800)
    await vi.advanceTimersByTimeAsync(800)
    await vi.runAllTimersAsync()
    expect(win.webContents.capturePage).toHaveBeenCalled()
    expect(appMock.quit).toHaveBeenCalled()
  })

  it('runs without FE_DEMO and handles capture failure', async () => {
    vi.useFakeTimers()
    vi.stubEnv('FE_SHOT', '/tmp/shot.png')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await loadModule()
    const win = createdWindows[0]
    win.webContents.capturePage.mockRejectedValue(new Error('nope'))
    win.webContents.wcEmit('did-finish-load')
    await vi.advanceTimersByTimeAsync(1800)
    await vi.runAllTimersAsync()
    expect(win.webContents.executeJavaScript).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalledWith('[shot] failed', expect.any(Error))
    expect(appMock.quit).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('ipc handlers route into FS', () => {
  beforeEach(async () => {
    await loadModule()
  })

  it('readDirectory and other simple handlers delegate to FS', async () => {
    const ev = {}
    await ipcHandle[IPC.readDirectory](ev, '/p')
    expect(FS.readDirectory).toHaveBeenCalledWith('/p')
    await ipcHandle[IPC.getHomeDir](ev)
    expect(FS.getHomeDir).toHaveBeenCalled()
    await ipcHandle[IPC.getQuickLinks](ev)
    expect(FS.getQuickLinks).toHaveBeenCalled()
    await ipcHandle[IPC.getDrives](ev)
    expect(FS.getDrives).toHaveBeenCalled()
    await ipcHandle[IPC.getFileItem](ev, '/f')
    expect(FS.getFileItem).toHaveBeenCalledWith('/f')
    await ipcHandle[IPC.pathExists](ev, '/f')
    expect(FS.pathExists).toHaveBeenCalledWith('/f')
    await ipcHandle[IPC.parentOf](ev, '/f')
    expect(FS.parentOf).toHaveBeenCalledWith('/f')
    await ipcHandle[IPC.joinPath](ev, '/b', ['a'])
    expect(FS.joinPath).toHaveBeenCalledWith('/b', ['a'])
    await ipcHandle[IPC.openPath](ev, '/f')
    expect(FS.openPath).toHaveBeenCalledWith('/f')
    await ipcHandle[IPC.revealInFinder](ev, '/f')
    expect(FS.revealInFinder).toHaveBeenCalledWith('/f')
    await ipcHandle[IPC.getThumbnail](ev, '/f', 128)
    expect(FS.getThumbnail).toHaveBeenCalledWith('/f', 128)
    await ipcHandle[IPC.createFolder](ev, '/d', 'n')
    expect(FS.createFolder).toHaveBeenCalledWith('/d', 'n')
    await ipcHandle[IPC.createTextFile](ev, '/d', 'n')
    expect(FS.createTextFile).toHaveBeenCalledWith('/d', 'n')
    await ipcHandle[IPC.rename](ev, '/p', 'n')
    expect(FS.rename).toHaveBeenCalledWith('/p', 'n')
    await ipcHandle[IPC.moveToTrash](ev, ['/p'])
    expect(FS.moveToTrash).toHaveBeenCalledWith(['/p'])
    await ipcHandle[IPC.listConflicts](ev, ['/s'], '/d')
    expect(FS.listConflicts).toHaveBeenCalledWith(['/s'], '/d')
    await ipcHandle[IPC.search](ev, '/r', 'q')
    expect(FS.search).toHaveBeenCalledWith('/r', 'q')
    await ipcHandle[IPC.getProperties](ev, '/p')
    expect(FS.getProperties).toHaveBeenCalledWith('/p')
    await ipcHandle[IPC.getFolderSize](ev, '/p')
    expect(FS.getFolderSize).toHaveBeenCalledWith('/p')
    await ipcHandle[IPC.readTextPreview](ev, '/p', 99)
    expect(FS.readTextPreview).toHaveBeenCalledWith('/p', 99)
    await ipcHandle[IPC.compressZip](ev, ['/s'], '/d')
    expect(FS.compressZip).toHaveBeenCalledWith(['/s'], '/d')
    await ipcHandle[IPC.extractZip](ev, '/z', '/d')
    expect(FS.extractZip).toHaveBeenCalledWith('/z', '/d')
    await ipcHandle[IPC.openInTerminal](ev, '/d')
    expect(FS.openInTerminal).toHaveBeenCalledWith('/d')
  })

  it('copy and move pass a progress sender', async () => {
    const send = vi.fn()
    const ev = { sender: { send } }
    await ipcHandle[IPC.copy](ev, ['/s'], '/d', 'overwrite')
    expect(FS.copy).toHaveBeenCalledWith(['/s'], '/d', 'overwrite', expect.any(Function))
    const copyProgress = (FS.copy as unknown as ReturnType<typeof vi.fn>).mock.calls[0][3]
    copyProgress({ percent: 50 })
    expect(send).toHaveBeenCalledWith(IPC.opProgress, { percent: 50 })

    await ipcHandle[IPC.move](ev, ['/s'], '/d', 'skip')
    expect(FS.move).toHaveBeenCalledWith(['/s'], '/d', 'skip', expect.any(Function))
    const moveProgress = (FS.move as unknown as ReturnType<typeof vi.fn>).mock.calls[0][3]
    moveProgress({ percent: 99 })
    expect(send).toHaveBeenCalledWith(IPC.opProgress, { percent: 99 })
  })

  it('startDrag ignores empty/non-array and starts a drag with cached icon', async () => {
    const startDrag = vi.fn()
    const ev = { sender: { startDrag } }
    ipcOn[IPC.startDrag](ev, [])
    ipcOn[IPC.startDrag](ev, 'not-array')
    expect(startDrag).not.toHaveBeenCalled()
    ipcOn[IPC.startDrag](ev, ['/a', '/b'])
    expect(startDrag).toHaveBeenCalledWith({
      file: '/a',
      files: ['/a', '/b'],
      icon: expect.anything()
    })
  })

  it('startDrag logs when sender.startDrag throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ev = {
      sender: {
        startDrag: vi.fn(() => {
          throw new Error('drag fail')
        })
      }
    }
    ipcOn[IPC.startDrag](ev, ['/a'])
    expect(errSpy).toHaveBeenCalledWith('[startDrag] failed', expect.any(Error))
    errSpy.mockRestore()
  })

  it('openFullDiskAccessSettings deep-links to the preference pane', async () => {
    ipcOn[IPC.openFullDiskAccessSettings]({})
    expect(shellMock.openExternal).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'
    )
  })

  it('openWith: canceled dialog returns ok without opening', async () => {
    const ev = { sender: {} }
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    const res = await ipcHandle[IPC.openWith](ev, '/file.txt')
    expect(res).toEqual({ ok: true })
    expect(FS.openWithApp).not.toHaveBeenCalled()
  })

  it('openWith: no filePaths returns ok', async () => {
    const ev = { sender: {} }
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })
    const res = await ipcHandle[IPC.openWith](ev, '/file.txt')
    expect(res).toEqual({ ok: true })
    expect(FS.openWithApp).not.toHaveBeenCalled()
  })

  it('openWith: with a window passes the window and opens the chosen app', async () => {
    const win = makeFakeWin()
    BrowserWindowMock.fromWebContents.mockReturnValue(win)
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/Applications/X.app'] })
    const ev = { sender: {} }
    await ipcHandle[IPC.openWith](ev, '/file.txt')
    expect(dialogMock.showOpenDialog).toHaveBeenCalledWith(win, expect.any(Object))
    expect(FS.openWithApp).toHaveBeenCalledWith('/Applications/X.app', '/file.txt')
  })

  it('openWith: without a window uses the no-window dialog overload', async () => {
    BrowserWindowMock.fromWebContents.mockReturnValue(null)
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/Applications/Y.app'] })
    const ev = { sender: {} }
    await ipcHandle[IPC.openWith](ev, '/f.txt')
    expect(dialogMock.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ title: expect.any(String) }))
    expect(FS.openWithApp).toHaveBeenCalledWith('/Applications/Y.app', '/f.txt')
  })
})

describe('window control ipc', () => {
  beforeEach(async () => {
    await loadModule()
  })

  it('minimize/toggleMaximize/close use the sender window', async () => {
    const win = makeFakeWin()
    BrowserWindowMock.fromWebContents.mockReturnValue(win)
    const ev = { sender: {} }

    ipcOn[IPC.windowMinimize](ev)
    expect(win.minimize).toHaveBeenCalled()

    win.isMaximized.mockReturnValue(false)
    ipcOn[IPC.windowToggleMaximize](ev)
    expect(win.maximize).toHaveBeenCalled()

    win.isMaximized.mockReturnValue(true)
    ipcOn[IPC.windowToggleMaximize](ev)
    expect(win.unmaximize).toHaveBeenCalled()

    ipcOn[IPC.windowClose](ev)
    expect(win.close).toHaveBeenCalled()
  })

  it('window controls no-op when no sender window', async () => {
    BrowserWindowMock.fromWebContents.mockReturnValue(null)
    const ev = { sender: {} }
    expect(() => ipcOn[IPC.windowMinimize](ev)).not.toThrow()
    expect(() => ipcOn[IPC.windowToggleMaximize](ev)).not.toThrow()
    expect(() => ipcOn[IPC.windowClose](ev)).not.toThrow()
  })

  it('windowNew creates a window', async () => {
    const before = createdWindows.length
    ipcOn[IPC.windowNew]({})
    expect(createdWindows.length).toBe(before + 1)
  })
})

describe('dragIcon caching and fallbacks', () => {
  it('falls back to data URL when appIconPath is empty', async () => {
    // No icon file found -> createEmpty -> isEmpty true -> createFromDataURL
    fsState.existsSync.mockReturnValue(false)
    await loadModule()
    const startDrag = vi.fn()
    ipcOn[IPC.startDrag]({ sender: { startDrag } }, ['/a'])
    expect(nativeImageMock.createEmpty).toHaveBeenCalled()
    expect(nativeImageMock.createFromDataURL).toHaveBeenCalled()
    // second call uses cached icon (createFromDataURL not called again)
    nativeImageMock.createFromDataURL.mockClear()
    ipcOn[IPC.startDrag]({ sender: { startDrag } }, ['/b'])
    expect(nativeImageMock.createFromDataURL).not.toHaveBeenCalled()
  })

  it('resizes a real icon when one exists', async () => {
    fsState.existsSync.mockReturnValue(true)
    await loadModule()
    const startDrag = vi.fn()
    ipcOn[IPC.startDrag]({ sender: { startDrag } }, ['/a'])
    expect(nativeImageMock.createFromPath).toHaveBeenCalled()
  })
})

describe('open-file handler', () => {
  it('queues the path when app not ready and flushes on ready (window not loading)', async () => {
    appState.isReady.mockReturnValue(false)
    const { ready } = await loadModuleDeferred()
    // open-file handler is registered synchronously at module top; emit while not ready
    const preventDefault = vi.fn()
    appMock.emitApp('open-file', { preventDefault }, '/Users/test/queued')
    expect(preventDefault).toHaveBeenCalled()
    // no window yet (createWindow happens in whenReady)
    expect(createdWindows.length).toBe(0)
    // Now app becomes ready and a window is created (not loading) -> flush runs synchronously
    appState.isReady.mockReturnValue(true)
    await ready()
    const win = createdWindows[0]
    win.webContents.isLoading.mockReturnValue(false)
    // flush() ran during whenReady; the pending path was navigated on the new window.
    // The window had no focused window so openPathInExplorer used [...windows][0].
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.navigateToPath, '/Users/test/queued')
  })

  it('queues pending path and flushes once the window finishes loading', async () => {
    appState.isReady.mockReturnValue(false)
    const { ready } = await loadModuleDeferred()
    appMock.emitApp('open-file', { preventDefault: vi.fn() }, '/Users/test/queued2')
    // Make the created window report as loading so flush is deferred to did-finish-load.
    BrowserWindowMock.mockImplementationOnce(function () {
      const w = makeFakeWin()
      w.webContents.isLoading.mockReturnValue(true)
      createdWindows.push(w)
      return w
    })
    appState.isReady.mockReturnValue(true)
    await ready()
    const win = createdWindows[0]
    expect(win.webContents.isLoading).toHaveReturnedWith(true)
    // Nothing navigated yet (deferred). Fire did-finish-load to flush.
    expect(win.webContents.send).not.toHaveBeenCalledWith(IPC.navigateToPath, '/Users/test/queued2')
    win.webContents.wcEmit('did-finish-load')
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.navigateToPath, '/Users/test/queued2')
  })

  it('opens a fresh window when the only window was closed before the deferred flush ran', async () => {
    appState.isReady.mockReturnValue(false)
    const { ready } = await loadModuleDeferred()
    appMock.emitApp('open-file', { preventDefault: vi.fn() }, '/Users/test/late')
    // The ready window reports as loading, so flush is deferred to did-finish-load.
    BrowserWindowMock.mockImplementationOnce(function () {
      const w = makeFakeWin()
      w.webContents.isLoading.mockReturnValue(true)
      createdWindows.push(w)
      return w
    })
    appState.isReady.mockReturnValue(true)
    await ready()
    const loading = createdWindows[0]
    // Window closes (removed from the windows set) before the deferred flush fires.
    loading.emit('closed')
    BrowserWindowMock.getFocusedWindow.mockReturnValue(null)
    const before = createdWindows.length
    // Now flush runs openPathInExplorer with an empty windows set + no focused window
    // -> it must create a brand new window and defer navigation to its load.
    loading.webContents.wcEmit('did-finish-load')
    expect(createdWindows.length).toBe(before + 1)
    const fresh = createdWindows[createdWindows.length - 1]
    fresh.webContents.wcEmit('did-finish-load')
    expect(fresh.webContents.send).toHaveBeenCalledWith(IPC.navigateToPath, '/Users/test/late')
  })

  it('opens immediately when ready with a window: navigates focused window', async () => {
    await loadModule()
    const focused = makeFakeWin()
    BrowserWindowMock.getFocusedWindow.mockReturnValue(focused)
    appState.isReady.mockReturnValue(true)
    const preventDefault = vi.fn()
    appMock.emitApp('open-file', { preventDefault }, '/Users/test/folder')
    expect(preventDefault).toHaveBeenCalled()
    expect(focused.webContents.send).toHaveBeenCalledWith(IPC.navigateToPath, '/Users/test/folder')
  })

  it('restores a minimized focused window before navigating', async () => {
    await loadModule()
    const focused = makeFakeWin()
    focused.isMinimized.mockReturnValue(true)
    BrowserWindowMock.getFocusedWindow.mockReturnValue(focused)
    appMock.emitApp('open-file', { preventDefault: vi.fn() }, '/Users/test/folder')
    expect(focused.restore).toHaveBeenCalled()
    expect(focused.focus).toHaveBeenCalled()
  })

  it('navigates to the file parent when path is a file', async () => {
    await loadModule()
    const focused = makeFakeWin()
    BrowserWindowMock.getFocusedWindow.mockReturnValue(focused)
    fsState.statSync.mockReturnValue({ isDirectory: () => false })
    appMock.emitApp('open-file', { preventDefault: vi.fn() }, '/Users/test/file.txt')
    expect(focused.webContents.send).toHaveBeenCalledWith(IPC.navigateToPath, '/Users/test')
  })

  it('returns silently when statSync throws', async () => {
    await loadModule()
    const focused = makeFakeWin()
    BrowserWindowMock.getFocusedWindow.mockReturnValue(focused)
    fsState.statSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    appMock.emitApp('open-file', { preventDefault: vi.fn() }, '/missing')
    expect(focused.webContents.send).not.toHaveBeenCalledWith(IPC.navigateToPath, expect.anything())
  })

  it('creates a window when none focused and uses the windows set, then falls back to createWindow when no windows', async () => {
    await loadModule()
    // Force getFocusedWindow null and the windows set to be the created one
    BrowserWindowMock.getFocusedWindow.mockReturnValue(null)
    // The module already has 1 window in its set (createWindow on ready). It is
    // used as [...windows][0].
    const existing = createdWindows[0]
    appMock.emitApp('open-file', { preventDefault: vi.fn() }, '/Users/test/folder')
    expect(existing.webContents.send).toHaveBeenCalledWith(IPC.navigateToPath, '/Users/test/folder')
  })
})

describe('window-all-closed', () => {
  it('quits on non-darwin', async () => {
    setPlatform('win32')
    await loadModule()
    appMock.emitApp('window-all-closed')
    expect(appMock.quit).toHaveBeenCalled()
  })

  it('does not quit on darwin', async () => {
    setPlatform('darwin')
    await loadModule()
    appMock.emitApp('window-all-closed')
    expect(appMock.quit).not.toHaveBeenCalled()
  })
})

describe('activate', () => {
  it('creates a window only when none exist', async () => {
    await loadModule()
    const after = createdWindows.length
    // windows set has 1 -> no new window
    appMock.emitApp('activate')
    expect(createdWindows.length).toBe(after)
    // close it -> set empty -> activate creates one
    createdWindows[0].emit('closed')
    appMock.emitApp('activate')
    expect(createdWindows.length).toBe(after + 1)
  })
})
