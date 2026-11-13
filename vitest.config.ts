import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const rootPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^react$/, replacement: rootPath('./node_modules/react/index.js') },
      {
        find: /^react\/jsx-runtime$/,
        replacement: rootPath('./node_modules/react/jsx-runtime.js'),
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: rootPath('./node_modules/react/jsx-dev-runtime.js'),
      },
      { find: /^react-dom$/, replacement: rootPath('./node_modules/react-dom/index.js') },
      { find: /^react-dom\/client$/, replacement: rootPath('./node_modules/react-dom/client.js') },
      {
        find: /^@aws-amplify\/auth$/,
        replacement: rootPath('./tests/helpers/amplify-auth.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
      exclude: [
        '**/*.d.ts',
        'apps/api/src/main.ts',
        'apps/web/src/main.tsx',
        'apps/web/vite.config.ts',
      ],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 80 },
    },
  },
});
