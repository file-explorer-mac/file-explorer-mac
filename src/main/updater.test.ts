// @vitest-environment node
import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC, type UpdateState } from '../shared/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// autoUpdater is an EventEmitter with the methods/props the module touches.
class FakeAutoUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  currentVersion = { version: '1.0.0' }
  checkForUpdates = vi.fn().mockResolvedValue(undefined)
  quitAndInstall = vi.fn()
}
let updater: FakeAutoUpdater
vi.mock('electron-updater', () => ({
  get autoUpdater() {
    return updater
  }
}))

const appState = { isPackaged: true }
// Two fake windows so we can assert the state is broadcast to *all* of them.
const sent: { channel: string; state: UpdateState }[] = []
function makeWin(destroyed = false): unknown {
  return {
    isDestroyed: () => destroyed,
    webContents: {
      send: (channel: string, state: UpdateState) => sent.push({ channel, state })
    }
  }
}
let windows: unknown[]
vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged
    }
  },
  BrowserWindow: {
    getAllWindows: () => windows
  }
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

async function load(): Promise<typeof import('./updater')> {
  return import('./updater')
}

/** The most recent UpdateState broadcast to the renderer. */
function lastState(): UpdateState | undefined {
  return sent[sent.length - 1]?.state
}

beforeEach(() => {
  vi.resetModules()
  updater = new FakeAutoUpdater()
  windows = [makeWin(), makeWin()]
  sent.length = 0
  appState.isPackaged = true
  delete process.env['FE_NO_UPDATES']
  delete process.env['FE_UPDATES_DEBUG']
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('initAutoUpdater', () => {
  it('no-ops in dev (unpackaged) — never reaches out', async () => {
    appState.isPackaged = false
    const { initAutoUpdater } = await load()
    initAutoUpdater()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('no-ops when FE_NO_UPDATES is set even in a packaged build', async () => {
    process.env['FE_NO_UPDATES'] = '1'
    const { initAutoUpdater } = await load()
    initAutoUpdater()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('configures autoUpdater and kicks off a background check when packaged', async () => {
    const { initAutoUpdater } = await load()
    initAutoUpdater()
    expect(updater.autoDownload).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('is idempotent — a second call does not re-check', async () => {
    const { initAutoUpdater } = await load()
    initAutoUpdater()
    initAutoUpdater()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('broadcasts the downloaded state to every live window', async () => {
    const { initAutoUpdater } = await load()
    initAutoUpdater()
    updater.emit('update-downloaded', { version: '2.0.0' })
    const downloaded = sent.filter((s) => s.channel === IPC.updateStatus)
    expect(downloaded).toHaveLength(2) // one per window
    expect(downloaded[0].state).toEqual({ status: 'downloaded', version: '2.0.0' })
  })

  it('skips destroyed windows when broadcasting', async () => {
    windows = [makeWin(true), makeWin(false)]
    const { initAutoUpdater } = await load()
    initAutoUpdater()
    sent.length = 0
    updater.emit('update-not-available', {})
    expect(sent).toHaveLength(1)
  })

  it('maps download-progress to a rounded percent', async () => {
    const { initAutoUpdater } = await load()
    initAutoUpdater()
    sent.length = 0
    updater.emit('download-progress', { percent: 42.7 })
    expect(lastState()).toMatchObject({ status: 'downloading', percent: 43 })
  })
})

describe('checkForUpdates (manual)', () => {
  it('flags the not-available result as manual so the UI can say "up to date"', async () => {
    const { checkForUpdates } = await load()
    checkForUpdates()
    expect(updater.checkForUpdates).toHaveBeenCalled()
    updater.emit('update-not-available', {})
    expect(lastState()).toEqual({ status: 'not-available', manual: true })
  })

  it('reports a friendly error instead of failing silently when disabled', async () => {
    appState.isPackaged = false
    const { checkForUpdates } = await load()
    checkForUpdates()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(lastState()).toMatchObject({ status: 'error', manual: true })
  })

  it('surfaces autoUpdater errors as an error state', async () => {
    const { checkForUpdates } = await load()
    checkForUpdates()
    updater.emit('error', new Error('network down'))
    expect(lastState()).toEqual({ status: 'error', manual: true, message: 'network down' })
  })

  it('swallows a rejected check (the error event carries the message)', async () => {
    updater.checkForUpdates.mockRejectedValueOnce(new Error('boom'))
    const { checkForUpdates } = await load()
    expect(() => checkForUpdates()).not.toThrow()
    await tick()
  })
})

describe('installUpdate', () => {
  it('quits and installs, relaunching afterwards', async () => {
    const { installUpdate } = await load()
    installUpdate()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('does nothing when updates are disabled', async () => {
    appState.isPackaged = false
    const { installUpdate } = await load()
    installUpdate()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })
})
