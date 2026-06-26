import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PropertiesDialog from './PropertiesDialog'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makePropertyInfo, makeFolderSize } from '@test/factories'

let api: ApiMock

beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
})

describe('PropertiesDialog', () => {
  it('renders nothing when propertiesPath is null', () => {
    useExplorerStore.setState({ propertiesPath: null })
    const { container } = render(<PropertiesDialog />)
    expect(container.firstChild).toBeNull()
    expect(api.getProperties).not.toHaveBeenCalled()
  })

  it('shows loading then file properties on success', async () => {
    api.getProperties.mockResolvedValue({
      ok: true,
      data: makePropertyInfo({ name: 'doc.txt', size: 2048, typeLabel: 'TXT File' })
    })
    useExplorerStore.setState({ propertiesPath: '/Users/test/doc.txt' })
    render(<PropertiesDialog />)

    // Loading state (info still null) before the promise resolves.
    expect(screen.getByText('Loading…')).toBeInTheDocument()

    await screen.findByText('doc.txt')
    expect(api.getProperties).toHaveBeenCalledWith('/Users/test/doc.txt')
    expect(api.getFolderSize).not.toHaveBeenCalled()
    // File size shows formatted bytes + raw byte count.
    expect(screen.getByText(/2,048 bytes/)).toBeInTheDocument()
    expect(screen.getByText('TXT File')).toBeInTheDocument()
  })

  it('fetches and shows folder size (complete) for a directory', async () => {
    api.getProperties.mockResolvedValue({
      ok: true,
      data: makePropertyInfo({ name: 'docs', isDirectory: true, kind: 'folder', size: 0 })
    })
    api.getFolderSize.mockResolvedValue({
      ok: true,
      data: makeFolderSize({ size: 4096, files: 5, folders: 2, complete: true })
    })
    useExplorerStore.setState({ propertiesPath: '/Users/test/docs' })
    render(<PropertiesDialog />)

    await screen.findByText('docs')
    expect(api.getFolderSize).toHaveBeenCalledWith('/Users/test/docs')
    await waitFor(() =>
      expect(screen.getByText(/5 files, 2 folders/)).toBeInTheDocument()
    )
    // complete → no ≥ prefix
    expect(screen.queryByText(/≥/)).not.toBeInTheDocument()
  })

  it('shows a ≥ prefix when the folder size is incomplete', async () => {
    api.getProperties.mockResolvedValue({
      ok: true,
      data: makePropertyInfo({ name: 'big', isDirectory: true, kind: 'folder', size: 0 })
    })
    api.getFolderSize.mockResolvedValue({
      ok: true,
      data: makeFolderSize({ complete: false })
    })
    useExplorerStore.setState({ propertiesPath: '/Users/test/big' })
    render(<PropertiesDialog />)

    await screen.findByText('big')
    await waitFor(() => expect(screen.getByText(/≥/)).toBeInTheDocument())
  })

  it('shows "Unavailable" when getFolderSize fails', async () => {
    api.getProperties.mockResolvedValue({
      ok: true,
      data: makePropertyInfo({ name: 'docs', isDirectory: true, kind: 'folder', size: 0 })
    })
    api.getFolderSize.mockResolvedValue({ ok: false, error: 'nope' })
    useExplorerStore.setState({ propertiesPath: '/Users/test/docs' })
    render(<PropertiesDialog />)

    await screen.findByText('docs')
    await waitFor(() => expect(screen.getByText('Unavailable')).toBeInTheDocument())
  })

  it('shows the symlink target when present', async () => {
    api.getProperties.mockResolvedValue({
      ok: true,
      data: makePropertyInfo({
        name: 'link',
        isSymbolicLink: true,
        symlinkTarget: '/Users/test/real.txt'
      })
    })
    useExplorerStore.setState({ propertiesPath: '/Users/test/link' })
    render(<PropertiesDialog />)

    await screen.findByText('link')
    expect(screen.getByText('Target')).toBeInTheDocument()
    expect(screen.getByText('/Users/test/real.txt')).toBeInTheDocument()
  })

  it('stays in the loading state when getProperties fails (not ok)', async () => {
    api.getProperties.mockResolvedValue({ ok: false, error: 'EACCES' })
    useExplorerStore.setState({ propertiesPath: '/Users/test/x' })
    render(<PropertiesDialog />)

    // Give the rejected/failed promise a chance to settle.
    await Promise.resolve()
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
    // Header falls back to the placeholder name.
    expect(screen.getByText('…')).toBeInTheDocument()
    // Dialog aria-label falls back to plain 'Properties'.
    expect(screen.getByRole('dialog', { name: 'Properties' })).toBeInTheDocument()
  })

  it('closes via the OK button', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ propertiesPath: '/Users/test/file.txt' })
    render(<PropertiesDialog />)
    await screen.findByText('file.txt')
    await user.click(screen.getByRole('button', { name: 'OK' }))
    expect(useExplorerStore.getState().propertiesPath).toBeNull()
  })

  it('closes when clicking the backdrop but not the card', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ propertiesPath: '/Users/test/file.txt' })
    render(<PropertiesDialog />)
    await screen.findByText('file.txt')

    // Clicking the card (dialog) should NOT close.
    await user.click(screen.getByRole('dialog'))
    expect(useExplorerStore.getState().propertiesPath).toBe('/Users/test/file.txt')

    // mousedown on the backdrop itself closes.
    const backdrop = screen.getByRole('presentation')
    await user.click(backdrop)
    expect(useExplorerStore.getState().propertiesPath).toBeNull()
  })

  it('closes on Escape and ignores other keys', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ propertiesPath: '/Users/test/file.txt' })
    render(<PropertiesDialog />)
    await screen.findByText('file.txt')

    await user.keyboard('{Enter}')
    expect(useExplorerStore.getState().propertiesPath).toBe('/Users/test/file.txt')

    await user.keyboard('{Escape}')
    expect(useExplorerStore.getState().propertiesPath).toBeNull()
  })

  it('ignores a resolved getFolderSize after the target is cleared (cancelled)', async () => {
    api.getProperties.mockResolvedValue({
      ok: true,
      data: makePropertyInfo({ name: 'docs', isDirectory: true, kind: 'folder', size: 0 })
    })
    let resolveSize!: (v: { ok: boolean; data: ReturnType<typeof makeFolderSize> }) => void
    api.getFolderSize.mockReturnValue(
      new Promise((resolve) => {
        resolveSize = resolve
      })
    )
    useExplorerStore.setState({ propertiesPath: '/Users/test/docs' })
    const { rerender } = render(<PropertiesDialog />)
    await screen.findByText('docs')
    expect(screen.getByText('Calculating…')).toBeInTheDocument()

    // Clear target while folder-size fetch is in flight.
    useExplorerStore.setState({ propertiesPath: null })
    rerender(<PropertiesDialog />)

    resolveSize({ ok: true, data: makeFolderSize({ files: 99 }) })
    await Promise.resolve()
    expect(screen.queryByText(/99 files/)).not.toBeInTheDocument()
  })

  it('ignores a resolved getProperties after the target is cleared (cancelled)', async () => {
    let resolveProps!: (v: { ok: boolean; data: ReturnType<typeof makePropertyInfo> }) => void
    api.getProperties.mockReturnValue(
      new Promise((resolve) => {
        resolveProps = resolve
      })
    )
    useExplorerStore.setState({ propertiesPath: '/Users/test/file.txt' })
    const { rerender } = render(<PropertiesDialog />)

    // Clear the target before the in-flight fetch resolves → unmount-ish path.
    useExplorerStore.setState({ propertiesPath: null })
    rerender(<PropertiesDialog />)

    resolveProps({ ok: true, data: makePropertyInfo({ name: 'late' }) })
    await Promise.resolve()
    // Dialog is closed; the late resolution must not surface.
    expect(screen.queryByText('late')).not.toBeInTheDocument()
  })
})
