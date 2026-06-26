import { useEffect } from 'react'
import { useExplorerStore, selectVisibleItems } from '@/store/explorerStore'

/** Custom events used to focus the address bar / search box from shortcuts. */
export const FOCUS_SEARCH_EVENT = 'fe:focus-search'
export const EDIT_ADDRESS_EVENT = 'fe:edit-address'

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

/**
 * Scroll the row for `path` into view, if it is currently rendered. A direct
 * attribute lookup avoids scanning every row node on each keystroke (which is
 * costly in folders with thousands of files). The value is escaped so paths
 * containing quotes/backslashes stay valid inside the selector.
 */
function scrollPathIntoView(path: string): void {
  const escaped = path.replace(/["\\]/g, '\\$&')
  document.querySelector(`[data-path="${escaped}"]`)?.scrollIntoView({ block: 'nearest' })
}

/**
 * Global keyboard handler implementing common file-manager keyboard shortcuts.
 * Cmd is treated the same as Ctrl so the app feels native on macOS too.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    // Type-ahead buffer (persists across keystrokes for the component's lifetime).
    let typeBuffer = ''
    let typeTime = 0

    const onKey = (e: KeyboardEvent): void => {
      const s = useExplorerStore.getState()
      const mod = e.ctrlKey || e.metaKey
      const typing = isTypingTarget(e.target)

      // While renaming or typing in a field, let the field own the keys.
      if (s.renamingPath) return
      if (typing) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }

      // Focus search: Ctrl/Cmd+F or Ctrl/Cmd+E
      if (mod && (e.key === 'f' || e.key === 'e')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT))
        return
      }
      // Edit address: Ctrl/Cmd+L
      if (mod && e.key === 'l') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent(EDIT_ADDRESS_EVENT))
        return
      }

      // New folder: Ctrl/Cmd+Shift+N
      if (mod && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault()
        void s.createFolder()
        return
      }

      if (mod && !e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'a':
            e.preventDefault()
            s.selectAll()
            return
          case 'c':
            e.preventDefault()
            s.copySelection()
            return
          case 'x':
            e.preventDefault()
            s.cutSelection()
            return
          case 'v':
            e.preventDefault()
            void s.paste()
            return
          case 'n':
            e.preventDefault()
            window.api.windowNew()
            return
          case 't':
            e.preventDefault()
            s.newTab()
            return
          case 'w':
            e.preventDefault()
            s.closeTab(s.activeTabId)
            return
          case 'r':
            e.preventDefault()
            void s.refresh()
            return
          case 'z':
            e.preventDefault()
            void s.undo()
            return
          case 'i':
            e.preventDefault()
            s.openProperties()
            return
        }
      }

      // Alt-based navigation
      if (e.altKey) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          s.goBack()
          return
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          s.goForward()
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          s.goUp()
          return
        }
      }

      // Arrow / Home / End move the file-list selection, Windows Explorer style.
      // Living on the window (not the list) means they work even before anything
      // has been clicked or selected: the first press lands on the first item.
      if (
        !mod &&
        !e.altKey &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End')
      ) {
        const visible = selectVisibleItems(s)
        if (!visible.length) return
        e.preventDefault()
        const cur = s.anchorPath ? visible.findIndex((i) => i.path === s.anchorPath) : -1
        let next = cur
        switch (e.key) {
          case 'ArrowUp':
            // With nothing selected, Up wraps to the last item (Windows behavior).
            next = cur < 0 ? visible.length - 1 : Math.max(0, cur - 1)
            break
          case 'ArrowDown':
            next = cur < 0 ? 0 : Math.min(visible.length - 1, cur + 1)
            break
          case 'Home':
            next = 0
            break
          case 'End':
            next = visible.length - 1
            break
        }
        // Already at the edge (e.g. Up while the first item is selected): do nothing.
        if (next === cur) return
        const target = visible[next]
        /* v8 ignore start -- defensive: next is always clamped into [0, visible.length-1] above */
        if (!target) return
        /* v8 ignore stop */
        if (e.shiftKey) s.rangeSelectTo(target.path)
        else s.selectOne(target.path)
        scrollPathIntoView(target.path)
        return
      }

      switch (e.key) {
        case 'F5':
          e.preventDefault()
          void s.refresh()
          return
        case 'F2': {
          const first = [...s.selection][0]
          if (first) {
            e.preventDefault()
            s.beginRename(first)
          }
          return
        }
        case 'Delete':
          if (s.selection.size) {
            e.preventDefault()
            void s.deleteSelection()
          }
          return
        case 'Backspace':
          e.preventDefault()
          s.goBack()
          return
        case 'Enter': {
          const sel = [...s.selection]
          if (!sel.length) return
          e.preventDefault()
          const items = s.items.filter((i) => s.selection.has(i.path))
          if (items.length === 1) {
            void s.openItem(items[0])
          } else {
            for (const it of items) if (!it.isDirectory) void s.openItem(it)
          }
          return
        }
        case 'Escape':
          if (s.contextMenu) s.closeContextMenu()
          else s.clearSelection()
          return
      }

      // Type-ahead: a printable character selects the next item whose name starts
      // with the typed prefix. Typing quickly accumulates a prefix; repeating the
      // same letter cycles through matches (familiar file-manager behavior).
      if (e.key.length === 1 && !mod && !e.altKey && !(e.key === ' ' && typeBuffer === '')) {
        const now = Date.now()
        const expired = now - typeTime > 800
        typeTime = now
        const ch = e.key
        let cycle = false
        if (expired) {
          typeBuffer = ch
        } else if (typeBuffer.toLowerCase() === ch.toLowerCase()) {
          typeBuffer = ch
          cycle = true
        } else {
          typeBuffer += ch
        }
        const needle = typeBuffer.toLowerCase()
        const visible = selectVisibleItems(s)
        if (!visible.length) return
        const curIdx = s.anchorPath ? visible.findIndex((i) => i.path === s.anchorPath) : -1
        const start = cycle ? (curIdx + 1 + visible.length) % visible.length : 0
        let found = -1
        for (let k = 0; k < visible.length; k++) {
          const idx = (start + k) % visible.length
          if (visible[idx].name.toLowerCase().startsWith(needle)) {
            found = idx
            break
          }
        }
        if (found >= 0) {
          e.preventDefault()
          const path = visible[found].path
          s.selectOne(path)
          scrollPathIntoView(path)
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
