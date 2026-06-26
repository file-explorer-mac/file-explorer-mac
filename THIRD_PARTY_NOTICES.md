# Third-Party Notices

File Explorer is distributed as a macOS application bundle that includes the
third-party open-source software listed below. Each component remains under its
own license; File Explorer's own source is licensed under
[Apache-2.0](LICENSE) (see also [NOTICE](NOTICE)).

## Bundled in the shipped application

| Component | License | Source |
| --- | --- | --- |
| [Electron](https://www.electronjs.org/) | MIT | https://github.com/electron/electron |
| [Chromium](https://www.chromium.org/) (bundled by Electron) | BSD-3-Clause | https://chromium.googlesource.com/chromium/src/ |
| [Node.js](https://nodejs.org/) (bundled by Electron) | MIT | https://github.com/nodejs/node |
| [React](https://react.dev/) | MIT | https://github.com/facebook/react |
| [React DOM](https://react.dev/) | MIT | https://github.com/facebook/react |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | https://github.com/pmndrs/zustand |

## Build & development tooling (not distributed in the app)

electron-vite, electron-builder, Vite, Vitest, TypeScript, Testing Library, and
jsdom are used only to build and test the app — they are not part of the shipped
binary. Exact versions are pinned in [`package.json`](package.json) and
[`package-lock.json`](package-lock.json).

## Full license texts

A complete, version-pinned attribution bundle for every dependency can be
generated from the installed tree at any time, e.g.:

```bash
npx license-checker --production --summary
```

The MIT and BSD-3-Clause licenses are permissive and require preserving the
copyright and license notice, which this file and the upstream sources provide.
