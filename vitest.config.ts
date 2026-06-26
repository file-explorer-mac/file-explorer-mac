import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Test harness for the File Explorer app.
 *
 * - Default environment is jsdom (renderer / React land). Main- and preload-process
 *   test files opt into Node via a `// @vitest-environment node` docblock.
 * - Aliases mirror electron.vite.config.ts so `@/` and `@shared/` resolve in tests.
 * - Coverage is gated at 100% across every shipped `.ts`/`.tsx` module. Only type
 *   declarations and the test harness itself are excluded.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@test': resolve(__dirname, 'test')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // CSS Modules resolve to stable, readable class names (styles.root === 'root')
    // so component assertions can match on class names without hashing noise.
    css: {
      modules: {
        classNameStrategy: 'non-scoped'
      }
    },
    coverage: {
      provider: 'v8',
      // In Vitest 4, setting `include` reports every matching file (covered or
      // not) — the old `all: true` flag was removed.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/renderer/src/vite-env.d.ts'
      ],
      reporter: ['text', 'text-summary', 'json-summary', 'html', 'lcov'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100
      }
    }
  }
})
