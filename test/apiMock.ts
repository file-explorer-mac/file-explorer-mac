import { vi } from 'vitest'
import type { FileExplorerApi } from '../src/shared/types'
import { makeFileItem, makePropertyInfo, makeFolderSize } from './factories'

export type ApiMock = {
  [K in keyof FileExplorerApi]: FileExplorerApi[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<(...args: A) => R>>
    : FileExplorerApi[K]
}

/**
 * A complete `window.api` test double. Every method is a vi.fn() returning a
 * benign default (resolved Results, empty lists, no-op subscriptions). Tests
 * override individual methods with `.mockResolvedValue(...)` as needed.
 */
export function createApiMock(): ApiMock {
  const unsub = (): void => {}
  return {
    startDir: '',
    readDirectory: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    getHomeDir: vi.fn().mockResolvedValue('/Users/test'),
    getQuickLinks: vi.fn().mockResolvedValue([]),
    getDrives: vi.fn().mockResolvedValue([]),
    getFileItem: vi.fn().mockResolvedValue({ ok: true, data: makeFileItem() }),
    pathExists: vi.fn().mockResolvedValue(true),
    parentOf: vi.fn().mockResolvedValue('/Users'),
    joinPath: vi.fn().mockResolvedValue('/Users/test'),
    openPath: vi.fn().mockResolvedValue({ ok: true }),
    revealInFinder: vi.fn().mockResolvedValue(undefined),
    getThumbnail: vi.fn().mockResolvedValue({ ok: false, error: 'No thumbnail' }),
    startDrag: vi.fn(),
    openFullDiskAccessSettings: vi.fn(),
    createFolder: vi.fn().mockResolvedValue({ ok: true, data: makeFileItem() }),
    createTextFile: vi.fn().mockResolvedValue({ ok: true, data: makeFileItem() }),
    rename: vi.fn().mockResolvedValue({ ok: true, data: makeFileItem() }),
    moveToTrash: vi.fn().mockResolvedValue({ ok: true }),
    listConflicts: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    copy: vi.fn().mockResolvedValue({ ok: true, data: { moves: [] } }),
    move: vi.fn().mockResolvedValue({ ok: true, data: { moves: [] } }),
    search: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    getProperties: vi.fn().mockResolvedValue({ ok: true, data: makePropertyInfo() }),
    getFolderSize: vi.fn().mockResolvedValue({ ok: true, data: makeFolderSize() }),
    readTextPreview: vi.fn().mockResolvedValue({ ok: true, data: '' }),
    compressZip: vi.fn().mockResolvedValue({ ok: true, data: makeFileItem() }),
    extractZip: vi.fn().mockResolvedValue({ ok: true }),
    openWith: vi.fn().mockResolvedValue({ ok: true }),
    openInTerminal: vi.fn().mockResolvedValue(undefined),
    getPathForFile: vi.fn().mockReturnValue('/Users/test/file.txt'),
    windowMinimize: vi.fn(),
    windowToggleMaximize: vi.fn(),
    windowClose: vi.fn(),
    windowNew: vi.fn(),
    onMaximizeChange: vi.fn().mockReturnValue(unsub),
    onOpProgress: vi.fn().mockReturnValue(unsub),
    onOpenPath: vi.fn().mockReturnValue(unsub),
    checkForUpdates: vi.fn(),
    installUpdate: vi.fn(),
    onUpdateStatus: vi.fn().mockReturnValue(unsub)
  }
}

/** Install a fresh api mock on `window.api` and return it for assertions. */
export function installApiMock(): ApiMock {
  const mock = createApiMock()
  ;(window as unknown as { api: ApiMock }).api = mock
  return mock
}
