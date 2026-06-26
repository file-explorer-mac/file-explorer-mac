import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { FileGlyph, default as DefaultFileGlyph } from './FileGlyph'

/**
 * FileGlyph is a pure presentational SVG. We assert on the rendered SVG
 * structure (size attributes, className, and the badge text/font for the
 * generic "Page" kinds) rather than pixel output.
 */

const svgOf = (container: HTMLElement): SVGSVGElement => {
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('no <svg> rendered')
  return svg as unknown as SVGSVGElement
}

describe('FileGlyph', () => {
  it('renders the folder glyph (no Page badge text)', () => {
    const { container } = render(<FileGlyph kind="folder" />)
    const svg = svgOf(container)
    // folder branch draws three <path>s and emits no <text> badge
    expect(svg.querySelector('text')).toBeNull()
    expect(svg.querySelectorAll('path').length).toBe(3)
  })

  it('renders the app glyph with its gradient defs', () => {
    const { container } = render(<FileGlyph kind="app" />)
    const svg = svgOf(container)
    expect(svg.querySelector('text')).toBeNull()
    expect(svg.querySelector('linearGradient#appGrad')).not.toBeNull()
  })

  it('renders the drive glyph', () => {
    const { container } = render(<FileGlyph kind="drive" />)
    const svg = svgOf(container)
    expect(svg.querySelector('text')).toBeNull()
    // the green status dot
    expect(svg.querySelector('circle')).not.toBeNull()
  })

  it('renders the image glyph', () => {
    const { container } = render(<FileGlyph kind="image" />)
    const svg = svgOf(container)
    expect(svg.querySelector('text')).toBeNull()
    expect(svg.querySelector('circle')).not.toBeNull()
  })

  it('renders a Page kind badge from KIND_BADGE (text -> TXT, larger font)', () => {
    const { container } = render(<FileGlyph kind="text" />)
    const text = svgOf(container).querySelector('text')!
    expect(text).not.toBeNull()
    expect(text.textContent).toBe('TXT')
    // label length 3 -> not > 3 -> larger 6.2 font
    expect(text.getAttribute('font-size')).toBe('6.2')
    // badge rect uses the text color
    expect(container.querySelector('rect[fill="#5a6b7b"]')).not.toBeNull()
  })

  it('renders the pdf Page badge', () => {
    const { container } = render(<FileGlyph kind="pdf" />)
    const text = svgOf(container).querySelector('text')!
    expect(text.textContent).toBe('PDF')
    expect(container.querySelector('rect[fill="#e2453c"]')).not.toBeNull()
  })

  it('renders the code Page badge with its "<>" label', () => {
    const { container } = render(<FileGlyph kind="code" />)
    const text = svgOf(container).querySelector('text')!
    expect(text.textContent).toBe('<>')
    expect(text.getAttribute('font-size')).toBe('6.2')
  })

  it('renders the font Page badge (single-char label)', () => {
    const { container } = render(<FileGlyph kind="font" />)
    const text = svgOf(container).querySelector('text')!
    expect(text.textContent).toBe('F')
  })

  it('renders the disk-image Page badge', () => {
    const { container } = render(<FileGlyph kind="disk-image" />)
    const text = svgOf(container).querySelector('text')!
    expect(text.textContent).toBe('DMG')
  })

  it('renders the generic file Page badge with an empty label', () => {
    const { container } = render(<FileGlyph kind="file" />)
    const text = svgOf(container).querySelector('text')!
    // KIND_BADGE.file.label is '' and no ext supplied
    expect(text.textContent).toBe('')
  })

  it('uppercases + slices the ext to <= 4 chars for the badge label', () => {
    const { container } = render(<FileGlyph kind="text" ext="md" />)
    const text = svgOf(container).querySelector('text')!
    expect(text.textContent).toBe('MD')
    // 2 chars -> larger font
    expect(text.getAttribute('font-size')).toBe('6.2')
  })

  it('uses the smaller font when the ext label exceeds 3 chars', () => {
    const { container } = render(<FileGlyph kind="text" ext="jpeg" />)
    const text = svgOf(container).querySelector('text')!
    // 'jpeg'.slice(0,4) -> 'JPEG', length 4 > 3 -> smaller 5.4 font
    expect(text.textContent).toBe('JPEG')
    expect(text.getAttribute('font-size')).toBe('5.4')
  })

  it('slices an ext longer than 4 chars down to 4 (smaller font)', () => {
    const { container } = render(<FileGlyph kind="text" ext="markdown" />)
    const text = svgOf(container).querySelector('text')!
    expect(text.textContent).toBe('MARK')
    expect(text.getAttribute('font-size')).toBe('5.4')
  })

  it('falls back to KIND_BADGE.file for an unknown kind', () => {
    // Cast an unsupported value through the switch default + Page fallback.
    const { container } = render(<FileGlyph kind={'mystery' as never} />)
    const text = svgOf(container).querySelector('text')!
    expect(text.textContent).toBe('')
    // file fallback color
    expect(container.querySelector('rect[fill="#9aa3ad"]')).not.toBeNull()
  })

  it('defaults to size 32 and forwards a custom size to width/height', () => {
    const def = render(<FileGlyph kind="folder" />)
    const defSvg = svgOf(def.container)
    expect(defSvg.getAttribute('width')).toBe('32')
    expect(defSvg.getAttribute('height')).toBe('32')

    const custom = render(<FileGlyph kind="folder" size={64} />)
    const customSvg = svgOf(custom.container)
    expect(customSvg.getAttribute('width')).toBe('64')
    expect(customSvg.getAttribute('height')).toBe('64')
  })

  it('forwards className onto the svg', () => {
    const { container } = render(<FileGlyph kind="folder" className="glyph big" />)
    expect(svgOf(container).getAttribute('class')).toBe('glyph big')
  })

  it('marks the svg as decorative (aria-hidden, not focusable)', () => {
    const { container } = render(<FileGlyph kind="folder" />)
    const svg = svgOf(container)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
  })

  it('exposes the same component as the default export', () => {
    expect(DefaultFileGlyph).toBe(FileGlyph)
  })
})
