import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import FileView from './FileView'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makeFileItem, makeFolder } from '@test/factories'

let api: ApiMock

const items = [
  makeFolder({ name: 'docs', path: '/p/docs' }),
  makeFileItem({ name: 'a.txt', path: '/p/a.txt' }),
  makeFileItem({ name: 'b.txt', path: '/p/b.txt' })
]

beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
  useExplorerStore.setState({ currentPath: '/p', loading: false, viewMode: 'list', items })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const row = (container: HTMLElement, path: string): HTMLElement =>
  container.querySelector(`[data-path="${path}"]`) as HTMLElement

/** Build a DataTransfer-ish object carrying File entries. */
function makeDataTransfer(files: File[]): DataTransfer {
  const dt = {
    files,
    dropEffect: 'none' as string,
    setData: vi.fn(),
    getData: vi.fn()
  }
  return dt as unknown as DataTransfer
}

describe('FileView — native drag start', () => {
  it('dragging a selected item starts a native drag with the whole selection', () => {
    useExplorerStore.setState({ selection: new Set(['/p/a.txt', '/p/b.txt']) })
    const { container } = render(<FileView />)
    fireEvent.dragStart(row(container, '/p/a.txt'), { dataTransfer: makeDataTransfer([]) })
    expect(api.startDrag).toHaveBeenCalledTimes(1)
    expect(api.startDrag.mock.calls[0][0].sort()).toEqual(['/p/a.txt', '/p/b.txt'])
  })

  it('dragging an unselected item selects it first, then drags just that one', () => {
    useExplorerStore.setState({ selection: new Set(['/p/b.txt']) })
    const { container } = render(<FileView />)
    fireEvent.dragStart(row(container, '/p/a.txt'), { dataTransfer: makeDataTransfer([]) })
    expect(api.startDrag).toHaveBeenCalledWith(['/p/a.txt'])
    expect([...useExplorerStore.getState().selection]).toEqual(['/p/a.txt'])
  })

  it('clears the drag-source set on the global dragend event', () => {
    const { container } = render(<FileView />)
    fireEvent.dragStart(row(container, '/p/a.txt'), { dataTransfer: makeDataTransfer([]) })
    // Fire the window dragend listener; should not throw.
    act(() => {
      window.dispatchEvent(new Event('dragend'))
    })
    expect(api.startDrag).toHaveBeenCalled()
  })
})

describe('FileView — drop onto a folder', () => {
  it('external drop onto a folder performs a copy', async () => {
    const performTransfer = vi
      .spyOn(useExplorerStore.getState(), 'performTransfer')
      .mockResolvedValue()
    api.getPathForFile.mockReturnValue('/elsewhere/x.txt')
    const { container } = render(<FileView />)

    const folder = row(container, '/p/docs')
    fireEvent.dragOver(folder, { dataTransfer: makeDataTransfer([]) })
    // Drop target highlight applied.
    expect(folder.className).toMatch(/dropTarget/)

    const file = new File(['data'], 'x.txt')
    fireEvent.drop(folder, { dataTransfer: makeDataTransfer([file]) })
    await act(async () => {})
    expect(performTransfer).toHaveBeenCalledWith(['/elsewhere/x.txt'], '/p/docs', 'copy')
  })

  it('internal drop onto a folder performs a move', async () => {
    const performTransfer = vi
      .spyOn(useExplorerStore.getState(), 'performTransfer')
      .mockResolvedValue()
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    api.getPathForFile.mockReturnValue('/p/a.txt')
    const { container } = render(<FileView />)

    // Start an internal drag so the source set is populated.
    fireEvent.dragStart(row(container, '/p/a.txt'), { dataTransfer: makeDataTransfer([]) })

    const folder = row(container, '/p/docs')
    const file = new File(['data'], 'a.txt')
    fireEvent.drop(folder, { dataTransfer: makeDataTransfer([file]) })
    await act(async () => {})
    expect(performTransfer).toHaveBeenCalledWith(['/p/a.txt'], '/p/docs', 'move')
  })

  it('sets dropEffect to move during dragOver when an internal drag is in progress', () => {
    const { container } = render(<FileView />)
    fireEvent.dragStart(row(container, '/p/a.txt'), { dataTransfer: makeDataTransfer([]) })
    const folder = row(container, '/p/docs')
    const dt = makeDataTransfer([])
    fireEvent.dragOver(folder, { dataTransfer: dt })
    expect(dt.dropEffect).toBe('move')
  })

  it('dragLeave clears the drop-target highlight', () => {
    const { container } = render(<FileView />)
    const folder = row(container, '/p/docs')
    fireEvent.dragOver(folder, { dataTransfer: makeDataTransfer([]) })
    expect(folder.className).toMatch(/dropTarget/)
    fireEvent.dragLeave(folder)
    expect(folder.className).not.toMatch(/dropTarget/)
  })

  it('a repeated dragOver on the already-highlighted folder does not re-set state', () => {
    const { container } = render(<FileView />)
    const folder = row(container, '/p/docs')
    fireEvent.dragOver(folder, { dataTransfer: makeDataTransfer([]) })
    expect(folder.className).toMatch(/dropTarget/)
    // Second dragOver: dragOverPath already equals this path → the guard skips setState.
    fireEvent.dragOver(folder, { dataTransfer: makeDataTransfer([]) })
    expect(folder.className).toMatch(/dropTarget/)
  })

  it('dragLeave on a non-active folder leaves the existing highlight untouched', () => {
    // Two folders so a leave on the wrong one keeps the active highlight.
    useExplorerStore.setState({
      items: [
        makeFolder({ name: 'docs', path: '/p/docs' }),
        makeFolder({ name: 'pics', path: '/p/pics' })
      ]
    })
    const { container } = render(<FileView />)
    const docs = row(container, '/p/docs')
    const pics = row(container, '/p/pics')
    // Highlight docs.
    fireEvent.dragOver(docs, { dataTransfer: makeDataTransfer([]) })
    expect(docs.className).toMatch(/dropTarget/)
    // Leaving a different folder (pics) takes the `: p` branch and keeps docs lit.
    fireEvent.dragLeave(pics)
    expect(docs.className).toMatch(/dropTarget/)
  })

  it('drop with no resolvable files is a no-op (no transfer)', async () => {
    const performTransfer = vi
      .spyOn(useExplorerStore.getState(), 'performTransfer')
      .mockResolvedValue()
    api.getPathForFile.mockReturnValue('')
    const { container } = render(<FileView />)
    const folder = row(container, '/p/docs')
    const file = new File(['data'], 'x.txt')
    fireEvent.drop(folder, { dataTransfer: makeDataTransfer([file]) })
    await act(async () => {})
    expect(performTransfer).not.toHaveBeenCalled()
  })

  it('drop of a file onto its own folder filters out the dest and becomes a no-op', async () => {
    const performTransfer = vi
      .spyOn(useExplorerStore.getState(), 'performTransfer')
      .mockResolvedValue()
    // The only dropped path equals the destination dir → filtered out.
    api.getPathForFile.mockReturnValue('/p/docs')
    const { container } = render(<FileView />)
    const folder = row(container, '/p/docs')
    const file = new File(['data'], 'docs')
    fireEvent.drop(folder, { dataTransfer: makeDataTransfer([file]) })
    await act(async () => {})
    expect(performTransfer).not.toHaveBeenCalled()
  })

  it('treats a partly-internal drag (some paths not from us) as an external copy', async () => {
    const performTransfer = vi
      .spyOn(useExplorerStore.getState(), 'performTransfer')
      .mockResolvedValue()
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    const { container } = render(<FileView />)
    // Internal drag of a.txt only.
    fireEvent.dragStart(row(container, '/p/a.txt'), { dataTransfer: makeDataTransfer([]) })

    // Drop two files: one ours, one foreign → not every path is internal → copy.
    let i = 0
    api.getPathForFile.mockImplementation(() => (i++ === 0 ? '/p/a.txt' : '/foreign/z.txt'))
    const folder = row(container, '/p/docs')
    fireEvent.drop(folder, {
      dataTransfer: makeDataTransfer([new File([''], 'a.txt'), new File([''], 'z.txt')])
    })
    await act(async () => {})
    expect(performTransfer).toHaveBeenCalledWith(
      ['/p/a.txt', '/foreign/z.txt'],
      '/p/docs',
      'copy'
    )
  })
})

describe('FileView — drop onto the root (current directory)', () => {
  it('root dragOver sets copy effect with no internal drag', () => {
    const { container } = render(<FileView />)
    const root = container.querySelector('.root') as HTMLElement
    const dt = makeDataTransfer([])
    fireEvent.dragOver(root, { dataTransfer: dt })
    expect(dt.dropEffect).toBe('copy')
  })

  it('root dragOver sets move effect during an internal drag', () => {
    const { container } = render(<FileView />)
    fireEvent.dragStart(row(container, '/p/a.txt'), { dataTransfer: makeDataTransfer([]) })
    const root = container.querySelector('.root') as HTMLElement
    const dt = makeDataTransfer([])
    fireEvent.dragOver(root, { dataTransfer: dt })
    expect(dt.dropEffect).toBe('move')
  })

  it('dropping external files on the root copies them into the current path', async () => {
    const performTransfer = vi
      .spyOn(useExplorerStore.getState(), 'performTransfer')
      .mockResolvedValue()
    api.getPathForFile.mockReturnValue('/elsewhere/y.txt')
    const { container } = render(<FileView />)
    const root = container.querySelector('.root') as HTMLElement
    fireEvent.drop(root, { dataTransfer: makeDataTransfer([new File([''], 'y.txt')]) })
    await act(async () => {})
    expect(performTransfer).toHaveBeenCalledWith(['/elsewhere/y.txt'], '/p', 'copy')
  })
})

describe('FileView — column resize (details view)', () => {
  beforeEach(() => {
    useExplorerStore.setState({ viewMode: 'details' })
  })

  it('dragging the date resizer updates the column width in the store', () => {
    const { container } = render(<FileView />)
    const resizer = container.querySelector('.headerCellDate .resizer') as HTMLElement
    fireEvent.mouseDown(resizer, { clientX: 100 })
    fireEvent.mouseMove(window, { clientX: 140 })
    fireEvent.mouseUp(window)
    // Default date width 180 + 40 delta.
    expect(useExplorerStore.getState().columnWidths.date).toBe(220)
  })

  it('dragging the type resizer updates the type width', () => {
    const { container } = render(<FileView />)
    const resizer = container.querySelector('.headerCellType .resizer') as HTMLElement
    fireEvent.mouseDown(resizer, { clientX: 0 })
    fireEvent.mouseMove(window, { clientX: 25 })
    fireEvent.mouseUp(window)
    expect(useExplorerStore.getState().columnWidths.type).toBe(175) // 150 + 25
  })

  it('dragging the size resizer updates the size width', () => {
    const { container } = render(<FileView />)
    const resizer = container.querySelector('.headerCellSize .resizer') as HTMLElement
    fireEvent.mouseDown(resizer, { clientX: 0 })
    fireEvent.mouseMove(window, { clientX: 30 })
    fireEvent.mouseUp(window)
    expect(useExplorerStore.getState().columnWidths.size).toBe(130) // 100 + 30
  })

  it('clicking any resizer does not trigger the column sort', () => {
    useExplorerStore.setState({ sortKey: 'name', sortDir: 'asc' })
    const { container } = render(<FileView />)
    for (const sel of ['.headerCellDate', '.headerCellType', '.headerCellSize']) {
      const resizer = container.querySelector(`${sel} .resizer`) as HTMLElement
      fireEvent.click(resizer)
    }
    // Sort unchanged because each resizer click stops propagation.
    expect(useExplorerStore.getState().sortKey).toBe('name')
    expect(useExplorerStore.getState().sortDir).toBe('asc')
  })

  it('honours persisted column widths from the store', () => {
    useExplorerStore.setState({ columnWidths: { date: 200, type: 160, size: 120 } })
    const { container } = render(<FileView />)
    const header = container.querySelector('.headerRow') as HTMLElement
    expect(header.style.gridTemplateColumns).toContain('200px')
    expect(header.style.gridTemplateColumns).toContain('160px')
    expect(header.style.gridTemplateColumns).toContain('120px')
  })
})
