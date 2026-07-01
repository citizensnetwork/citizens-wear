import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Only enforce coverage on pure, unit-testable lib modules. Next.js
      // server components, route handlers, server actions, and session
      // helpers depend on the App Router runtime (`next/headers`,
      // `next/navigation`, `cookies()`) and are exercised end-to-end by
      // Playwright in Phase 4+.
      include: ['src/lib/store.ts', 'src/lib/connect.ts', 'src/lib/validators.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      // fileURLToPath (not URL.pathname) so the `@` alias resolves on Windows
      // too — pathname yields a leading-slash path like `/C:/…` that fs can't
      // resolve. Production route handlers under src/app import via `@`.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
