# Contributing to File Explorer

Thanks for your interest in improving File Explorer — a modern, tabbed file
manager for macOS built with Electron, React, and TypeScript.

## Getting started

```bash
npm install
npm run dev          # run the app with hot reload
```

## Before opening a pull request

Please make sure the full quality gate passes locally:

```bash
npm run typecheck    # main + renderer + tests — must be clean
npm test             # Vitest suite (the project is at 100% coverage)
```

- Match the conventions of the file you're editing.
- Add or update tests for any behavior change — the suite is comprehensive and we
  want to keep it that way.
- Keep PRs focused. For larger or architectural changes, please open an issue to
  discuss the approach first.

## Project layout

| Path | What |
| --- | --- |
| `src/main` | Electron main process (window, file-system ops, analytics) |
| `src/preload` | Context-isolated preload bridge |
| `src/renderer` | React UI — components, hooks, store, styles |
| `src/shared` | Types/helpers shared across processes |
| `analytics/` | Optional serverless usage-ping worker (see its README) |

## Building a release

```bash
npm run dist:unsigned    # local universal build — no Apple account needed
```

A signed + notarized build additionally needs Apple Developer ID credentials.
Copy `.env.signing.example` to `.env.signing`, fill it in, and load it before
building:

```bash
set -a; source .env.signing; set +a
npm run dist
```

## Reporting bugs & requesting features

Use the GitHub issue templates. For bugs, include your macOS version, the app
version, and clear reproduction steps.

By contributing, you agree that your contributions are licensed under the
project's [Apache-2.0 License](LICENSE).
