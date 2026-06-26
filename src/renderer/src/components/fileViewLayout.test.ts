import { describe, it, expect } from 'vitest'
import {
  computeGridLayout,
  itemBox,
  visibleRange,
  revealOffset,
  itemsInRect
} from './fileViewLayout'

describe('computeGridLayout', () => {
  it('details view is a single full-width column', () => {
    const l = computeGridLayout(5, 'details', 600)
    expect(l.columns).toBe(1)
    expect(l.cellW).toBe(600 - 2 * 8) // content width minus side padding
    expect(l.rowCount).toBe(5)
    // headerHeight 34 + padTop 4 + 5*28 + 4*0 + padBottom 10
    expect(l.totalHeight).toBe(34 + 4 + 5 * 28 + 10)
  })

  it('details rows start below the sticky column header', () => {
    // Regression: the first row must clear the 34px sticky header instead of
    // rendering underneath it. Origin = headerHeight 34 + padTop 4 = 38.
    const l = computeGridLayout(5, 'details', 600)
    expect(itemBox(0, l).top).toBe(38)
    expect(itemBox(1, l).top).toBe(38 + 28) // next row, stride = cellH 28 + rowGap 0
  })

  it('wrap grids compute the column count from the available width', () => {
    // list: padX 8, cellW 232, colGap 6 → stride 238. content = 500-16 = 484.
    // columns = floor((484 + 6) / 238) = 2.
    const l = computeGridLayout(10, 'list', 500)
    expect(l.columns).toBe(2)
    expect(l.cellW).toBe(232)
    expect(l.rowCount).toBe(5)
    expect(l.totalHeight).toBe(8 + 5 * 26 + 4 * 1 + 8)
  })

  it('clamps to a single column when the width is too small for even one cell', () => {
    const l = computeGridLayout(3, 'tiles', 20) // content clamps to 0
    expect(l.columns).toBe(1)
  })

  it('reports zero height for an empty list', () => {
    const l = computeGridLayout(0, 'list', 500)
    expect(l.rowCount).toBe(0)
    expect(l.totalHeight).toBe(0)
  })
})

describe('itemBox', () => {
  it('positions items by row and column including non-zero rows/cols', () => {
    const l = computeGridLayout(10, 'list', 500) // 2 columns
    expect(itemBox(0, l)).toEqual({ left: 8, top: 8, width: 232, height: 26 })
    // index 3 → row 1, col 1
    expect(itemBox(3, l)).toEqual({ left: 8 + 238, top: 8 + 27, width: 232, height: 26 })
  })
})

describe('visibleRange', () => {
  const l = computeGridLayout(10, 'list', 500) // 2 cols, 5 rows, stride 27

  it('clamps the first row up at the top of the list', () => {
    // scrollTop 0 → firstRow floors negative → 0; lastRow not clamped.
    expect(visibleRange(0, 54, l, 0)).toEqual({ start: 0, end: 4 })
  })

  it('windows to the rows around the scroll offset and clamps the last row', () => {
    // scrollTop 100 → firstRow 3, lastRow computed 5 clamps to 4 (last row).
    expect(visibleRange(100, 54, l, 0)).toEqual({ start: 6, end: 10 })
  })

  it('clamps end to the item count on a partial last row', () => {
    const partial = computeGridLayout(9, 'list', 500) // last row has 1 item
    expect(visibleRange(100, 54, partial, 0)).toEqual({ start: 6, end: 9 })
  })

  it('returns an empty range for an empty list', () => {
    const empty = computeGridLayout(0, 'list', 500)
    expect(visibleRange(0, 54, empty, 0)).toEqual({ start: 0, end: 0 })
  })
})

describe('revealOffset', () => {
  const l = computeGridLayout(10, 'list', 500) // 2 cols, rows at top 8,35,62,89,116

  it('scrolls up to an item above the viewport', () => {
    expect(revealOffset(0, 50, 200, l)).toBe(8)
  })

  it('scrolls down to an item below the viewport', () => {
    // index 9 → row 4, top 116, bottom 142. viewport [0,50] → 142-50.
    expect(revealOffset(9, 0, 50, l)).toBe(142 - 50)
  })

  it('returns null when the item is already visible', () => {
    expect(revealOffset(0, 0, 200, l)).toBeNull()
  })
})

describe('itemsInRect', () => {
  const l = computeGridLayout(10, 'list', 500) // 2 cols, 5 rows, strides 238 / 27

  it('returns nothing for an empty list', () => {
    const empty = computeGridLayout(0, 'list', 500)
    expect(itemsInRect({ left: 0, top: 0, width: 1000, height: 1000 }, empty)).toEqual([])
  })

  it('selects every cell intersecting a rect, clamping rect bounds to the grid', () => {
    // A rect starting above/left of the grid and wider/taller than it.
    const hits = itemsInRect({ left: -50, top: -50, width: 1000, height: 1000 }, l)
    expect(hits).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('skips the row gap and the column gap (cells the rect misses)', () => {
    // top 34.5 lands in the gap after row 0 (body 8..34); left 243 lands in the
    // gap after col 0 (body 8..240). So row 0 and col 0 are skipped.
    const hits = itemsInRect({ left: 243, top: 34.5, width: 200, height: 6 }, l)
    expect(hits).toEqual([3]) // row 1, col 1
  })

  it('ignores empty cell slots past the end of a partial last row', () => {
    const partial = computeGridLayout(9, 'list', 500) // last row has only col 0 (idx 8)
    const hits = itemsInRect({ left: -50, top: -50, width: 1000, height: 1000 }, partial)
    expect(hits).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]) // idx 9 slot is empty → skipped
  })

  it('excludes cells that only touch the rect edge', () => {
    // bottom exactly on row 1 top (35) and right exactly on col 1 left (246):
    // those touching cells are excluded, leaving just item 0.
    const hits = itemsInRect({ left: 8, top: 8, width: 238, height: 27 }, l)
    expect(hits).toEqual([0])
  })
})
