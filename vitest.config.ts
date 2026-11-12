import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 80 },
    },
  },
});
