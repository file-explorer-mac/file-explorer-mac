import type { ViewMode } from '@/store/explorerStore'

/**
 * Geometry for the (windowed) file list. Each view mode lays items out as a grid
 * of fixed-size cells flowing left-to-right then wrapping, matching the CSS in
 * FileView.module.css. Keeping the maths here (pure, no DOM) lets the FileView
 * render only the rows in view and lets marquee selection / scroll-into-view work
 * without every row existing in the DOM.
 */

export interface CellMetrics {
  /** Cell width in px. Ignored when `fullWidth` (the cell spans the content box). */
  cellW: number
  cellH: number
  colGap: number
  rowGap: number
  padX: number
  padTop: number
  padBottom: number
  /**
   * Height reserved at the top of the content box for the sticky column header
   * (details view). Rows start below it; 0 when there is no header.
   */
  headerHeight: number
  /** Details view: one full-width column. */
  fullWidth: boolean
}

// Values mirror FileView.module.css. Grid tiles use a fixed height (also pinned
// in CSS) so every cell in a mode is the same size — a requirement for windowing.
// Details' headerHeight matches .headerRow (32px box + 2px margin-bottom).
const METRICS: Record<ViewMode, CellMetrics> = {
  details: { cellW: 0, cellH: 28, colGap: 0, rowGap: 0, padX: 8, padTop: 4, padBottom: 10, headerHeight: 34, fullWidth: true },
  list: { cellW: 232, cellH: 26, colGap: 6, rowGap: 1, padX: 8, padTop: 8, padBottom: 8, headerHeight: 0, fullWidth: false },
  small: { cellW: 200, cellH: 24, colGap: 6, rowGap: 1, padX: 8, padTop: 8, padBottom: 8, headerHeight: 0, fullWidth: false },
  tiles: { cellW: 264, cellH: 56, colGap: 6, rowGap: 6, padX: 10, padTop: 10, padBottom: 10, headerHeight: 0, fullWidth: false },
  medium: { cellW: 100, cellH: 110, colGap: 4, rowGap: 4, padX: 12, padTop: 12, padBottom: 12, headerHeight: 0, fullWidth: false },
  large: { cellW: 124, cellH: 134, colGap: 4, rowGap: 4, padX: 12, padTop: 12, padBottom: 12, headerHeight: 0, fullWidth: false },
  'extra-large': { cellW: 152, cellH: 158, colGap: 4, rowGap: 4, padX: 12, padTop: 12, padBottom: 12, headerHeight: 0, fullWidth: false }
}

export interface GridLayout {
  columns: number
  cellW: number
  cellH: number
  colGap: number
  rowGap: number
  padX: number
  padTop: number
  padBottom: number
  headerHeight: number
  rowCount: number
  totalHeight: number
  itemCount: number
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Resolve the concrete grid (column count, cell width, total height) for a width. */
export function computeGridLayout(
  itemCount: number,
  viewMode: ViewMode,
  containerWidth: number
): GridLayout {
  const m = METRICS[viewMode]
  const content = Math.max(0, containerWidth - 2 * m.padX)
  let columns: number
  let cellW: number
  if (m.fullWidth) {
    columns = 1
    cellW = content
  } else {
    columns = Math.max(1, Math.floor((content + m.colGap) / (m.cellW + m.colGap)))
    cellW = m.cellW
  }
  const rowCount = Math.ceil(itemCount / columns)
  const totalHeight =
    rowCount > 0
      ? m.headerHeight + m.padTop + rowCount * m.cellH + (rowCount - 1) * m.rowGap + m.padBottom
      : 0
  return {
    columns,
    cellW,
    cellH: m.cellH,
    colGap: m.colGap,
    rowGap: m.rowGap,
    padX: m.padX,
    padTop: m.padTop,
    padBottom: m.padBottom,
    headerHeight: m.headerHeight,
    rowCount,
    totalHeight,
    itemCount
  }
}

/** Y of the first row's top edge: content padding plus any sticky header. */
function originY(layout: GridLayout): number {
  return layout.headerHeight + layout.padTop
}

/** Absolute box of the item at `index` within the content area. */
export function itemBox(index: number, layout: GridLayout): Box {
  const row = Math.floor(index / layout.columns)
  const col = index % layout.columns
  return {
    left: layout.padX + col * (layout.cellW + layout.colGap),
    top: originY(layout) + row * (layout.cellH + layout.rowGap),
    width: layout.cellW,
    height: layout.cellH
  }
}

/**
 * Half-open [start, end) item range to render for a scroll position, padded by
 * `overscanRows` above and below so scrolling doesn't reveal blank space.
 */
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  layout: GridLayout,
  overscanRows = 3
): { start: number; end: number } {
  const stride = layout.cellH + layout.rowGap
  const origin = originY(layout)
  const firstRow = Math.max(0, Math.floor((scrollTop - origin) / stride) - overscanRows)
  const lastRow = Math.min(
    layout.rowCount - 1,
    Math.floor((scrollTop + viewportHeight - origin) / stride) + overscanRows
  )
  if (lastRow < firstRow) return { start: 0, end: 0 }
  return {
    start: firstRow * layout.columns,
    end: Math.min(layout.itemCount, (lastRow + 1) * layout.columns)
  }
}

/**
 * The scrollTop needed to bring item `index` just into view (Windows-style
 * "nearest"): scroll up if it's above, down if below, or null if already visible.
 */
export function revealOffset(
  index: number,
  scrollTop: number,
  viewportHeight: number,
  layout: GridLayout
): number | null {
  const { top, height } = itemBox(index, layout)
  const bottom = top + height
  if (top < scrollTop) return top
  if (bottom > scrollTop + viewportHeight) return bottom - viewportHeight
  return null
}

/** Indices of items whose cell intersects the given rect (content coordinates). */
export function itemsInRect(rect: Box, layout: GridLayout): number[] {
  const hits: number[] = []
  if (layout.itemCount === 0) return hits
  const rowStride = layout.cellH + layout.rowGap
  const colStride = layout.cellW + layout.colGap
  const origin = originY(layout)
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  let rStart = Math.floor((rect.top - origin) / rowStride)
  let rEnd = Math.floor((bottom - origin) / rowStride)
  if (rStart < 0) rStart = 0
  if (rEnd > layout.rowCount - 1) rEnd = layout.rowCount - 1
  for (let r = rStart; r <= rEnd; r++) {
    const itemTop = origin + r * rowStride
    if (itemTop + layout.cellH <= rect.top || itemTop >= bottom) continue
    let cStart = Math.floor((rect.left - layout.padX) / colStride)
    let cEnd = Math.floor((right - layout.padX) / colStride)
    if (cStart < 0) cStart = 0
    if (cEnd > layout.columns - 1) cEnd = layout.columns - 1
    for (let c = cStart; c <= cEnd; c++) {
      const itemLeft = layout.padX + c * colStride
      if (itemLeft + layout.cellW <= rect.left || itemLeft >= right) continue
      const idx = r * layout.columns + c
      if (idx < layout.itemCount) hits.push(idx)
    }
  }
  return hits
}
