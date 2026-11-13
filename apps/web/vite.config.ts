import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Auth's modular APIs and Amplify.configure must share the same global
  // context, including when dependencies are hoisted from the monorepo root.
  resolve: { dedupe: ['@aws-amplify/core'] },
});
