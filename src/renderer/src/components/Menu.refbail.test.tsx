import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Isolated in its own file because mocking `react` is module-global: here we
// override `useRef(null)` (the div ref) so its `current` stays null, letting us
// exercise the `if (!el) return` guard in Menu's layout effect. Every other
// Menu behavior is covered in Menu.test.tsx with the real React.
vi.mock('react', async (importActual) => {
  const actual = await importActual<typeof import('react')>()
  const nullRef = Object.defineProperty(
    {},
    'current',
    { get: () => null, set: () => {} }
  )
  return {
    ...actual,
    default: actual,
    // Only `useRef(null)` (the div ref) gets the permanently-null ref; refs
    // created with any other initial value behave normally.
    useRef: (init?: unknown) => (init === null ? nullRef : actual.useRef(init))
  }
})

import { Menu } from './Menu'

describe('Menu — layout effect ref guard', () => {
  it('skips clamping when the div ref never attaches (ref.current stays null)', () => {
    // A viewport small enough that clamping WOULD move the menu if the effect ran.
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(10)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(10)
    render(<Menu items={[{ label: 'A' }]} x={500} y={600} onClose={vi.fn()} />)
    // Position is the raw (x, y): the effect hit `if (!el) return` and never clamped.
    expect(screen.getByRole('menu')).toHaveStyle({ left: '500px', top: '600px' })
  })
})
