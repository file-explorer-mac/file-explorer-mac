// Pulls the @testing-library/jest-dom matcher augmentations (toBeInTheDocument,
// etc.) into the tsc program for the renderer test files. The runtime extension
// happens in test/setup.ts, but that file lives outside tsconfig.web's include,
// so the `vitest` module augmentation needs to be referenced from within src/ for
// `tsc --noEmit -p tsconfig.web.json` to see it.
import '@testing-library/jest-dom/vitest'
