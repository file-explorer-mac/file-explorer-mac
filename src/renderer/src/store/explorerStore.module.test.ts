import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installApiMock, type ApiMock } from '@test/apiMock'
import type { OpProgress } from '@shared/types'

/**
 * These tests re-import the store module in isolation so we can exercise the
 * module-load-time code paths: `loadPrefs`'s catch branch, the first-ever
 * `progressSubscribed` subscription, and the op-progress callback. Each test
 * resets the module registry first.
 */

const PREFS_KEY = 'fe.prefs.v1'

let api: ApiMock
beforeEach(() => {
  api = installApiMock()
  vi.resetModules()
  localStorage.clear()
})

describe('module load: loadPrefs', () => {
  it('falls back to defaults when stored prefs are invalid JSON', async () => {
    localStorage.setItem(PREFS_KEY, '{not valid json')
    const mod = await import('./explorerStore')
    // Defaults apply because loadPrefs swallowed the parse error.
    expect(mod.useExplorerStore.getState().viewMode).toBe('details')
    expect(mod.useExplorerStore.getState().sortKey).toBe('name')
  })

  it('applies persisted prefs when JSON is valid', async () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ viewMode: 'list', sortKey: 'size', showHidden: true })
    )
    const mod = await import('./explorerStore')
    expect(mod.useExplorerStore.getState().viewMode).toBe('list')
    expect(mod.useExplorerStore.getState().sortKey).toBe('size')
    expect(mod.useExplorerStore.getState().showHidden).toBe(true)
  })
})

describe('module load: init subscribes to op progress once and forwards it', () => {
  it('subscribes on the first init and pipes progress into operation state', async () => {
    let cb: ((p: OpProgress) => void) | undefined
    api.onOpProgress.mockImplementation((fn: (p: OpProgress) => void) => {
      cb = fn
      return () => {}
    })
    const mod = await import('./explorerStore')
    await mod.useExplorerStore.getState().init()
    expect(api.onOpProgress).toHaveBeenCalledTimes(1)
    // Exercise the callback that updates `operation`.
    expect(cb).toBeDefined()
    cb!({ op: 'move', done: 3, total: 5, name: 'thing' })
    expect(mod.useExplorerStore.getState().operation).toEqual({
      op: 'move',
      done: 3,
      total: 5,
      name: 'thing'
    })
    // A second init in the same module instance does not re-subscribe.
    await mod.useExplorerStore.getState().init()
    expect(api.onOpProgress).toHaveBeenCalledTimes(1)
  })
})
