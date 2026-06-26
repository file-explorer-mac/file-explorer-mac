// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { IPC } from './types'

describe('IPC channel map', () => {
  it('exposes the known, stable channel names', () => {
    // A representative sampling of the stable contract that main & preload rely on.
    expect(IPC.readDirectory).toBe('fs:readDirectory')
    expect(IPC.getHomeDir).toBe('fs:getHomeDir')
    expect(IPC.startDrag).toBe('dnd:startDrag')
    expect(IPC.openFullDiskAccessSettings).toBe('app:openFullDiskAccessSettings')
    expect(IPC.windowMinimize).toBe('win:minimize')
    expect(IPC.windowMaximizeChanged).toBe('win:maximizeChanged')
    expect(IPC.navigateToPath).toBe('app:navigateToPath')
    expect(IPC.opProgress).toBe('fs:opProgress')
  })

  it('has every channel value namespaced with a "<scope>:<name>" prefix', () => {
    const allowedScopes = new Set(['fs', 'app', 'win', 'dnd', 'update'])
    for (const value of Object.values(IPC)) {
      expect(value).toMatch(/^[a-z]+:[A-Za-z]+$/)
      expect(allowedScopes.has(value.split(':')[0])).toBe(true)
    }
  })

  it('uses unique channel values (no two keys share a channel)', () => {
    const values = Object.values(IPC)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })

  it('declares the complete, expected set of channel keys', () => {
    expect(Object.keys(IPC).sort()).toEqual(
      [
        'readDirectory',
        'getHomeDir',
        'getQuickLinks',
        'getDrives',
        'getFileItem',
        'pathExists',
        'parentOf',
        'joinPath',
        'openPath',
        'revealInFinder',
        'getThumbnail',
        'startDrag',
        'openFullDiskAccessSettings',
        'createFolder',
        'createTextFile',
        'rename',
        'moveToTrash',
        'listConflicts',
        'copy',
        'move',
        'search',
        'getProperties',
        'getFolderSize',
        'readTextPreview',
        'compressZip',
        'extractZip',
        'openWith',
        'openInTerminal',
        'opProgress',
        'windowMinimize',
        'windowToggleMaximize',
        'windowClose',
        'windowNew',
        'windowMaximizeChanged',
        'navigateToPath',
        'updateCheck',
        'updateInstall',
        'updateStatus'
      ].sort()
    )
  })
})
