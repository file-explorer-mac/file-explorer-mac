import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { selectVisibleItems, groupItems } from './explorerStore'
import { makeFileItem, makeFolder } from '@test/factories'

describe('selectVisibleItems', () => {
  it('filters hidden items when showHidden is false', () => {
    const visible = makeFileItem({ name: 'a.txt', path: '/p/a.txt', isHidden: false })
    const hidden = makeFileItem({ name: '.secret', path: '/p/.secret', isHidden: true })
    const out = selectVisibleItems({
      items: [visible, hidden],
      showHidden: false,
      sortKey: 'name',
      sortDir: 'asc'
    })
    expect(out.map((i) => i.path)).toEqual(['/p/a.txt'])
  })

  it('keeps hidden items when showHidden is true', () => {
    const visible = makeFileItem({ name: 'a.txt', path: '/p/a.txt', isHidden: false })
    const hidden = makeFileItem({ name: '.secret', path: '/p/.secret', isHidden: true })
    const out = selectVisibleItems({
      items: [visible, hidden],
      showHidden: true,
      sortKey: 'name',
      sortDir: 'asc'
    })
    expect(out.length).toBe(2)
  })

  it('puts folders before files regardless of sort dir', () => {
    // Interleave folders and files so the comparator is invoked in both
    // (folder, file) and (file, folder) orders, hitting both -1 and 1 returns.
    const f1 = makeFileItem({ name: 'a.txt', path: '/p/a.txt' })
    const d1 = makeFolder({ name: 'm-dir', path: '/p/m-dir' })
    const f2 = makeFileItem({ name: 'b.txt', path: '/p/b.txt' })
    const d2 = makeFolder({ name: 'z-dir', path: '/p/z-dir' })
    const asc = selectVisibleItems({
      items: [f1, d2, f2, d1],
      showHidden: true,
      sortKey: 'name',
      sortDir: 'asc'
    })
    expect(asc.map((i) => i.isDirectory)).toEqual([true, true, false, false])
    const desc = selectVisibleItems({
      items: [d1, f1, d2, f2],
      showHidden: true,
      sortKey: 'name',
      sortDir: 'desc'
    })
    expect(desc.map((i) => i.isDirectory)).toEqual([true, true, false, false])
  })

  it('sorts by name ascending and descending', () => {
    const a = makeFileItem({ name: 'a.txt', path: '/p/a.txt' })
    const b = makeFileItem({ name: 'b.txt', path: '/p/b.txt' })
    const asc = selectVisibleItems({ items: [b, a], showHidden: true, sortKey: 'name', sortDir: 'asc' })
    expect(asc.map((i) => i.name)).toEqual(['a.txt', 'b.txt'])
    const desc = selectVisibleItems({ items: [a, b], showHidden: true, sortKey: 'name', sortDir: 'desc' })
    expect(desc.map((i) => i.name)).toEqual(['b.txt', 'a.txt'])
  })

  it('sorts by modified', () => {
    const older = makeFileItem({ name: 'old', path: '/p/old', modified: 100 })
    const newer = makeFileItem({ name: 'new', path: '/p/new', modified: 200 })
    const out = selectVisibleItems({
      items: [newer, older],
      showHidden: true,
      sortKey: 'modified',
      sortDir: 'asc'
    })
    expect(out.map((i) => i.name)).toEqual(['old', 'new'])
  })

  it('sorts by size', () => {
    const small = makeFileItem({ name: 'small', path: '/p/small', size: 10 })
    const big = makeFileItem({ name: 'big', path: '/p/big', size: 9999 })
    const out = selectVisibleItems({
      items: [big, small],
      showHidden: true,
      sortKey: 'size',
      sortDir: 'asc'
    })
    expect(out.map((i) => i.name)).toEqual(['small', 'big'])
  })

  it('sorts by type with kind, then ext, then name tiebreaks', () => {
    // Same kind 'code', different ext => ext tiebreak
    const tsFile = makeFileItem({ name: 'b', path: '/p/b.ts', kind: 'code', ext: 'ts' })
    const jsFile = makeFileItem({ name: 'a', path: '/p/a.js', kind: 'code', ext: 'js' })
    const out = selectVisibleItems({
      items: [tsFile, jsFile],
      showHidden: true,
      sortKey: 'type',
      sortDir: 'asc'
    })
    // 'js' < 'ts'
    expect(out.map((i) => i.ext)).toEqual(['js', 'ts'])

    // Same kind, same ext => name tiebreak
    const n2 = makeFileItem({ name: 'banana', path: '/p/banana.txt', kind: 'text', ext: 'txt' })
    const n1 = makeFileItem({ name: 'apple', path: '/p/apple.txt', kind: 'text', ext: 'txt' })
    const out2 = selectVisibleItems({
      items: [n2, n1],
      showHidden: true,
      sortKey: 'type',
      sortDir: 'asc'
    })
    expect(out2.map((i) => i.name)).toEqual(['apple', 'banana'])

    // Different kind => kind tiebreak
    const img = makeFileItem({ name: 'z', path: '/p/z.png', kind: 'image', ext: 'png' })
    const txt = makeFileItem({ name: 'a', path: '/p/a.txt', kind: 'text', ext: 'txt' })
    const out3 = selectVisibleItems({
      items: [txt, img],
      showHidden: true,
      sortKey: 'type',
      sortDir: 'asc'
    })
    // 'image' < 'text'
    expect(out3.map((i) => i.kind)).toEqual(['image', 'text'])
  })
})

describe('groupItems', () => {
  it('returns a single empty-label group when key is none', () => {
    const items = [makeFileItem({ name: 'a.txt', path: '/p/a.txt' })]
    expect(groupItems(items, 'none')).toEqual([{ label: '', items }])
  })

  it('groups by name hitting A-Z and # buckets', () => {
    const apple = makeFileItem({ name: 'apple', path: '/p/apple' })
    const banana = makeFileItem({ name: 'Banana', path: '/p/Banana' })
    const num = makeFileItem({ name: '3things', path: '/p/3things' })
    const empty = makeFileItem({ name: '', path: '/p/empty' })
    const groups = groupItems([apple, banana, num, empty], 'name')
    const labels = groups.map((g) => g.label)
    expect(labels).toContain('A')
    expect(labels).toContain('B')
    expect(labels).toContain('#')
    // '3things' and '' both fall into '#'
    const hashGroup = groups.find((g) => g.label === '#')!
    expect(hashGroup.items.length).toBe(2)
  })

  it('groups by type using kindLabel and Folders for directories', () => {
    const folder = makeFolder({ name: 'dir', path: '/p/dir' })
    const txt = makeFileItem({ name: 'a.txt', path: '/p/a.txt', kind: 'text', ext: 'txt' })
    const groups = groupItems([folder, txt], 'type')
    const labels = groups.map((g) => g.label)
    expect(labels).toContain('Folders')
    expect(labels).toContain('TXT File')
  })

  it('groups by size hitting every bucket', () => {
    const folder = makeFolder({ name: 'dir', path: '/p/dir' })
    const emptyF = makeFileItem({ name: 'empty', path: '/p/empty', size: 0 })
    const tiny = makeFileItem({ name: 'tiny', path: '/p/tiny', size: 100 })
    const small = makeFileItem({ name: 'small', path: '/p/small', size: 100 * 1024 })
    const medium = makeFileItem({ name: 'medium', path: '/p/medium', size: 2 * 1024 * 1024 })
    const large = makeFileItem({ name: 'large', path: '/p/large', size: 200 * 1024 * 1024 })
    const huge = makeFileItem({ name: 'huge', path: '/p/huge', size: 2 * 1024 * 1024 * 1024 })
    const groups = groupItems([folder, emptyF, tiny, small, medium, large, huge], 'size')
    const labels = groups.map((g) => g.label)
    expect(labels).toEqual(
      expect.arrayContaining([
        'Folders',
        'Empty',
        'Tiny (0–16 KB)',
        'Small (16 KB–1 MB)',
        'Medium (1–128 MB)',
        'Large (128 MB–1 GB)',
        'Huge (> 1 GB)'
      ])
    )
  })

  it('groups by modified hitting every time bucket', () => {
    vi.useFakeTimers()
    // Fix "now" to a known wall-clock time.
    vi.setSystemTime(new Date('2026-06-25T12:00:00'))
    const day = 86_400_000
    const startOfToday = new Date(2026, 5, 25).getTime()
    const today = makeFileItem({ name: 't', path: '/p/t', modified: startOfToday + 1000 })
    const yesterday = makeFileItem({ name: 'y', path: '/p/y', modified: startOfToday - 1000 })
    const thisWeek = makeFileItem({ name: 'w', path: '/p/w', modified: startOfToday - 3 * day })
    const thisMonth = makeFileItem({ name: 'm', path: '/p/m', modified: startOfToday - 15 * day })
    const thisYear = makeFileItem({ name: 'yr', path: '/p/yr', modified: startOfToday - 100 * day })
    const old = makeFileItem({ name: 'o', path: '/p/o', modified: startOfToday - 400 * day })
    const groups = groupItems(
      [today, yesterday, thisWeek, thisMonth, thisYear, old],
      'modified'
    )
    expect(groups.map((g) => g.label)).toEqual([
      'Today',
      'Yesterday',
      'Earlier this week',
      'Earlier this month',
      'Earlier this year',
      'A long time ago'
    ])
  })

  afterEach(() => {
    vi.useRealTimers()
  })
})
