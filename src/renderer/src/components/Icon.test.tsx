import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Icon, type IconName } from './Icon'
import IconDefault from './Icon'

// Every name in the IconName union — render each to cover every entry of the
// PATHS map (each branch of the lookup) and both fill/stroke modes.
const ALL_NAMES: IconName[] = [
  'back',
  'forward',
  'up',
  'refresh',
  'new',
  'newFolder',
  'cut',
  'copy',
  'paste',
  'rename',
  'share',
  'delete',
  'sort',
  'layout',
  'filter',
  'more',
  'chevronDown',
  'chevronRight',
  'chevronLeft',
  'search',
  'check',
  'bullet',
  'minimize',
  'maximize',
  'restore',
  'close',
  'add',
  'home',
  'desktop',
  'documents',
  'downloads',
  'pictures',
  'music',
  'videos',
  'applications',
  'drive',
  'thisPC',
  'star',
  'clock',
  'eye',
  'info',
  'undo',
  'group',
  'details',
  'gridLarge',
  'gridMedium',
  'gridSmall',
  'list',
  'tiles',
  'extraLarge',
  'lock'
]

// Glyphs that the source renders as solid fills rather than strokes.
const FILLED_NAMES: IconName[] = ['filter', 'star', 'bullet']

describe('Icon', () => {
  it('renders an <svg> for every IconName', () => {
    for (const name of ALL_NAMES) {
      const { container, unmount } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
      // At least one drawn child (path/rect/circle) from the PATHS map.
      expect(svg!.childElementCount).toBeGreaterThan(0)
      unmount()
    }
  })

  it('applies stroke (not fill) for non-filled glyphs', () => {
    const { container } = render(<Icon name="back" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('fill')).toBe('none')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
  })

  it('uses currentColor fill (and no stroke) for FILLED glyphs', () => {
    for (const name of FILLED_NAMES) {
      const { container, unmount } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')!
      expect(svg.getAttribute('fill')).toBe('currentColor')
      expect(svg.getAttribute('stroke')).toBe('none')
      unmount()
    }
  })

  it('defaults to size 16 and strokeWidth 1.1, aria-hidden, focusable=false', () => {
    const { container } = render(<Icon name="search" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg.getAttribute('height')).toBe('16')
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16')
    expect(svg.getAttribute('stroke-width')).toBe('1.1')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
  })

  it('honors the size prop for width and height', () => {
    const { container } = render(<Icon name="copy" size={32} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('32')
    expect(svg.getAttribute('height')).toBe('32')
  })

  it('honors a custom strokeWidth prop', () => {
    const { container } = render(<Icon name="copy" strokeWidth={2} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('stroke-width')).toBe('2')
  })

  it('forwards className and style props to the svg', () => {
    const { container } = render(
      <Icon name="info" className="my-icon" style={{ color: 'red' }} />
    )
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('class')).toBe('my-icon')
    expect(svg.style.color).toBe('red')
  })

  it('renders an empty svg for an unknown/fallback name', () => {
    // Cast through unknown to exercise the lookup-miss path: PATHS[name] is
    // undefined so the svg renders with no child glyph.
    const { container } = render(<Icon name={'nope' as unknown as IconName} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.childElementCount).toBe(0)
    // Unknown name is not in FILLED, so it strokes.
    expect(svg!.getAttribute('fill')).toBe('none')
    expect(svg!.getAttribute('stroke')).toBe('currentColor')
  })

  it('exports the same component as the default export', () => {
    expect(IconDefault).toBe(Icon)
  })
})
