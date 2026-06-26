// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../shared/types'

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn()
  },
  webUtils: { getPathForFile: vi.fn().mockReturnValue('/path/for/file') }
}))

import { contextBridge, ipcRenderer, webUtils } from 'electron'

type AnyApi = Record<string, (...a: unknown[]) => unknown> & { startDir: string }

/** Force the contextIsolated branch, reset modules, and import the preload fresh. */
async function loadPreload(contextIsolated: boolean): Promise<void> {
  Object.defineProperty(process, 'contextIsolated', {
    value: contextIsolated,
    configurable: true
  })
  vi.resetModules()
  await import('./index')
}

/** Pull the exposed api out of whichever branch put it there. */
function getExposedApi(): AnyApi {
  const exposeMock = vi.mocked(contextBridge.exposeInMainWorld)
  if (exposeMock.mock.calls.length > 0) {
    return exposeMock.mock.calls[exposeMock.mock.calls.length - 1][1] as AnyApi
  }
  return (globalThis as unknown as { window: { api: AnyApi } }).window.api
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

afterEach(() => {
  // Clean up the window shim we install for the non-isolated branch.
  delete (globalThis as Record<string, unknown>).window
})

describe('preload bridge wiring', () => {
  it('exposes the api via contextBridge when context is isolated', async () => {
    await loadPreload(true)
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1)
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('api', expect.any(Object))
    const api = vi.mocked(contextBridge.exposeInMainWorld).mock.calls[0][1] as AnyApi
    expect(typeof api.readDirectory).toBe('function')
  })

  it('falls back to window.api when context isolation is disabled', async () => {
    ;(globalThis as Record<string, unknown>).window = {}
    await loadPreload(false)
    expect(contextBridge.exposeInMainWorld).not.toHaveBeenCalled()
    const api = (globalThis as unknown as { window: { api: AnyApi } }).window.api
    expect(typeof api.readDirectory).toBe('function')
  })
})

describe('startDir from FE_START_DIR', () => {
  it('uses the env var when set', async () => {
    vi.stubEnv('FE_START_DIR', '/start/here')
    await loadPreload(true)
    expect(getExposedApi().startDir).toBe('/start/here')
  })

  it('defaults to empty string when unset', async () => {
    vi.stubEnv('FE_START_DIR', '')
    await loadPreload(true)
    expect(getExposedApi().startDir).toBe('')
  })
})

describe('invoke-based methods', () => {
  let api: AnyApi
  beforeEach(async () => {
    await loadPreload(true)
    api = getExposedApi()
    vi.mocked(ipcRenderer.invoke).mockClear()
  })

  it('readDirectory', () => {
    api.readDirectory('/p')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.readDirectory, '/p')
  })
  it('getHomeDir', () => {
    api.getHomeDir()
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.getHomeDir)
  })
  it('getQuickLinks', () => {
    api.getQuickLinks()
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.getQuickLinks)
  })
  it('getDrives', () => {
    api.getDrives()
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.getDrives)
  })
  it('getFileItem', () => {
    api.getFileItem('/p')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.getFileItem, '/p')
  })
  it('pathExists', () => {
    api.pathExists('/p')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.pathExists, '/p')
  })
  it('parentOf', () => {
    api.parentOf('/p')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.parentOf, '/p')
  })
  it('joinPath passes parts as an array', () => {
    api.joinPath('/base', 'a', 'b', 'c')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.joinPath, '/base', ['a', 'b', 'c'])
  })
  it('openPath', () => {
    api.openPath('/p')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.openPath, '/p')
  })
  it('revealInFinder', () => {
    api.revealInFinder('/p')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.revealInFinder, '/p')
  })
  it('getThumbnail', () => {
    api.getThumbnail('/p', 128)
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.getThumbnail, '/p', 128)
  })
  it('createFolder', () => {
    api.createFolder('/dir', 'name')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.createFolder, '/dir', 'name')
  })
  it('createTextFile', () => {
    api.createTextFile('/dir', 'name')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.createTextFile, '/dir', 'name')
  })
  it('rename', () => {
    api.rename('/p', 'new')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.rename, '/p', 'new')
  })
  it('moveToTrash', () => {
    api.moveToTrash(['/a', '/b'])
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.moveToTrash, ['/a', '/b'])
  })
  it('listConflicts', () => {
    api.listConflicts(['/s'], '/dest')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.listConflicts, ['/s'], '/dest')
  })
  it('copy passes policy', () => {
    api.copy(['/s'], '/dest', 'overwrite')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.copy, ['/s'], '/dest', 'overwrite')
  })
  it('move passes policy', () => {
    api.move(['/s'], '/dest', 'skip')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.move, ['/s'], '/dest', 'skip')
  })
  it('search', () => {
    api.search('/root', 'query')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.search, '/root', 'query')
  })
  it('getProperties', () => {
    api.getProperties('/p')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.getProperties, '/p')
  })
  it('getFolderSize', () => {
    api.getFolderSize('/p')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.getFolderSize, '/p')
  })
  it('readTextPreview', () => {
    api.readTextPreview('/p', 999)
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.readTextPreview, '/p', 999)
  })
  it('compressZip', () => {
    api.compressZip(['/s'], '/dest.zip')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.compressZip, ['/s'], '/dest.zip')
  })
  it('extractZip', () => {
    api.extractZip('/a.zip', '/dest')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.extractZip, '/a.zip', '/dest')
  })
  it('openWith', () => {
    api.openWith('/p')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.openWith, '/p')
  })
  it('openInTerminal', () => {
    api.openInTerminal('/dir')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC.openInTerminal, '/dir')
  })
})

describe('send-based methods', () => {
  let api: AnyApi
  beforeEach(async () => {
    await loadPreload(true)
    api = getExposedApi()
    vi.mocked(ipcRenderer.send).mockClear()
  })

  it('startDrag', () => {
    api.startDrag(['/a', '/b'])
    expect(ipcRenderer.send).toHaveBeenCalledWith(IPC.startDrag, ['/a', '/b'])
  })
  it('openFullDiskAccessSettings', () => {
    api.openFullDiskAccessSettings()
    expect(ipcRenderer.send).toHaveBeenCalledWith(IPC.openFullDiskAccessSettings)
  })
  it('windowMinimize', () => {
    api.windowMinimize()
    expect(ipcRenderer.send).toHaveBeenCalledWith(IPC.windowMinimize)
  })
  it('windowToggleMaximize', () => {
    api.windowToggleMaximize()
    expect(ipcRenderer.send).toHaveBeenCalledWith(IPC.windowToggleMaximize)
  })
  it('windowClose', () => {
    api.windowClose()
    expect(ipcRenderer.send).toHaveBeenCalledWith(IPC.windowClose)
  })
  it('windowNew', () => {
    api.windowNew()
    expect(ipcRenderer.send).toHaveBeenCalledWith(IPC.windowNew)
  })
  it('checkForUpdates', () => {
    api.checkForUpdates()
    expect(ipcRenderer.send).toHaveBeenCalledWith(IPC.updateCheck)
  })
  it('installUpdate', () => {
    api.installUpdate()
    expect(ipcRenderer.send).toHaveBeenCalledWith(IPC.updateInstall)
  })
})

describe('getPathForFile delegates to webUtils', () => {
  it('returns webUtils result', async () => {
    await loadPreload(true)
    const api = getExposedApi()
    const file = { name: 'f.txt' } as unknown as File
    const result = api.getPathForFile(file)
    expect(webUtils.getPathForFile).toHaveBeenCalledWith(file)
    expect(result).toBe('/path/for/file')
  })
})

describe('subscription (on*) methods', () => {
  let api: AnyApi
  beforeEach(async () => {
    await loadPreload(true)
    api = getExposedApi()
    vi.mocked(ipcRenderer.on).mockClear()
    vi.mocked(ipcRenderer.removeListener).mockClear()
  })

  it('onMaximizeChange registers, forwards arg, and unsubscribes', () => {
    const cb = vi.fn()
    const unsub = api.onMaximizeChange(cb) as () => void
    expect(ipcRenderer.on).toHaveBeenCalledWith(IPC.windowMaximizeChanged, expect.any(Function))
    const listener = vi.mocked(ipcRenderer.on).mock.calls[0][1] as (
      e: unknown,
      v: unknown
    ) => void
    listener({}, true)
    expect(cb).toHaveBeenCalledWith(true)
    unsub()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      IPC.windowMaximizeChanged,
      listener
    )
  })

  it('onOpProgress registers, forwards arg, and unsubscribes', () => {
    const cb = vi.fn()
    const progress = { kind: 'copy', current: 1, total: 2 }
    const unsub = api.onOpProgress(cb) as () => void
    expect(ipcRenderer.on).toHaveBeenCalledWith(IPC.opProgress, expect.any(Function))
    const listener = vi.mocked(ipcRenderer.on).mock.calls[0][1] as (
      e: unknown,
      v: unknown
    ) => void
    listener({}, progress)
    expect(cb).toHaveBeenCalledWith(progress)
    unsub()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(IPC.opProgress, listener)
  })

  it('onOpenPath registers, forwards arg, and unsubscribes', () => {
    const cb = vi.fn()
    const unsub = api.onOpenPath(cb) as () => void
    expect(ipcRenderer.on).toHaveBeenCalledWith(IPC.navigateToPath, expect.any(Function))
    const listener = vi.mocked(ipcRenderer.on).mock.calls[0][1] as (
      e: unknown,
      v: unknown
    ) => void
    listener({}, '/go/here')
    expect(cb).toHaveBeenCalledWith('/go/here')
    unsub()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(IPC.navigateToPath, listener)
  })

  it('onUpdateStatus registers, forwards arg, and unsubscribes', () => {
    const cb = vi.fn()
    const state = { status: 'downloaded', version: '2.0.0' }
    const unsub = api.onUpdateStatus(cb) as () => void
    expect(ipcRenderer.on).toHaveBeenCalledWith(IPC.updateStatus, expect.any(Function))
    const listener = vi.mocked(ipcRenderer.on).mock.calls[0][1] as (
      e: unknown,
      v: unknown
    ) => void
    listener({}, state)
    expect(cb).toHaveBeenCalledWith(state)
    unsub()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(IPC.updateStatus, listener)
  })
})
