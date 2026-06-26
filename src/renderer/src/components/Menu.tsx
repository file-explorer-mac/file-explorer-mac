import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'
import styles from './Menu.module.css'

export interface MenuItem {
  key?: string
  type?: 'item' | 'separator' | 'header'
  label?: string
  icon?: IconName
  /** Right-aligned shortcut hint, e.g. "Ctrl+C". */
  shortcut?: string
  /** Shows a leading checkmark / radio dot when true. */
  checked?: boolean
  disabled?: boolean
  /** Red destructive styling (Delete). */
  danger?: boolean
  submenu?: MenuItem[]
  onClick?: () => void
}

interface MenuProps {
  items: MenuItem[]
  x: number
  y: number
  onClose: () => void
  minWidth?: number
  /** Element (e.g. the toggle button) that should NOT count as an outside click. */
  ignore?: HTMLElement | null
}

/** A flyout menu, positioned at (x, y) and clamped to the viewport. */
export const Menu: React.FC<MenuProps> = ({ items, x, y, onClose, minWidth = 200, ignore }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [openSub, setOpenSub] = useState<number | null>(null)
  const [subPos, setSubPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let left = x
    let top = y
    if (left + rect.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - rect.width - 8)
    if (top + rect.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - rect.height - 8)
    setPos({ left, top })
  }, [x, y, items])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (ref.current && ref.current.contains(t)) return
      // Don't treat a click on the toggle button as "outside" — let it toggle.
      if (ignore && ignore.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // Defer so the opening click doesn't immediately close it.
    const t = setTimeout(() => {
      window.addEventListener('mousedown', onDown, true)
      window.addEventListener('contextmenu', onDown, true)
    }, 0)
    window.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('contextmenu', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose, ignore])

  const handleItem = (item: MenuItem): void => {
    if (item.disabled || item.type === 'separator' || item.type === 'header') return
    if (item.submenu) return
    item.onClick?.()
    onClose()
  }

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ left: pos.left, top: pos.top, minWidth }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') return <div key={item.key ?? `sep-${i}`} className={styles.separator} />
        if (item.type === 'header')
          return (
            <div key={item.key ?? `h-${i}`} className={styles.header}>
              {item.label}
            </div>
          )
        const hasSub = !!item.submenu?.length
        return (
          <div
            key={item.key ?? item.label ?? i}
            className={[
              styles.item,
              item.disabled ? styles.disabled : '',
              item.danger ? styles.danger : ''
            ]
              .filter(Boolean)
              .join(' ')}
            role="menuitem"
            aria-disabled={item.disabled}
            onMouseEnter={(e) => {
              if (hasSub && !item.disabled) {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setSubPos({ left: r.right - 4, top: r.top - 4 })
                setOpenSub(i)
              } else {
                setOpenSub(null)
              }
            }}
            onClick={() => handleItem(item)}
          >
            <span className={styles.check}>{item.checked ? <Icon name="check" size={15} /> : null}</span>
            <span className={styles.icon}>{item.icon ? <Icon name={item.icon} size={16} /> : null}</span>
            <span className={styles.label}>{item.label}</span>
            {item.shortcut ? <span className={styles.shortcut}>{item.shortcut}</span> : null}
            {hasSub ? (
              <span className={styles.submenuArrow}>
                <Icon name="chevronRight" size={14} />
              </span>
            ) : null}
            {hasSub && openSub === i ? (
              <Menu
                items={item.submenu!}
                x={subPos.left}
                y={subPos.top}
                onClose={onClose}
                minWidth={180}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default Menu
