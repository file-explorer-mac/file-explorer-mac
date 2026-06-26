// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'

// Capture the template handed to Menu.buildFromTemplate so we can inspect it.
let lastTemplate: MenuItemConstructorOptions[] = []
const setApplicationMenu = vi.fn()
vi.mock('electron', () => ({
  app: { getName: () => 'File Explorer' },
  Menu: {
    buildFromTemplate: (tpl: MenuItemConstructorOptions[]) => {
      lastTemplate = tpl
      return { __menu: true }
    },
    setApplicationMenu: (...a: unknown[]) => setApplicationMenu(...a)
  }
}))

const updaterCheck = vi.fn()
vi.mock('./updater', () => ({ checkForUpdates: () => updaterCheck() }))

import { buildAppMenu, installAppMenu } from './menu'

/** Depth-first search for a menu item by label across all submenus. */
function find(
  tpl: MenuItemConstructorOptions[],
  label: string
): MenuItemConstructorOptions | undefined {
  for (const item of tpl) {
    if (item.label === label) return item
    const sub = item.submenu as MenuItemConstructorOptions[] | undefined
    if (Array.isArray(sub)) {
      const hit = find(sub, label)
      if (hit) return hit
    }
  }
  return undefined
}

beforeEach(() => {
  lastTemplate = []
})
afterEach(() => vi.clearAllMocks())

describe('buildAppMenu', () => {
  it('includes a "Check for Updates…" item wired to the updater by default', () => {
    buildAppMenu({ onNewWindow: vi.fn() })
    const item = find(lastTemplate, 'Check for Updates…')
    expect(item).toBeDefined()
    ;(item as { click: (...a: unknown[]) => void }).click()
    expect(updaterCheck).toHaveBeenCalledTimes(1)
  })

  it('lets the check handler be overridden (for the menu to drive its own flow)', () => {
    const onCheckForUpdates = vi.fn()
    buildAppMenu({ onNewWindow: vi.fn(), onCheckForUpdates })
    const item = find(lastTemplate, 'Check for Updates…')
    ;(item as { click: (...a: unknown[]) => void }).click()
    expect(onCheckForUpdates).toHaveBeenCalledTimes(1)
    expect(updaterCheck).not.toHaveBeenCalled()
  })

  it('wires "New Window" to the injected handler', () => {
    const onNewWindow = vi.fn()
    buildAppMenu({ onNewWindow })
    const item = find(lastTemplate, 'New Window')
    expect(item).toBeDefined()
    ;(item as { click: (...a: unknown[]) => void }).click()
    expect(onNewWindow).toHaveBeenCalledTimes(1)
  })

  it('preserves standard editing roles so shortcuts do not regress', () => {
    buildAppMenu({ onNewWindow: vi.fn() })
    const roles = new Set<string>()
    const walk = (tpl: MenuItemConstructorOptions[]): void => {
      for (const i of tpl) {
        if (i.role) roles.add(i.role)
        const sub = i.submenu as MenuItemConstructorOptions[] | undefined
        if (Array.isArray(sub)) walk(sub)
      }
    }
    walk(lastTemplate)
    for (const role of ['copy', 'paste', 'cut', 'selectAll', 'minimize']) {
      expect(roles).toContain(role)
    }
  })
})

describe('installAppMenu', () => {
  it('builds and installs the application menu', () => {
    installAppMenu({ onNewWindow: vi.fn() })
    expect(setApplicationMenu).toHaveBeenCalledWith({ __menu: true })
  })
})
