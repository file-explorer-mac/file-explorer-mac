// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const fsState = {
  readFileSync: vi.fn<(...a: unknown[]) => string>(),
  writeFileSync: vi.fn()
}
vi.mock('fs', () => ({
  readFileSync: (...a: unknown[]) => fsState.readFileSync(...a),
  writeFileSync: (...a: unknown[]) => fsState.writeFileSync(...a)
}))

vi.mock('os', () => ({ default: { release: () => '23.5.0' } }))

vi.mock('crypto', () => ({ randomUUID: () => 'generated-uuid' }))

// child_process.execFile, in node-callback form so promisify() resolves it.
const cpState = { stdout: '', err: null as Error | null }
vi.mock('child_process', () => ({
  execFile: (
    _file: string,
    _args: string[],
    _opts: unknown,
    cb: (e: Error | null, r?: { stdout: string; stderr: string }) => void
  ) => {
    if (cpState.err) cb(cpState.err)
    else cb(null, { stdout: cpState.stdout, stderr: '' })
  }
}))

const appState = { isPackaged: true }
const appMock = {
  get isPackaged() {
    return appState.isPackaged
  },
  getPath: vi.fn().mockReturnValue('/userData'),
  getVersion: vi.fn().mockReturnValue('1.0.0')
}
vi.mock('electron', () => ({ app: appMock }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Let the fire-and-forget report() chain (detect -> send -> fetch) settle. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

async function load(): Promise<typeof import('./analytics')> {
  return import('./analytics')
}

/** Parse the JSON body of the Nth fetch call. */
function sentBody(call = 0): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[call][1].body)
}

const ORIG_PLATFORM = process.platform
const ORIG_ARCH = process.arch
function setProp(key: 'platform' | 'arch', value: string): void {
  Object.defineProperty(process, key, { value, configurable: true })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  appState.isPackaged = true
  appMock.getPath.mockReturnValue('/userData')
  appMock.getVersion.mockReturnValue('1.0.0')
  fsState.readFileSync.mockReturnValue('stored-id')
  cpState.stdout = 'MDM enrollment: No\nEnrolled via DEP: No'
  cpState.err = null
  setProp('platform', 'darwin')
  setProp('arch', 'arm64')
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  setProp('platform', ORIG_PLATFORM)
  setProp('arch', ORIG_ARCH)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('opt-out & gating', () => {
  it('does not send when DO_NOT_TRACK is set', async () => {
    vi.stubEnv('DO_NOT_TRACK', '1')
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not send when FE_NO_ANALYTICS is set', async () => {
    vi.stubEnv('FE_NO_ANALYTICS', '1')
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not send from an unpackaged (dev) build', async () => {
    appState.isPackaged = false
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends from an unpackaged build when FE_ANALYTICS_DEBUG forces it', async () => {
    appState.isPackaged = false
    vi.stubEnv('FE_ANALYTICS_DEBUG', '1')
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats empty / 0 / false env values as not-opted-out', async () => {
    // Exercises every short-circuit branch of the truthy() helper.
    vi.stubEnv('DO_NOT_TRACK', '')
    vi.stubEnv('FE_NO_ANALYTICS', '0')
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats the literal string "false" as not-opted-out', async () => {
    vi.stubEnv('DO_NOT_TRACK', 'false')
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('payload', () => {
  it('posts an anonymous app_started event with coarse metadata', async () => {
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://file-explorer-analytics.appflare.io/e')
    expect(opts.method).toBe('POST')
    expect(opts.headers).toEqual({ 'content-type': 'application/json' })

    const body = sentBody()
    expect(body).toMatchObject({
      id: 'stored-id',
      event: 'app_started',
      v: '1.0.0',
      os: 'darwin',
      osv: '23.5.0',
      arch: 'arm64',
      managed: 'none'
    })
    // Local launch time is coarse: weekday index + hour, nothing finer.
    expect(Number.isInteger(body.dow)).toBe(true)
    expect(body.dow as number).toBeGreaterThanOrEqual(0)
    expect(body.dow as number).toBeLessThanOrEqual(6)
    expect(Number.isInteger(body.hour)).toBe(true)
    expect(body.hour as number).toBeGreaterThanOrEqual(0)
    expect(body.hour as number).toBeLessThanOrEqual(23)
    // No file paths, names, or other identifying fields are ever included.
    expect(opts.body).not.toMatch(/userData/)
  })

  it('honours the FE_ANALYTICS_URL override', async () => {
    vi.stubEnv('FE_ANALYTICS_URL', 'https://example.test/e')
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/e')
  })
})

describe('managed-device (B2B) detection', () => {
  it('reports "dep" for Automated Device Enrollment', async () => {
    cpState.stdout = 'Enrolled via DEP: Yes\nMDM enrollment: Yes (User Approved)'
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(sentBody().managed).toBe('dep')
  })

  it('reports "mdm" for MDM enrollment without DEP', async () => {
    cpState.stdout = 'Enrolled via DEP: No\nMDM enrollment: Yes (User Approved)'
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(sentBody().managed).toBe('mdm')
  })

  it('reports "none" for an unmanaged Mac', async () => {
    cpState.stdout = 'Enrolled via DEP: No\nMDM enrollment: No'
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(sentBody().managed).toBe('none')
  })

  it('reports "none" when the profiles command fails', async () => {
    cpState.err = new Error('not found')
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(sentBody().managed).toBe('none')
  })

  it('reports "none" on non-macOS without probing', async () => {
    setProp('platform', 'win32')
    // Make the command throw if it were (incorrectly) invoked.
    cpState.err = new Error('should not run')
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    const body = sentBody()
    expect(body.os).toBe('win32')
    expect(body.managed).toBe('none')
  })
})

describe('install id', () => {
  it('reuses the persisted id without rewriting it', async () => {
    fsState.readFileSync.mockReturnValue('  stored-id  ')
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(sentBody().id).toBe('stored-id')
    expect(fsState.writeFileSync).not.toHaveBeenCalled()
  })

  it('generates and persists a new id when none exists', async () => {
    fsState.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(fsState.writeFileSync).toHaveBeenCalledWith(
      '/userData/install-id',
      'generated-uuid',
      'utf8'
    )
    expect(sentBody().id).toBe('generated-uuid')
  })

  it('generates a new id when the stored file is blank', async () => {
    fsState.readFileSync.mockReturnValue('   ')
    const { trackAppStarted } = await load()
    trackAppStarted()
    await tick()
    expect(fsState.writeFileSync).toHaveBeenCalled()
    expect(sentBody().id).toBe('generated-uuid')
  })

  it('still sends when the id cannot be persisted', async () => {
    fsState.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    fsState.writeFileSync.mockImplementation(() => {
      throw new Error('EACCES')
    })
    const { trackAppStarted } = await load()
    expect(() => trackAppStarted()).not.toThrow()
    await tick()
    expect(sentBody().id).toBe('generated-uuid')
  })
})

describe('network failures', () => {
  it('swallows fetch rejections', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const { trackAppStarted } = await load()
    expect(() => trackAppStarted()).not.toThrow()
    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
