import { describe, it, expect, beforeEach, vi } from 'vitest'

// `main.tsx` imports `react-dom/client` as a default export (`import ReactDOM from
// 'react-dom/client'`), so the mock must expose the surface under `default`.
const renderSpy = vi.fn()
const rootObject = { render: renderSpy }
const createRootSpy = vi.fn(() => rootObject)

vi.mock('react-dom/client', () => ({
  default: { createRoot: createRootSpy }
}))

// Stub the app tree so importing main doesn't pull in the whole renderer.
vi.mock('./App', () => ({ default: () => null }))

describe('main (renderer entry)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    createRootSpy.mockClear()
    renderSpy.mockClear()
  })

  it('mounts the app onto the #root element exactly once', async () => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)

    await import('./main')

    // createRoot is called with the literal #root element.
    expect(createRootSpy).toHaveBeenCalledTimes(1)
    expect(createRootSpy).toHaveBeenCalledWith(root)

    // The root returned by createRoot has its render invoked once.
    expect(renderSpy).toHaveBeenCalledTimes(1)
    expect(renderSpy.mock.instances[0]).toBe(rootObject)
  })
})
