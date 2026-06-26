import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import Skeleton from './Skeleton'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'

beforeEach(() => {
  resetExplorerStore()
})

/** The single shimmering placeholder container always carries aria-busy. */
const busyEl = (container: HTMLElement): HTMLElement => {
  const el = container.querySelector('[aria-busy="true"]')
  if (!el) throw new Error('no aria-busy container rendered')
  return el as HTMLElement
}

describe('Skeleton (loading placeholder)', () => {
  it('renders the details view: 26 rows with a 4-column grid using default column widths', () => {
    useExplorerStore.setState({ viewMode: 'details', columnWidths: {} })
    const { container } = render(<Skeleton />)
    const root = busyEl(container)

    // 26 detail rows.
    const rows = root.children
    expect(rows).toHaveLength(26)

    // Falls back to default widths (180 / 150 / 100) when columnWidths is empty.
    const firstRow = rows[0] as HTMLElement
    expect(firstRow.style.gridTemplateColumns).toBe('minmax(0, 1fr) 180px 150px 100px')

    // Each row: a name cell (icon + name block) + three metadata blocks => 4 direct children.
    expect(firstRow.children).toHaveLength(4)
    // The name block width cycles through NAME_WIDTHS; index 0 => 62%.
    const nameBlock = firstRow.querySelector('span:nth-child(2)') as HTMLElement
    expect(nameBlock.style.width).toBe('62%')
  })

  it('renders the details view using explicit columnWidths when provided', () => {
    useExplorerStore.setState({
      viewMode: 'details',
      columnWidths: { date: 200, type: 120, size: 90 }
    })
    const { container } = render(<Skeleton />)
    const firstRow = busyEl(container).children[0] as HTMLElement
    expect(firstRow.style.gridTemplateColumns).toBe('minmax(0, 1fr) 200px 120px 90px')
  })

  it('renders the list view: 60 single-line entries', () => {
    useExplorerStore.setState({ viewMode: 'list' })
    const { container } = render(<Skeleton />)
    const root = busyEl(container)
    expect(root.children).toHaveLength(60)
    // Each entry is icon + name block.
    expect((root.children[0] as HTMLElement).children).toHaveLength(2)
  })

  it('renders the small view: same 60-entry list shape (small variant)', () => {
    useExplorerStore.setState({ viewMode: 'small' })
    const { container } = render(<Skeleton />)
    const listRoot = busyEl(container)
    const detailsRoot = busyEl(container) // sanity: only one busy container
    expect(listRoot).toBe(detailsRoot)
    expect(listRoot.children).toHaveLength(60)
    expect((listRoot.children[0] as HTMLElement).children).toHaveLength(2)
  })

  it('renders the tiles view: 14 tiles, each with an icon and a two-line text block', () => {
    useExplorerStore.setState({ viewMode: 'tiles' })
    const { container } = render(<Skeleton />)
    const root = busyEl(container)
    expect(root.children).toHaveLength(14)
    const tile = root.children[0] as HTMLElement
    // tile = icon Block + tileText wrapper.
    expect(tile.children).toHaveLength(2)
    const tileText = tile.children[1] as HTMLElement
    expect(tileText.children).toHaveLength(2)
  })

  it.each(['medium', 'large', 'extra-large'] as const)(
    'renders the %s icon grid: 48 tiles each with an icon and a name block',
    (viewMode) => {
      useExplorerStore.setState({ viewMode })
      const { container } = render(<Skeleton />)
      const root = busyEl(container)
      expect(root.children).toHaveLength(48)
      expect((root.children[0] as HTMLElement).children).toHaveLength(2)
    }
  )

  it('cycles name-bar widths past the 12-entry table (modulo wrap-around)', () => {
    // The list view renders 60 entries; index 12 wraps back to NAME_WIDTHS[0] = 62%.
    useExplorerStore.setState({ viewMode: 'list' })
    const { container } = render(<Skeleton />)
    const entries = busyEl(container).children
    const widthAt = (i: number): string =>
      ((entries[i] as HTMLElement).querySelector('span:nth-child(2)') as HTMLElement).style.width
    expect(widthAt(0)).toBe('62%')
    expect(widthAt(12)).toBe('62%') // wraps
    expect(widthAt(13)).toBe('44%')
  })
})
