import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { installApiMock } from './apiMock'

// The setup file runs for every test, including the Node-environment main/preload
// suites. Guard all DOM/browser shims so they only run where `window` exists.
const inBrowser = typeof window !== 'undefined'

if (inBrowser) {
  // jsdom lacks these APIs the app relies on; provide inert, overridable stubs.
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  }

  class MockObserver {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
    takeRecords = vi.fn().mockReturnValue([])
    root = null
    rootMargin = ''
    thresholds = []
    constructor(_cb?: unknown) {}
  }
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver ??=
    MockObserver
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= MockObserver

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn()
  }

  if (!('clipboard' in navigator)) {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true
    })
  }

  if (!('createObjectURL' in URL)) {
    ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = vi
      .fn()
      .mockReturnValue('blob:mock')
    ;(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn()
  }
}

beforeEach(() => {
  if (inBrowser) {
    localStorage.clear()
    installApiMock()
  }
})

afterEach(() => {
  if (inBrowser) cleanup()
  vi.clearAllMocks()
})
