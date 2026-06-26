# Test conventions (read this before writing tests)

Harness: **Vitest 4** + **@testing-library/react** (jsdom) for the renderer, and
Vitest in **node** for the main / preload processes. Coverage is gated at **100%**
(statements, branches, functions, lines) for every shipped `.ts`/`.tsx` module.

## Where tests live

Co-locate each test next to its source: `format.ts` → `format.test.ts`,
`Toolbar.tsx` → `Toolbar.test.tsx`. A source file may have more than one test
file (e.g. `explorerStore.navigation.test.ts`, `explorerStore.fileops.test.ts`).

## Imports

Use the `@test` alias for harness helpers (works in every test file regardless of
depth), plus the app's own `@/` and `@shared` aliases:

```ts
import { resetExplorerStore } from '@test/storeHelpers'
import { makeFileItem, makeFolder } from '@test/factories'
import { installApiMock } from '@test/apiMock'
import { useExplorerStore } from '@/store/explorerStore'
```

## Environment

- Renderer tests (components, store, hooks, utils, App) run in **jsdom** — the default.
- Main / preload tests must opt into **node** with this as the *very first line*:
  ```ts
  // @vitest-environment node
  ```

## What `test/setup.ts` already does (runs before every test)

- Registers `@testing-library/jest-dom` matchers (`toBeInTheDocument`, etc.).
- In jsdom: shims `matchMedia`, `IntersectionObserver`, `ResizeObserver`,
  `Element.prototype.scrollIntoView`, `navigator.clipboard`, `URL.createObjectURL`.
- `beforeEach`: clears `localStorage` and installs a **fresh full `window.api` mock**.
- `afterEach`: React Testing Library `cleanup()` + `vi.clearAllMocks()`.

## window.api (renderer)

A complete mock is installed automatically. To assert on calls or override return
values, capture your own handle:

```ts
import { installApiMock, type ApiMock } from '@test/apiMock'
let api: ApiMock
beforeEach(() => { api = installApiMock() })
// ...
api.readDirectory.mockResolvedValue({ ok: true, data: [makeFileItem()] })
expect(api.rename).toHaveBeenCalledWith('/p/old', 'new')
```

Every method defaults to a benign success (resolved `Result`s, empty lists,
no-op subscriptions that return an unsubscribe fn). Override only what a test needs.

## Zustand store (renderer)

The store is a singleton — reset it between tests:

```ts
import { resetExplorerStore } from '@test/storeHelpers'
beforeEach(() => { resetExplorerStore() })
```

Seed state with `useExplorerStore.setState({ ... })`, drive behavior through
actions (`await useExplorerStore.getState().paste()`), and assert via
`useExplorerStore.getState()`. `await` every async action.

## Electron mock (main / preload — node env)

`vi.mock` is hoisted; declare it before importing the module under test. Provide
only the electron surface your module touches:

```ts
vi.mock('electron', () => ({
  app: { getPath: vi.fn(), isPackaged: false, whenReady: vi.fn() },
  shell: { openPath: vi.fn().mockResolvedValue(''), trashItem: vi.fn(), showItemInFolder: vi.fn() },
  nativeImage: { createThumbnailFromPath: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  webUtils: { getPathForFile: vi.fn() }
}))
```

## child_process (fileSystem ops that exec zip/ditto/open/helper)

`fileSystem.ts` uses `promisify(execFile)`. Mock so the promisified form resolves:

```ts
vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd, _args, opts, cb) => {
    const done = typeof opts === 'function' ? opts : cb
    done(null, { stdout: '', stderr: '' })
  })
}))
```

Per-test, override with `vi.mocked(execFile).mockImplementationOnce(...)` to
simulate failures or specific stdout (e.g. the default-handler `query`).

## Real filesystem (fileSystem.ts)

Prefer real temp dirs over mocking `fs`:

```ts
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'fe-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
```

`shell.trashItem` is mocked (don't actually trash). External binaries
(`zip`, `ditto`, `open`, the handler) must be mocked via `child_process`.

## The 100% gate — definition of done

Run your test file(s) restricted to your source file. It must **exit 0**:

```bash
npx vitest run <your test file(s)> --coverage --coverage.include='<your source file>'
```

Example:
```bash
npx vitest run src/renderer/src/components/Toolbar.test.tsx \
  --coverage --coverage.include='src/renderer/src/components/Toolbar.tsx'
```

If a source file has several test files, pass them all in one command so coverage
is combined. The "Uncovered Line #s" column tells you exactly what to hit. Only
**your** source file's numbers matter — `--coverage.include` restricts the report
to it.

Also keep the file type-clean: it must pass `npm run typecheck:test`.

## Rules

1. Create only your own new `*.test.ts(x)` file(s). **Do not** edit any source
   file, the harness (`test/*`, `vitest.config.ts`, the tsconfigs), `package.json`,
   or another agent's test file.
2. Behavior-first: assert observable outputs/effects, not internals. Prefer
   role/text queries (`getByRole`, `getByText`) over class/DOM spelunking.
3. If a test reveals a **genuine source bug**, do **not** change the source.
   Write the test to capture the *current actual* behavior (so it stays green) and
   report the suspected bug in your summary.
4. Deterministic only: no network, no real timers for time-dependent code (use
   `vi.useFakeTimers()` / `vi.setSystemTime()` where the source reads the clock).
5. Reach 100% honestly — exercise real branches; don't delete code paths.
