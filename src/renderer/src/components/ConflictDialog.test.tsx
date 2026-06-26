import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConflictDialog from './ConflictDialog'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import type { PendingTransfer } from '@/store/explorerStore'
import type { ConflictPolicy } from '@shared/types'

type ResolveConflict = (policy: ConflictPolicy | 'cancel') => Promise<void>
let resolveConflict: ReturnType<typeof vi.fn<ResolveConflict>>

function seedPending(overrides: Partial<PendingTransfer> = {}): void {
  const pendingTransfer: PendingTransfer = {
    srcPaths: ['/src/a.txt'],
    destDir: '/dest',
    op: 'copy',
    conflicts: ['a.txt'],
    clearCut: false,
    ...overrides
  }
  useExplorerStore.setState({ pendingTransfer, resolveConflict })
}

beforeEach(() => {
  resetExplorerStore()
  resolveConflict = vi.fn<ResolveConflict>().mockResolvedValue(undefined)
})

describe('ConflictDialog', () => {
  it('renders nothing when there is no pending transfer', () => {
    useExplorerStore.setState({ pendingTransfer: null, resolveConflict })
    const { container } = render(<ConflictDialog />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the conflict list with singular title/subtitle for one copy conflict', () => {
    seedPending({ op: 'copy', conflicts: ['a.txt'] })
    render(<ConflictDialog />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // Singular: "1 item already exists"
    expect(screen.getByRole('heading', { name: '1 item already exists' })).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-label', '1 item already exists')
    expect(screen.getByText('Copying into this folder will clash with:')).toBeInTheDocument()
    expect(screen.getByText('a.txt')).toBeInTheDocument()
  })

  it('renders plural title/subtitle for multiple move conflicts and lists every name', () => {
    seedPending({ op: 'move', conflicts: ['a.txt', 'b.txt', 'c.txt'] })
    render(<ConflictDialog />)

    expect(screen.getByRole('heading', { name: '3 items already exist' })).toBeInTheDocument()
    expect(screen.getByText('Moving into this folder will clash with:')).toBeInTheDocument()
    for (const name of ['a.txt', 'b.txt', 'c.txt']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('calls resolveConflict("replace") when Replace is clicked', async () => {
    const user = userEvent.setup()
    seedPending()
    render(<ConflictDialog />)
    await user.click(screen.getByRole('button', { name: 'Replace' }))
    expect(resolveConflict).toHaveBeenCalledWith('replace')
  })

  it('calls resolveConflict("keep-both") when Keep both is clicked', async () => {
    const user = userEvent.setup()
    seedPending()
    render(<ConflictDialog />)
    await user.click(screen.getByRole('button', { name: 'Keep both' }))
    expect(resolveConflict).toHaveBeenCalledWith('keep-both')
  })

  it('calls resolveConflict("skip") when Skip is clicked', async () => {
    const user = userEvent.setup()
    seedPending()
    render(<ConflictDialog />)
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(resolveConflict).toHaveBeenCalledWith('skip')
  })

  it('calls resolveConflict("cancel") when Cancel is clicked', async () => {
    const user = userEvent.setup()
    seedPending()
    render(<ConflictDialog />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(resolveConflict).toHaveBeenCalledWith('cancel')
  })

  it('cancels when the backdrop is mouse-pressed', async () => {
    const user = userEvent.setup()
    seedPending()
    const { container } = render(<ConflictDialog />)
    const backdrop = container.firstChild as HTMLElement
    await user.pointer({ keys: '[MouseLeft>]', target: backdrop })
    expect(resolveConflict).toHaveBeenCalledWith('cancel')
  })

  it('does not cancel when the card itself is mouse-pressed (stops propagation)', async () => {
    const user = userEvent.setup()
    seedPending()
    render(<ConflictDialog />)
    const dialog = screen.getByRole('dialog')
    await user.pointer({ keys: '[MouseLeft>]', target: dialog })
    expect(resolveConflict).not.toHaveBeenCalled()
  })

  it('cancels on Escape and prevents default', () => {
    seedPending()
    render(<ConflictDialog />)
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    window.dispatchEvent(event)
    expect(resolveConflict).toHaveBeenCalledWith('cancel')
    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores non-Escape keys', () => {
    seedPending()
    render(<ConflictDialog />)
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    window.dispatchEvent(event)
    expect(resolveConflict).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('does not register the Escape listener when there is no pending transfer', () => {
    useExplorerStore.setState({ pendingTransfer: null, resolveConflict })
    render(<ConflictDialog />)
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    window.dispatchEvent(event)
    expect(resolveConflict).not.toHaveBeenCalled()
  })

  it('removes the Escape listener on unmount', () => {
    seedPending()
    const { unmount } = render(<ConflictDialog />)
    unmount()
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    window.dispatchEvent(event)
    expect(resolveConflict).not.toHaveBeenCalled()
  })
})
