import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProgressOverlay from './ProgressOverlay'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import type { OpProgress } from '@shared/types'

beforeEach(() => {
  resetExplorerStore()
})

describe('ProgressOverlay', () => {
  it('renders nothing when there is no operation', () => {
    useExplorerStore.setState({ operation: null })
    const { container } = render(<ProgressOverlay />)
    expect(container.firstChild).toBeNull()
  })

  it('suppresses trivial single-item ops without a phrase label', () => {
    const op: OpProgress = { op: 'copy', done: 0, total: 1, name: 'file.txt' }
    useExplorerStore.setState({ operation: op })
    const { container } = render(<ProgressOverlay />)
    expect(container.firstChild).toBeNull()
  })

  it('also suppresses zero-total ops without a phrase label', () => {
    const op: OpProgress = { op: 'move', done: 0, total: 0, name: 'file.txt' }
    useExplorerStore.setState({ operation: op })
    const { container } = render(<ProgressOverlay />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a determinate copy operation with percent, name and count', () => {
    const op: OpProgress = { op: 'copy', done: 1, total: 4, name: 'photo.png' }
    useExplorerStore.setState({ operation: op })
    const { container } = render(<ProgressOverlay />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Copying items')).toBeInTheDocument()
    expect(screen.getByText('photo.png')).toBeInTheDocument()
    // 1 of 4 = 25%
    const fill = container.querySelector('[style]') as HTMLElement
    expect(fill.style.width).toBe('25%')
    expect(screen.getByText('1 of 4')).toBeInTheDocument()
  })

  it('uses the "Moving items" title for move operations', () => {
    const op: OpProgress = { op: 'move', done: 2, total: 5, name: 'doc.pdf' }
    useExplorerStore.setState({ operation: op })
    render(<ProgressOverlay />)
    expect(screen.getByText('Moving items')).toBeInTheDocument()
    expect(screen.getByText('doc.pdf')).toBeInTheDocument()
    expect(screen.getByText('2 of 5')).toBeInTheDocument()
  })

  it('uses the phrase as the title and shows no current name', () => {
    // total > 1 keeps it determinate, but a phrase name overrides the title.
    const op: OpProgress = { op: 'copy', done: 0, total: 3, name: 'Extracting…' }
    useExplorerStore.setState({ operation: op })
    render(<ProgressOverlay />)
    expect(screen.getByText('Extracting…')).toBeInTheDocument()
    // Phrase ops never render a separate itemName line.
    expect(screen.queryByText('photo.png')).not.toBeInTheDocument()
    expect(screen.getByText('0 of 3')).toBeInTheDocument()
  })

  it('renders an indeterminate phrase op when total <= 1 (no count, no fill width)', () => {
    const op: OpProgress = { op: 'copy', done: 0, total: 1, name: 'Compressing…' }
    useExplorerStore.setState({ operation: op })
    const { container } = render(<ProgressOverlay />)
    expect(screen.getByText('Compressing…')).toBeInTheDocument()
    // Indeterminate: no "N of M" count is rendered.
    expect(screen.queryByText(/ of /)).not.toBeInTheDocument()
    // The indeterminate fill carries no inline width style.
    expect(container.querySelector('[style]')).toBeNull()
  })

  it('renders no current-name line when the name is an empty string', () => {
    const op: OpProgress = { op: 'copy', done: 1, total: 2, name: '' }
    useExplorerStore.setState({ operation: op })
    const { container } = render(<ProgressOverlay />)
    expect(screen.getByText('Copying items')).toBeInTheDocument()
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    // No itemName div for an empty name (currentName is null).
    const card = container.querySelector('[role="status"]')!
    const title = card.firstChild as HTMLElement
    // The element immediately after the title should be the track, not an item name.
    expect(title.nextElementSibling?.querySelector('[style]')).not.toBeNull()
  })
})
