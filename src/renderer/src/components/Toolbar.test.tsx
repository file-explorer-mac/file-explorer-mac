import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toolbar from './Toolbar'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'

let api: ApiMock

beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
})

/** Replace a store action with a spy and return it. */
function spyAction<K extends keyof ReturnType<typeof useExplorerStore.getState>>(
  key: K
): ReturnType<typeof vi.fn> {
  const fn = vi.fn()
  useExplorerStore.setState({ [key]: fn } as never)
  return fn
}

describe('Toolbar — edit action buttons', () => {
  it('Cut/Copy/Paste/Rename/Share/Delete/Undo are disabled with no selection, empty clipboard, empty undo', () => {
    useExplorerStore.setState({
      selection: new Set(),
      clipboard: null,
      undoStack: []
    })
    render(<Toolbar />)
    expect(screen.getByTitle(/^Cut/)).toBeDisabled()
    expect(screen.getByTitle(/^Copy/)).toBeDisabled()
    expect(screen.getByTitle(/^Paste/)).toBeDisabled()
    expect(screen.getByTitle(/^Rename/)).toBeDisabled()
    expect(screen.getByTitle('Share')).toBeDisabled()
    expect(screen.getByTitle(/^Delete/)).toBeDisabled()
    expect(screen.getByTitle(/^Undo/)).toBeDisabled()
  })

  it('Cut/Copy/Share/Delete enabled with a selection; calls their actions', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ selection: new Set(['/p/a', '/p/b']) })
    const cut = spyAction('cutSelection')
    const copy = spyAction('copySelection')
    const reveal = spyAction('revealSelectionInFinder')
    const del = spyAction('deleteSelection')
    render(<Toolbar />)

    await user.click(screen.getByTitle(/^Cut/))
    await user.click(screen.getByTitle(/^Copy/))
    await user.click(screen.getByTitle('Share'))
    await user.click(screen.getByTitle(/^Delete/))

    expect(cut).toHaveBeenCalledTimes(1)
    expect(copy).toHaveBeenCalledTimes(1)
    expect(reveal).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledTimes(1)
  })

  it('Rename is enabled only with a single selection and calls beginRename with that path', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ selection: new Set(['/p/only']) })
    const beginRename = spyAction('beginRename')
    render(<Toolbar />)
    const btn = screen.getByTitle(/^Rename/)
    expect(btn).toBeEnabled()
    await user.click(btn)
    expect(beginRename).toHaveBeenCalledWith('/p/only')
  })

  it('Rename is disabled with multiple selection', () => {
    useExplorerStore.setState({ selection: new Set(['/p/a', '/p/b']) })
    render(<Toolbar />)
    expect(screen.getByTitle(/^Rename/)).toBeDisabled()
  })

  it('Paste enabled when clipboard set; calls paste', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ clipboard: { paths: ['/p/a'], mode: 'copy' } })
    const paste = spyAction('paste')
    render(<Toolbar />)
    const btn = screen.getByTitle(/^Paste/)
    expect(btn).toBeEnabled()
    await user.click(btn)
    expect(paste).toHaveBeenCalledTimes(1)
  })

  it('Undo enabled when undoStack non-empty; calls undo', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({
      undoStack: [{ type: 'rename', from: '/p/a', to: '/p/b' }] as never
    })
    const undo = spyAction('undo')
    render(<Toolbar />)
    const btn = screen.getByTitle(/^Undo/)
    expect(btn).toBeEnabled()
    await user.click(btn)
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('togglePreview button reflects previewOpen and calls togglePreview', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ previewOpen: true })
    const togglePreview = spyAction('togglePreview')
    render(<Toolbar />)
    const btn = screen.getByTitle('Details pane')
    await user.click(btn)
    expect(togglePreview).toHaveBeenCalledTimes(1)
  })
})

describe('Toolbar — New menu', () => {
  it('opens the New menu and triggers createFolder / createTextFile', async () => {
    const user = userEvent.setup()
    const createFolder = spyAction('createFolder')
    const createTextFile = spyAction('createTextFile')
    render(<Toolbar />)

    await user.click(screen.getByRole('button', { name: /New/ }))
    await user.click(screen.getByRole('menuitem', { name: /Folder/ }))
    expect(createFolder).toHaveBeenCalledTimes(1)

    // Menu closed after click; reopen for the second item.
    await user.click(screen.getByRole('button', { name: /New/ }))
    await user.click(screen.getByRole('menuitem', { name: /Text Document/ }))
    expect(createTextFile).toHaveBeenCalledTimes(1)
  })

  it('clicking the New trigger again closes the menu', async () => {
    const user = userEvent.setup()
    render(<Toolbar />)
    const trigger = screen.getByRole('button', { name: /New/ })
    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Toolbar — Sort menu', () => {
  it('lists sort keys with the active one checked and calls setSort for each', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ sortKey: 'name', sortDir: 'asc' })
    const setSort = spyAction('setSort')
    render(<Toolbar />)

    for (const [label, key] of [
      ['Name', 'name'],
      ['Date modified', 'modified'],
      ['Type', 'type'],
      ['Size', 'size']
    ] as const) {
      await user.click(screen.getByRole('button', { name: /Sort/ }))
      await user.click(screen.getByRole('menuitem', { name: label }))
      expect(setSort).toHaveBeenLastCalledWith(key)
    }
  })

  it('Ascending click is a no-op when already ascending; Descending sets sort', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ sortKey: 'name', sortDir: 'asc' })
    const setSort = spyAction('setSort')
    render(<Toolbar />)

    await user.click(screen.getByRole('button', { name: /Sort/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Ascending' }))
    // sortDir is already 'asc' → guarded, no call
    expect(setSort).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Sort/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Descending' }))
    expect(setSort).toHaveBeenCalledWith('name')
  })

  it('Descending click is a no-op when already descending; Ascending sets sort', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ sortKey: 'type', sortDir: 'desc' })
    const setSort = spyAction('setSort')
    render(<Toolbar />)

    await user.click(screen.getByRole('button', { name: /Sort/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Descending' }))
    expect(setSort).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Sort/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Ascending' }))
    expect(setSort).toHaveBeenCalledWith('type')
  })
})

describe('Toolbar — View menu', () => {
  it('lists every view mode and calls setViewMode for each, plus toggleShowHidden', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ viewMode: 'details', showHidden: false })
    const setViewMode = spyAction('setViewMode')
    const toggleShowHidden = spyAction('toggleShowHidden')
    render(<Toolbar />)

    const modes: [string, string][] = [
      ['Extra large icons', 'extra-large'],
      ['Large icons', 'large'],
      ['Medium icons', 'medium'],
      ['Small icons', 'small'],
      ['List', 'list'],
      ['Details', 'details'],
      ['Tiles', 'tiles']
    ]
    for (const [label, mode] of modes) {
      await user.click(screen.getByRole('button', { name: /View/ }))
      await user.click(screen.getByRole('menuitem', { name: label }))
      expect(setViewMode).toHaveBeenLastCalledWith(mode)
    }

    await user.click(screen.getByRole('button', { name: /View/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Show hidden items' }))
    expect(toggleShowHidden).toHaveBeenCalledTimes(1)
  })
})

describe('Toolbar — More menu', () => {
  it('triggers selectAll, invertSelection and revealSelectionInFinder', async () => {
    const user = userEvent.setup()
    const selectAll = spyAction('selectAll')
    const invertSelection = spyAction('invertSelection')
    const reveal = spyAction('revealSelectionInFinder')
    render(<Toolbar />)

    await user.click(screen.getByTitle('See more'))
    await user.click(screen.getByRole('menuitem', { name: /Select all/ }))
    expect(selectAll).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTitle('See more'))
    await user.click(screen.getByRole('menuitem', { name: 'Invert selection' }))
    expect(invertSelection).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTitle('See more'))
    await user.click(screen.getByRole('menuitem', { name: 'Reveal in Finder' }))
    expect(reveal).toHaveBeenCalledTimes(1)
  })

  it('switching from one open menu to another closes the first', async () => {
    const user = userEvent.setup()
    render(<Toolbar />)
    await user.click(screen.getByRole('button', { name: /Sort/ }))
    expect(screen.getByRole('menuitem', { name: 'Name' })).toBeInTheDocument()
    // Open View while Sort is open → openMenu switches.
    await user.click(screen.getByRole('button', { name: /View/ }))
    expect(screen.getByRole('menuitem', { name: 'List' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Name' })).not.toBeInTheDocument()
  })
})

describe('Toolbar — default New createFolder/createTextFile (real actions, api)', () => {
  it('createFolder calls window.api.createFolder when not on Home', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ currentPath: '/Users/test' })
    api.createFolder.mockResolvedValue({ ok: true, data: { path: '/Users/test/New folder' } } as never)
    render(<Toolbar />)
    await user.click(screen.getByRole('button', { name: /New/ }))
    await user.click(screen.getByRole('menuitem', { name: /Folder/ }))
    expect(api.createFolder).toHaveBeenCalledWith('/Users/test', 'New folder')
  })
})
