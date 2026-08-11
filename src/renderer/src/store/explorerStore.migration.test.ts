import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installApiMock } from '@test/apiMock'

/**
 * The store reads localStorage once, at module load, so each case here seeds
 * storage and then imports a fresh copy of the module.
 */
const PREFS_KEY = 'fe.prefs.v1'

async function loadStoreWith(prefs: Record<string, unknown>): Promise<{
  categories: { id: string; name: string; paths: string[]; collapsed: boolean }[]
  persistAChange: () => void
  stored: () => Record<string, unknown>
}> {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  vi.resetModules()
  const { useExplorerStore } = await import('./explorerStore')
  return {
    categories: useExplorerStore.getState().categories,
    // Any preference change rewrites the whole blob — that's what used to drop
    // favorites on the floor.
    persistAChange: () => useExplorerStore.getState().setSidebarWidth(300),
    stored: () => JSON.parse(localStorage.getItem(PREFS_KEY)!)
  }
}

beforeEach(() => {
  localStorage.clear()
  installApiMock()
})

describe('migrating pre-1.2.0 Favorites into a category', () => {
  it('carries the favorites over and survives the next persist', async () => {
    const s = await loadStoreWith({
      favorites: ['/Users/test/taxes', '/Users/test/photos'],
      recents: ['/Users/test/a']
    })

    expect(s.categories).toEqual([
      {
        id: 'cat-favorites',
        name: 'Favorites',
        paths: ['/Users/test/taxes', '/Users/test/photos'],
        collapsed: false
      }
    ])

    // savePrefs replaces the whole blob, so the category has to be what persists.
    s.persistAChange()
    expect(s.stored().categories).toEqual(s.categories)
    expect(s.stored().favorites).toBeUndefined()
  })

  it('keeps existing categories and appends the migrated one', async () => {
    const s = await loadStoreWith({
      categories: [{ id: 'c1', name: 'Work', paths: ['/p/proj'], collapsed: false }],
      favorites: ['/p/spec.pdf']
    })
    expect(s.categories.map((c) => c.name)).toEqual(['Work', 'Favorites'])
    expect(s.categories[1].paths).toEqual(['/p/spec.pdf'])
  })

  it('adds nothing when there were no favorites', async () => {
    const s = await loadStoreWith({ favorites: [], recents: [] })
    expect(s.categories).toEqual([])
  })

  it('adds nothing for a fresh install', async () => {
    const s = await loadStoreWith({})
    expect(s.categories).toEqual([])
  })

  it('stops firing once storage no longer carries favorites', async () => {
    const first = await loadStoreWith({ favorites: ['/p/a'] })
    first.persistAChange()
    // Re-launch against what was just written: no favorites left to migrate, so
    // the category must not be duplicated.
    const second = await loadStoreWith(first.stored())
    expect(second.categories.filter((c) => c.name === 'Favorites')).toHaveLength(1)
  })
})
