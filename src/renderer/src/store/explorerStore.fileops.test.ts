import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useExplorerStore } from './explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makeFileItem } from '@test/factories'

let api: ApiMock
beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
})

const store = (): ReturnType<typeof useExplorerStore.getState> => useExplorerStore.getState()

describe('performTransfer', () => {
  it('no-ops with empty sources', async () => {
    await store().performTransfer([], '/dest', 'copy')
    expect(api.listConflicts).not.toHaveBeenCalled()
  })

  it('opens a pending transfer when there are conflicts', async () => {
    api.listConflicts.mockResolvedValue({ ok: true, data: ['a.txt'] })
    await store().performTransfer(['/p/a.txt'], '/dest', 'copy', true)
    expect(store().pendingTransfer).toEqual({
      srcPaths: ['/p/a.txt'],
      destDir: '/dest',
      op: 'copy',
      conflicts: ['a.txt'],
      clearCut: true
    })
  })

  it('transfers immediately when there are no conflicts', async () => {
    api.listConflicts.mockResolvedValue({ ok: true, data: [] })
    useExplorerStore.setState({ currentPath: '/dest' })
    await store().performTransfer(['/p/a.txt'], '/dest', 'copy')
    expect(api.copy).toHaveBeenCalledWith(['/p/a.txt'], '/dest', 'keep-both')
  })

  it('treats a failed conflict check as no conflicts', async () => {
    api.listConflicts.mockResolvedValue({ ok: false })
    useExplorerStore.setState({ currentPath: '/dest' })
    await store().performTransfer(['/p/a.txt'], '/dest', 'move')
    expect(api.move).toHaveBeenCalled()
  })
})

describe('resolveConflict', () => {
  it('clears the pending transfer and no-ops on cancel', async () => {
    useExplorerStore.setState({
      pendingTransfer: { srcPaths: ['/p/a'], destDir: '/d', op: 'copy', conflicts: ['a'], clearCut: false }
    })
    await store().resolveConflict('cancel')
    expect(store().pendingTransfer).toBeNull()
    expect(api.copy).not.toHaveBeenCalled()
  })

  it('no-ops when there is no pending transfer', async () => {
    useExplorerStore.setState({ pendingTransfer: null })
    await store().resolveConflict('replace')
    expect(api.copy).not.toHaveBeenCalled()
  })

  it('proceeds with the chosen policy', async () => {
    useExplorerStore.setState({
      currentPath: '/d',
      pendingTransfer: { srcPaths: ['/p/a'], destDir: '/d', op: 'copy', conflicts: ['a'], clearCut: false }
    })
    await store().resolveConflict('replace')
    expect(api.copy).toHaveBeenCalledWith(['/p/a'], '/d', 'replace')
  })
})

describe('doTransfer', () => {
  it('performs a copy and records a copy undo entry', async () => {
    api.copy.mockResolvedValue({ ok: true, data: { moves: [{ from: '/p/a', to: '/d/a' }] } })
    useExplorerStore.setState({ currentPath: '/d' })
    await store().doTransfer(['/p/a'], '/d', 'copy', 'keep-both', false)
    expect(store().undoStack.at(-1)).toEqual({ type: 'copy', created: ['/d/a'] })
    expect(store().operation).toBeNull()
  })

  it('performs a move, records a move undo, and clears cut', async () => {
    api.move.mockResolvedValue({ ok: true, data: { moves: [{ from: '/p/a', to: '/d/a' }] } })
    useExplorerStore.setState({ currentPath: '/d', clipboard: { paths: ['/p/a'], mode: 'cut' } })
    await store().doTransfer(['/p/a'], '/d', 'move', 'keep-both', true)
    expect(store().undoStack.at(-1)).toEqual({ type: 'move', moves: [{ from: '/p/a', to: '/d/a' }] })
    expect(store().clipboard).toBeNull()
  })

  it('flashes on failure', async () => {
    api.copy.mockResolvedValue({ ok: false, error: 'fail' })
    useExplorerStore.setState({ currentPath: '/d' })
    await store().doTransfer(['/p/a'], '/d', 'copy', 'keep-both', false)
    expect(store().statusMessage).toBe('fail')
  })

  it('flashes a default error when none provided', async () => {
    api.move.mockResolvedValue({ ok: false })
    useExplorerStore.setState({ currentPath: '/d' })
    await store().doTransfer(['/p/a'], '/d', 'move', 'keep-both', false)
    expect(store().statusMessage).toBe('Operation failed')
  })

  it('records no undo when the transfer produced no moves', async () => {
    api.copy.mockResolvedValue({ ok: true, data: { moves: [] } })
    useExplorerStore.setState({ currentPath: '/d' })
    await store().doTransfer(['/p/a'], '/d', 'copy', 'keep-both', false)
    expect(store().undoStack.length).toBe(0)
  })
})

describe('recordUndo', () => {
  it('caps the undo stack at 50 entries', () => {
    for (let i = 0; i < 55; i++) {
      store().recordUndo({ type: 'rename', from: `/a${i}`, to: `/b${i}` })
    }
    const stack = store().undoStack
    expect(stack.length).toBe(50)
    // Oldest dropped: first kept entry is index 5
    expect(stack[0]).toEqual({ type: 'rename', from: '/a5', to: '/b5' })
  })
})

describe('undo', () => {
  it('flashes when there is nothing to undo', async () => {
    useExplorerStore.setState({ undoStack: [] })
    await store().undo()
    expect(store().statusMessage).toBe('Nothing to undo')
  })

  it('reverses a rename', async () => {
    useExplorerStore.setState({
      currentPath: '/p',
      undoStack: [{ type: 'rename', from: '/p/old.txt', to: '/p/new.txt' }]
    })
    await store().undo()
    expect(api.rename).toHaveBeenCalledWith('/p/new.txt', 'old.txt')
    expect(store().undoStack.length).toBe(0)
  })

  it('reverses a move grouped by source directory', async () => {
    useExplorerStore.setState({
      currentPath: '/d',
      undoStack: [
        {
          type: 'move',
          moves: [
            { from: '/src1/a', to: '/d/a' },
            { from: '/src1/b', to: '/d/b' },
            { from: '/src2/c', to: '/d/c' }
          ]
        }
      ]
    })
    await store().undo()
    expect(api.move).toHaveBeenCalledWith(['/d/a', '/d/b'], '/src1', 'keep-both')
    expect(api.move).toHaveBeenCalledWith(['/d/c'], '/src2', 'keep-both')
  })

  it('reverses a copy by trashing the created files', async () => {
    useExplorerStore.setState({
      currentPath: '/d',
      undoStack: [{ type: 'copy', created: ['/d/a', '/d/b'] }]
    })
    await store().undo()
    expect(api.moveToTrash).toHaveBeenCalledWith(['/d/a', '/d/b'])
  })
})

describe('compressSelection', () => {
  it('no-ops when nothing is selected', async () => {
    useExplorerStore.setState({ selection: new Set() })
    await store().compressSelection()
    expect(api.compressZip).not.toHaveBeenCalled()
  })

  it('compresses and sets a pending rename on success', async () => {
    const archive = makeFileItem({ name: 'Archive.zip', path: '/p/Archive.zip', ext: 'zip' })
    api.compressZip.mockResolvedValue({ ok: true, data: archive })
    // refresh() reloads the dir; return the new archive so the pending rename
    // resolves into rename mode for it.
    api.readDirectory.mockResolvedValue({ ok: true, data: [archive] })
    useExplorerStore.setState({ currentPath: '/p', selection: new Set(['/p/a.txt']) })
    await store().compressSelection()
    expect(api.compressZip).toHaveBeenCalledWith(['/p/a.txt'], '/p')
    expect(store().renamingPath).toBe('/p/Archive.zip')
    expect(store().operation).toBeNull()
  })

  it('succeeds without data (no pending rename set)', async () => {
    api.compressZip.mockResolvedValue({ ok: true })
    useExplorerStore.setState({ currentPath: '/p', selection: new Set(['/p/a.txt']), pendingRenamePath: null })
    await store().compressSelection()
    expect(store().pendingRenamePath).toBeNull()
  })

  it('flashes on failure', async () => {
    api.compressZip.mockResolvedValue({ ok: false, error: 'no' })
    useExplorerStore.setState({ currentPath: '/p', selection: new Set(['/p/a.txt']) })
    await store().compressSelection()
    expect(store().statusMessage).toBe('no')
  })

  it('flashes a default error when none provided', async () => {
    api.compressZip.mockResolvedValue({ ok: false })
    useExplorerStore.setState({ currentPath: '/p', selection: new Set(['/p/a.txt']) })
    await store().compressSelection()
    expect(store().statusMessage).toBe('Compress failed')
  })
})

describe('extractSelection', () => {
  it('flashes when no zip is selected', async () => {
    useExplorerStore.setState({
      currentPath: '/p',
      items: [makeFileItem({ name: 'a.txt', path: '/p/a.txt', ext: 'txt' })],
      selection: new Set(['/p/a.txt'])
    })
    await store().extractSelection()
    expect(store().statusMessage).toBe('Select a .zip archive to extract')
    expect(api.extractZip).not.toHaveBeenCalled()
  })

  it('extracts every selected zip archive', async () => {
    api.extractZip.mockResolvedValue({ ok: true })
    useExplorerStore.setState({
      currentPath: '/p',
      items: [
        makeFileItem({ name: 'a.zip', path: '/p/a.zip', ext: 'zip' }),
        makeFileItem({ name: 'b.zip', path: '/p/b.zip', ext: 'zip' })
      ],
      selection: new Set(['/p/a.zip', '/p/b.zip'])
    })
    await store().extractSelection()
    expect(api.extractZip).toHaveBeenCalledWith('/p/a.zip', '/p')
    expect(api.extractZip).toHaveBeenCalledWith('/p/b.zip', '/p')
    expect(store().operation).toBeNull()
  })

  it('flashes when an extraction fails', async () => {
    api.extractZip.mockResolvedValue({ ok: false, error: 'bad zip' })
    useExplorerStore.setState({
      currentPath: '/p',
      items: [makeFileItem({ name: 'a.zip', path: '/p/a.zip', ext: 'zip' })],
      selection: new Set(['/p/a.zip'])
    })
    await store().extractSelection()
    expect(store().statusMessage).toBe('bad zip')
  })

  it('flashes a default error when extraction fails without a message', async () => {
    api.extractZip.mockResolvedValue({ ok: false })
    useExplorerStore.setState({
      currentPath: '/p',
      items: [makeFileItem({ name: 'a.zip', path: '/p/a.zip', ext: 'zip' })],
      selection: new Set(['/p/a.zip'])
    })
    await store().extractSelection()
    expect(store().statusMessage).toBe('Extract failed')
  })
})

describe('openWithSelection', () => {
  it('no-ops when nothing is selected', async () => {
    useExplorerStore.setState({ selection: new Set() })
    await store().openWithSelection()
    expect(api.openWith).not.toHaveBeenCalled()
  })

  it('opens the first selected item with a chosen app', async () => {
    api.openWith.mockResolvedValue({ ok: true })
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    await store().openWithSelection()
    expect(api.openWith).toHaveBeenCalledWith('/p/a.txt')
  })

  it('flashes on failure', async () => {
    api.openWith.mockResolvedValue({ ok: false, error: 'no app' })
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    await store().openWithSelection()
    expect(store().statusMessage).toBe('no app')
  })

  it('flashes a default error when none provided', async () => {
    api.openWith.mockResolvedValue({ ok: false })
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    await store().openWithSelection()
    expect(store().statusMessage).toBe('Could not open with that app')
  })
})

describe('openTerminalHere / copyPathSelection', () => {
  it('opens a terminal at the current path', () => {
    useExplorerStore.setState({ currentPath: '/p' })
    store().openTerminalHere()
    expect(api.openInTerminal).toHaveBeenCalledWith('/p')
  })

  it('copies selected paths joined by newlines', () => {
    const spy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    useExplorerStore.setState({ selection: new Set(['/p/a', '/p/b']) })
    store().copyPathSelection()
    expect(spy).toHaveBeenCalledWith('/p/a\n/p/b')
    expect(store().statusMessage).toBe('Path copied')
  })

  it('copies the current path when nothing is selected', () => {
    const spy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    useExplorerStore.setState({ selection: new Set(), currentPath: '/p' })
    store().copyPathSelection()
    expect(spy).toHaveBeenCalledWith('/p')
  })
})

describe('properties dialog', () => {
  it('opens with an explicit path', () => {
    store().openProperties('/p/a.txt')
    expect(store().propertiesPath).toBe('/p/a.txt')
  })

  it('opens with the first selected item', () => {
    useExplorerStore.setState({ selection: new Set(['/p/sel']) })
    store().openProperties()
    expect(store().propertiesPath).toBe('/p/sel')
  })

  it('falls back to the current path', () => {
    useExplorerStore.setState({ selection: new Set(), currentPath: '/p' })
    store().openProperties()
    expect(store().propertiesPath).toBe('/p')
  })

  it('closes the dialog', () => {
    useExplorerStore.setState({ propertiesPath: '/p' })
    store().closeProperties()
    expect(store().propertiesPath).toBeNull()
  })
})

describe('persistence', () => {
  it('writes prefs to localStorage when a pref changes', () => {
    store().setViewMode('list')
    const raw = localStorage.getItem('fe.prefs.v1')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).viewMode).toBe('list')
  })

  it('swallows a localStorage write failure (savePrefs catch)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => store().setViewMode('tiles')).not.toThrow()
    spy.mockRestore()
  })
})
