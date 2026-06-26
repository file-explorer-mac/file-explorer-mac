import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FileView from './FileView'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makeFileItem, makeFolder } from '@test/factories'

let api: ApiMock

beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
  useExplorerStore.setState({ currentPath: '/p' })
})

describe('FileView — loading / error / empty states', () => {
  it('renders the skeleton once a slow load crosses the 100ms threshold', () => {
    vi.useFakeTimers()
    try {
      useExplorerStore.setState({ loading: true, items: [] })
      const { container } = render(<FileView />)
      // Not shown immediately.
      expect(container.querySelector('[aria-busy="true"]')).toBeNull()
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('hides the skeleton again when loading flips off', () => {
    vi.useFakeTimers()
    try {
      useExplorerStore.setState({ loading: true, items: [] })
      const { container } = render(<FileView />)
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
      act(() => {
        useExplorerStore.setState({ loading: false })
      })
      expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the empty-folder message when not loading and nothing is visible', () => {
    useExplorerStore.setState({ loading: false, items: [] })
    render(<FileView />)
    expect(screen.getByText('This folder is empty')).toBeInTheDocument()
  })

  it('shows a plain error message for a non-permission error', () => {
    useExplorerStore.setState({ error: 'Something broke', errorCode: 'ENOENT' })
    render(<FileView />)
    expect(screen.getByText('Something broke')).toBeInTheDocument()
  })

  it('shows the Full Disk Access panel for an EPERM error and wires both buttons', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ error: 'denied', errorCode: 'EPERM' })
    render(<FileView />)
    expect(screen.getByText('This location requires permission')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open Privacy Settings' }))
    expect(api.openFullDiskAccessSettings).toHaveBeenCalledTimes(1)

    const refreshSpy = vi.spyOn(useExplorerStore.getState(), 'refresh')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refreshSpy).toHaveBeenCalledTimes(1)
  })

  it('treats EACCES as a permission error', () => {
    useExplorerStore.setState({ error: 'no access', errorCode: 'EACCES' })
    render(<FileView />)
    expect(screen.getByText('This location requires permission')).toBeInTheDocument()
  })

  it('treats a "permission denied" message (no errorCode) as a permission error', () => {
    useExplorerStore.setState({ error: 'operation not permitted', errorCode: null })
    render(<FileView />)
    expect(screen.getByText('This location requires permission')).toBeInTheDocument()
  })
})

describe('FileView — view modes', () => {
  const seed = (extra: Record<string, unknown> = {}): void => {
    useExplorerStore.setState({
      loading: false,
      items: [
        makeFolder({ name: 'docs', path: '/p/docs' }),
        makeFileItem({ name: 'a.txt', path: '/p/a.txt', size: 2048 })
      ],
      ...extra
    })
  }

  it('renders the details view with headers and rows', () => {
    seed({ viewMode: 'details' })
    const { container } = render(<FileView />)
    expect(screen.getByRole('button', { name: /Name/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Date modified/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Type/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Size/ })).toBeInTheDocument()
    expect(container.querySelectorAll('.detailRow').length).toBe(2)
    // Directory row leaves the size cell blank; the file shows its formatted size.
    expect(container.querySelector('[data-path="/p/a.txt"] .detailSize')!.textContent).toMatch(
      /KB/
    )
    expect(container.querySelector('[data-path="/p/docs"] .detailSize')!.textContent).toBe('')
  })

  it('renders the sort caret on the active column and toggles direction on header click', async () => {
    const user = userEvent.setup()
    seed({ viewMode: 'details', sortKey: 'name', sortDir: 'asc' })
    const { container } = render(<FileView />)
    // Caret present on the active (name) column.
    expect(container.querySelector('.headerRow .caret')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: /Name/ }))
    expect(useExplorerStore.getState().sortDir).toBe('desc')

    await user.click(screen.getByRole('button', { name: /Date modified/ }))
    expect(useExplorerStore.getState().sortKey).toBe('modified')

    await user.click(screen.getByRole('button', { name: /Type/ }))
    expect(useExplorerStore.getState().sortKey).toBe('type')

    await user.click(screen.getByRole('button', { name: /Size/ }))
    expect(useExplorerStore.getState().sortKey).toBe('size')
  })

  it('renders the list view (default non-details)', () => {
    seed({ viewMode: 'list' })
    const { container } = render(<FileView />)
    expect(container.querySelector('.list')).not.toBeNull()
    expect(container.querySelectorAll('.listEntry').length).toBe(2)
  })

  it('renders the small list view', () => {
    seed({ viewMode: 'small' })
    const { container } = render(<FileView />)
    expect(container.querySelector('.listSmall')).not.toBeNull()
  })

  it('renders the tiles view with kind + size meta', () => {
    seed({ viewMode: 'tiles' })
    const { container } = render(<FileView />)
    expect(container.querySelector('.tiles')).not.toBeNull()
    expect(container.querySelectorAll('.tile').length).toBe(2)
    // File tile includes a size; folder tile does not.
    expect(container.querySelector('[data-path="/p/a.txt"] .tileMeta')!.textContent).toMatch(/KB/)
    expect(container.querySelector('[data-path="/p/docs"] .tileMeta')!.textContent).not.toMatch(
      /KB/
    )
  })

  it('renders the medium icon grid', () => {
    seed({ viewMode: 'medium' })
    const { container } = render(<FileView />)
    expect(container.querySelector('.gridMd')).not.toBeNull()
    expect(container.querySelectorAll('.gridTile').length).toBe(2)
  })

  it('renders the large icon grid', () => {
    seed({ viewMode: 'large' })
    const { container } = render(<FileView />)
    expect(container.querySelector('.gridLg')).not.toBeNull()
  })

  it('renders the extra-large icon grid', () => {
    seed({ viewMode: 'extra-large' })
    const { container } = render(<FileView />)
    expect(container.querySelector('.gridXl')).not.toBeNull()
  })
})

describe('FileView — grouping headers', () => {
  it('renders group headers with counts when groupBy is active', () => {
    useExplorerStore.setState({
      loading: false,
      viewMode: 'list',
      groupBy: 'type',
      items: [
        makeFolder({ name: 'docs', path: '/p/docs' }),
        makeFileItem({ name: 'a.txt', path: '/p/a.txt' })
      ]
    })
    const { container } = render(<FileView />)
    const headers = container.querySelectorAll('.groupHeader')
    expect(headers.length).toBe(2)
    expect(screen.getByText('Folders')).toBeInTheDocument()
    // The (count) badge.
    expect(container.querySelector('.groupCount')!.textContent).toBe('(1)')
  })

  it('renders group headers in the details view too', () => {
    useExplorerStore.setState({
      loading: false,
      viewMode: 'details',
      groupBy: 'type',
      items: [makeFileItem({ name: 'a.txt', path: '/p/a.txt' })]
    })
    const { container } = render(<FileView />)
    expect(container.querySelector('.groupHeader')).not.toBeNull()
  })

  it('omits group headers when groupBy is none', () => {
    useExplorerStore.setState({
      loading: false,
      viewMode: 'list',
      groupBy: 'none',
      items: [makeFileItem({ name: 'a.txt', path: '/p/a.txt' })]
    })
    const { container } = render(<FileView />)
    expect(container.querySelector('.groupHeader')).toBeNull()
  })
})

describe('FileView — cut clipboard styling', () => {
  it('marks cut items with the cut class', () => {
    useExplorerStore.setState({
      loading: false,
      viewMode: 'list',
      items: [makeFileItem({ name: 'a.txt', path: '/p/a.txt' })],
      clipboard: { mode: 'cut', paths: ['/p/a.txt'] }
    })
    const { container } = render(<FileView />)
    expect(container.querySelector('[data-path="/p/a.txt"]')!.className).toMatch(/cut/)
  })

  it('does not mark items cut when the clipboard mode is copy', () => {
    useExplorerStore.setState({
      loading: false,
      viewMode: 'list',
      items: [makeFileItem({ name: 'a.txt', path: '/p/a.txt' })],
      clipboard: { mode: 'copy', paths: ['/p/a.txt'] }
    })
    const { container } = render(<FileView />)
    expect(container.querySelector('[data-path="/p/a.txt"]')!.className).not.toMatch(/cut/)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
