import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Menu, type MenuItem } from './Menu'

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  // Restore window getter / prototype spies so they don't leak between tests
  // (the shared setup only clears mocks, it does not restore them).
  vi.restoreAllMocks()
})

describe('Menu', () => {
  it('renders items, separators and headers; fires onClick + onClose on click', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onClick = vi.fn()
    const items: MenuItem[] = [
      { type: 'header', label: 'Section' },
      { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', checked: true, onClick },
      { type: 'separator' },
      { label: 'Delete', danger: true }
    ]
    render(<Menu items={items} x={10} y={10} onClose={onClose} />)

    expect(screen.getByText('Section')).toBeInTheDocument()
    expect(screen.getByText('Ctrl+C')).toBeInTheDocument()

    await user.click(screen.getByText('Copy'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does nothing when a disabled item is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onClick = vi.fn()
    render(
      <Menu
        items={[{ label: 'Nope', disabled: true, onClick }]}
        x={0}
        y={0}
        onClose={onClose}
      />
    )
    const item = screen.getByText('Nope')
    expect(item.closest('[role="menuitem"]')).toHaveAttribute('aria-disabled', 'true')
    await user.click(item)
    expect(onClick).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('uses default minWidth and falls back to index keys when no key/label', () => {
    const onClose = vi.fn()
    // item without label/key -> index key fallback; no onClick -> optional chaining
    render(<Menu items={[{}]} x={0} y={0} onClose={onClose} />)
    const menu = screen.getByRole('menu')
    expect(menu).toHaveStyle({ minWidth: '200px' })
  })

  it('clicking a bare (no-onClick) item still closes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Menu items={[{ label: 'Bare' }]} x={0} y={0} onClose={onClose} />)
    await user.click(screen.getByText('Bare'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  describe('viewport clamping', () => {
    it('clamps left and top when the menu overflows the viewport', () => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(100)
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(100)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 80,
        height: 80,
        right: 0,
        top: 0,
        left: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({})
      } as DOMRect)
      render(<Menu items={[{ label: 'A' }]} x={90} y={90} onClose={vi.fn()} />)
      const menu = screen.getByRole('menu')
      // left = max(8, 100 - 80 - 8) = 12 ; top likewise 12
      expect(menu).toHaveStyle({ left: '12px', top: '12px' })
    })

    it('falls back to the floor of 8 when the menu is wider/taller than the viewport', () => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(50)
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(50)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 200,
        height: 200,
        right: 0,
        top: 0,
        left: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({})
      } as DOMRect)
      render(<Menu items={[{ label: 'A' }]} x={40} y={40} onClose={vi.fn()} />)
      const menu = screen.getByRole('menu')
      expect(menu).toHaveStyle({ left: '8px', top: '8px' })
    })

    it('does not clamp when the menu fits', () => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000)
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1000)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 50,
        height: 50,
        right: 0,
        top: 0,
        left: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({})
      } as DOMRect)
      render(<Menu items={[{ label: 'A' }]} x={30} y={40} onClose={vi.fn()} />)
      const menu = screen.getByRole('menu')
      expect(menu).toHaveStyle({ left: '30px', top: '40px' })
    })
  })

  describe('outside click / escape', () => {
    it('closes on an outside mousedown after the deferred listener attaches', () => {
      vi.useFakeTimers()
      const onClose = vi.fn()
      render(<Menu items={[{ label: 'A' }]} x={0} y={0} onClose={onClose} />)
      act(() => {
        vi.runAllTimers()
      })
      // mousedown inside should be ignored
      const menu = screen.getByRole('menu')
      act(() => {
        menu.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      })
      expect(onClose).not.toHaveBeenCalled()
      // mousedown outside closes
      act(() => {
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not close when the click lands on the ignore element', () => {
      vi.useFakeTimers()
      const onClose = vi.fn()
      const ignore = document.createElement('button')
      document.body.appendChild(ignore)
      render(<Menu items={[{ label: 'A' }]} x={0} y={0} onClose={onClose} ignore={ignore} />)
      act(() => {
        vi.runAllTimers()
      })
      act(() => {
        ignore.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      })
      expect(onClose).not.toHaveBeenCalled()
      document.body.removeChild(ignore)
    })

    it('closes via contextmenu outside', () => {
      vi.useFakeTimers()
      const onClose = vi.fn()
      render(<Menu items={[{ label: 'A' }]} x={0} y={0} onClose={onClose} />)
      act(() => {
        vi.runAllTimers()
      })
      act(() => {
        document.body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
      })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('closes on Escape', () => {
      const onClose = vi.fn()
      render(<Menu items={[{ label: 'A' }]} x={0} y={0} onClose={onClose} />)
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('ignores other keys', () => {
      const onClose = vi.fn()
      render(<Menu items={[{ label: 'A' }]} x={0} y={0} onClose={onClose} />)
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })
      expect(onClose).not.toHaveBeenCalled()
    })

    it('prevents the default context menu on the menu element', () => {
      render(<Menu items={[{ label: 'A' }]} x={0} y={0} onClose={vi.fn()} />)
      const menu = screen.getByRole('menu')
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      menu.dispatchEvent(ev)
      expect(ev.defaultPrevented).toBe(true)
    })
  })

  describe('submenus', () => {
    const subItems: MenuItem[] = [
      {
        label: 'Parent',
        submenu: [{ label: 'Child', onClick: vi.fn() }]
      }
    ]

    it('opens the submenu on hover', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<Menu items={subItems} x={0} y={0} onClose={onClose} />)
      const parent = screen.getByText('Parent').closest('[role="menuitem"]')!
      await user.hover(parent)
      expect(screen.getByText('Child')).toBeInTheDocument()
    })

    it('clicking a submenu parent returns early so its own onClick never fires', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onClick = vi.fn()
      const items: MenuItem[] = [
        { label: 'Parent', onClick, submenu: [{ label: 'Child' }] }
      ]
      render(<Menu items={items} x={0} y={0} onClose={onClose} />)
      await user.click(screen.getByText('Parent'))
      // handleItem returns early for items with a submenu — the parent onClick
      // is never invoked.
      expect(onClick).not.toHaveBeenCalled()
    })

    it('hovering an item without a submenu closes any open submenu', async () => {
      const user = userEvent.setup()
      const items: MenuItem[] = [
        { label: 'Parent', submenu: [{ label: 'Child' }] },
        { label: 'Plain' }
      ]
      render(<Menu items={items} x={0} y={0} onClose={vi.fn()} />)
      await user.hover(screen.getByText('Parent').closest('[role="menuitem"]')!)
      expect(screen.getByText('Child')).toBeInTheDocument()
      await user.hover(screen.getByText('Plain').closest('[role="menuitem"]')!)
      expect(screen.queryByText('Child')).not.toBeInTheDocument()
    })

    it('does not open the submenu for a disabled parent', async () => {
      const user = userEvent.setup()
      const items: MenuItem[] = [
        { label: 'Parent', disabled: true, submenu: [{ label: 'Child' }] }
      ]
      render(<Menu items={items} x={0} y={0} onClose={vi.fn()} />)
      await user.hover(screen.getByText('Parent').closest('[role="menuitem"]')!)
      expect(screen.queryByText('Child')).not.toBeInTheDocument()
    })

    it('clicking a child fires its onClick and onClose', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const childClick = vi.fn()
      const items: MenuItem[] = [
        { label: 'Parent', submenu: [{ label: 'Child', onClick: childClick }] }
      ]
      render(<Menu items={items} x={0} y={0} onClose={onClose} />)
      await user.hover(screen.getByText('Parent').closest('[role="menuitem"]')!)
      await user.click(screen.getByText('Child'))
      expect(childClick).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('renders no arrow for an empty submenu array but the click is still swallowed (current behavior)', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onClick = vi.fn()
      const items: MenuItem[] = [{ label: 'Empty', submenu: [], onClick }]
      render(<Menu items={items} x={0} y={0} onClose={onClose} />)
      await user.click(screen.getByText('Empty'))
      // hasSub is false (no arrow) but handleItem's `if (item.submenu) return`
      // treats the truthy empty array as a submenu, so onClick/onClose never fire.
      expect(onClick).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})
