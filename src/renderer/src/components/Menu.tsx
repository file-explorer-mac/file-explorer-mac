import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  /**
   * Set by a parent menu on its submenus. Submenus share the root's id and let
   * the root own dismissal — see the outside-click effect below.
   */
  treeId?: string
}

/** A flyout menu, positioned at (x, y) and clamped to the viewport. */
export const Menu: React.FC<MenuProps> = ({
  items,
  x,
  y,
  onClose,
  minWidth = 200,
  ignore,
  treeId
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const autoId = useId()
  const isRoot = treeId === undefined
  const treeKey = treeId ?? autoId
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

  // Only the root menu watches for outside clicks. Submenus are portaled to the
  // body, so a nested watcher would see a click on its own parent row as
  // "outside" and tear the whole menu down.
  useEffect(() => {
    if (!isRoot) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      // Every menu in this tree, including submenus portaled to the body — so
      // containment has to be checked against all of them, not just this box.
      const tree = document.querySelectorAll(`[data-menu-tree="${treeKey}"]`)
      if (Array.from(tree).some((m) => m.contains(t))) return
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
  }, [onClose, ignore, isRoot, treeKey])

  const openSubmenuAt = (index: number, row: HTMLElement): void => {
    const r = row.getBoundingClientRect()
    setSubPos({ left: r.right - 4, top: r.top - 4 })
    setOpenSub(index)
  }

  const handleItem = (item: MenuItem, index: number, row: HTMLElement): void => {
    if (item.disabled || item.type === 'separator' || item.type === 'header') return
    // A parent row opens its submenu; it has no action of its own.
    if (item.submenu) {
      openSubmenuAt(index, row)
      return
    }
    item.onClick?.()
    onClose()
  }

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ left: pos.left, top: pos.top, minWidth }}
      role="menu"
      data-menu-tree={treeKey}
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
              item.danger ? styles.danger : '',
              // Keep the row lit while its submenu is up — the submenu is
              // portaled away, so :hover no longer covers it.
              openSub === i ? styles.itemOpen : ''
            ]
              .filter(Boolean)
              .join(' ')}
            role="menuitem"
            aria-disabled={item.disabled}
            aria-haspopup={hasSub || undefined}
            aria-expanded={hasSub ? openSub === i : undefined}
            onMouseEnter={(e) => {
              if (hasSub && !item.disabled) openSubmenuAt(i, e.currentTarget)
              else setOpenSub(null)
            }}
            onClick={(e) => handleItem(item, i, e.currentTarget)}
          >
            {/*
              One shared gutter, not a checkmark column plus an icon column.
              Reserving it unconditionally keeps every label on the same left
              edge whether or not the row has a glyph — a ragged text edge reads
              worse than a little empty space, and inventing an icon for every
              row just to fill it produces meaningless glyphs.
            */}
            <span className={`${styles.gutter} ${item.checked ? styles.gutterChecked : ''}`}>
              {item.checked ? (
                <Icon name="check" size={15} />
              ) : item.icon ? (
                <Icon name={item.icon} size={16} />
              ) : null}
            </span>
            <span className={styles.label}>{item.label}</span>
            {item.shortcut ? <span className={styles.shortcut}>{item.shortcut}</span> : null}
            {hasSub ? (
              <span className={styles.submenuArrow}>
                <Icon name="chevronRight" size={14} />
              </span>
            ) : null}
            {/*
              Portaled to the body on purpose: .menu sets backdrop-filter, which
              makes this menu the containing block for position:fixed children,
              so a nested submenu would resolve its viewport coordinates against
              this box and land off-screen.
            */}
            {hasSub && openSub === i
              ? createPortal(
                  <Menu
                    items={item.submenu!}
                    x={subPos.left}
                    y={subPos.top}
                    onClose={onClose}
                    minWidth={180}
                    treeId={treeKey}
                  />,
                  document.body
                )
              : null}
          </div>
        )
      })}
    </div>
  )
}

export default Menu
