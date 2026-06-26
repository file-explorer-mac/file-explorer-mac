import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PreviewPane from './PreviewPane'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makeFileItem, makeFolder } from '@test/factories'

let api: ApiMock

beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
})

describe('PreviewPane', () => {
  it('renders nothing when the preview pane is closed', () => {
    useExplorerStore.setState({ previewOpen: false })
    const { container } = render(<PreviewPane />)
    expect(container.firstChild).toBeNull()
  })

  it('shows "No file selected" when nothing is selected', () => {
    useExplorerStore.setState({ previewOpen: true, items: [], selection: new Set() })
    render(<PreviewPane />)
    expect(screen.getByText('No file selected')).toBeInTheDocument()
  })

  it('shows a count when multiple items are selected', () => {
    const a = makeFileItem({ name: 'a.txt', path: '/p/a.txt' })
    const b = makeFileItem({ name: 'b.txt', path: '/p/b.txt' })
    useExplorerStore.setState({
      previewOpen: true,
      items: [a, b],
      selection: new Set(['/p/a.txt', '/p/b.txt'])
    })
    render(<PreviewPane />)
    expect(screen.getByText('2 items selected')).toBeInTheDocument()
  })

  it('closes the pane via the close button', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ previewOpen: true })
    render(<PreviewPane />)
    await user.click(screen.getByRole('button', { name: 'Close preview pane' }))
    expect(useExplorerStore.getState().previewOpen).toBe(false)
  })

  it('shows details and a text preview for a selected text file', async () => {
    api.readTextPreview.mockResolvedValue({ ok: true, data: 'hello world' })
    const file = makeFileItem({
      name: 'notes.txt',
      path: '/p/notes.txt',
      kind: 'text',
      ext: 'txt',
      size: 2048
    })
    useExplorerStore.setState({
      previewOpen: true,
      items: [file],
      selection: new Set(['/p/notes.txt'])
    })
    render(<PreviewPane />)

    expect(screen.getByText('notes.txt')).toBeInTheDocument()
    expect(screen.getByText('TXT File')).toBeInTheDocument()
    expect(screen.getByText('2 KB')).toBeInTheDocument()
    expect(await screen.findByText('hello world')).toBeInTheDocument()
    expect(api.readTextPreview).toHaveBeenCalledWith('/p/notes.txt')
  })

  it('reads a preview for code-kind files too', async () => {
    api.readTextPreview.mockResolvedValue({ ok: true, data: 'const x = 1' })
    const file = makeFileItem({
      name: 'app.ts',
      path: '/p/app.ts',
      kind: 'code',
      ext: 'ts'
    })
    useExplorerStore.setState({
      previewOpen: true,
      items: [file],
      selection: new Set(['/p/app.ts'])
    })
    render(<PreviewPane />)
    expect(await screen.findByText('const x = 1')).toBeInTheDocument()
  })

  it('does not render a text preview when the read fails', async () => {
    api.readTextPreview.mockResolvedValue({ ok: false, error: 'nope' })
    const file = makeFileItem({ name: 'bad.txt', path: '/p/bad.txt', kind: 'text' })
    useExplorerStore.setState({
      previewOpen: true,
      items: [file],
      selection: new Set(['/p/bad.txt'])
    })
    const { container } = render(<PreviewPane />)
    await waitFor(() => expect(api.readTextPreview).toHaveBeenCalled())
    expect(container.querySelector('pre')).toBeNull()
  })

  it('does not render a text preview when data is undefined', async () => {
    api.readTextPreview.mockResolvedValue({ ok: true, data: undefined })
    const file = makeFileItem({ name: 'empty.txt', path: '/p/empty.txt', kind: 'text' })
    useExplorerStore.setState({
      previewOpen: true,
      items: [file],
      selection: new Set(['/p/empty.txt'])
    })
    const { container } = render(<PreviewPane />)
    await waitFor(() => expect(api.readTextPreview).toHaveBeenCalled())
    expect(container.querySelector('pre')).toBeNull()
  })

  it('shows "—" for size and no text preview for a selected directory', () => {
    const dir = makeFolder({ name: 'docs', path: '/p/docs' })
    useExplorerStore.setState({
      previewOpen: true,
      items: [dir],
      selection: new Set(['/p/docs'])
    })
    const { container } = render(<PreviewPane />)
    expect(screen.getByText('docs')).toBeInTheDocument()
    expect(screen.getByText('File folder')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(api.readTextPreview).not.toHaveBeenCalled()
    expect(container.querySelector('pre')).toBeNull()
  })

  it('shows details for a non-text file without reading a preview', () => {
    const img = makeFileItem({
      name: 'pic.png',
      path: '/p/pic.png',
      kind: 'image',
      ext: 'png'
    })
    useExplorerStore.setState({
      previewOpen: true,
      items: [img],
      selection: new Set(['/p/pic.png'])
    })
    render(<PreviewPane />)
    expect(screen.getByText('pic.png')).toBeInTheDocument()
    expect(screen.getByText('PNG Image')).toBeInTheDocument()
    expect(api.readTextPreview).not.toHaveBeenCalled()
  })

  it('ignores a stale preview result when the file changes before it resolves', async () => {
    let resolveFirst: (v: { ok: boolean; data?: string }) => void = () => {}
    api.readTextPreview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        })
    )
    const first = makeFileItem({ name: 'one.txt', path: '/p/one.txt', kind: 'text' })
    const second = makeFileItem({ name: 'two.txt', path: '/p/two.txt', kind: 'text' })
    useExplorerStore.setState({
      previewOpen: true,
      items: [first, second],
      selection: new Set(['/p/one.txt'])
    })
    const { rerender } = render(<PreviewPane />)

    // Switch selection before the first read resolves -> first effect's cleanup
    // sets alive=false, so the late result is ignored.
    api.readTextPreview.mockResolvedValue({ ok: true, data: 'second content' })
    useExplorerStore.setState({ selection: new Set(['/p/two.txt']) })
    rerender(<PreviewPane />)

    resolveFirst({ ok: true, data: 'first content' })

    expect(await screen.findByText('second content')).toBeInTheDocument()
    expect(screen.queryByText('first content')).not.toBeInTheDocument()
  })
})
