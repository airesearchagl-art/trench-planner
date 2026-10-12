import { defineConfig } from 'vitest/config';
export default defineConfig({
  build: { rollupOptions: { input: ['index.html', 'manual.html'] } },
  test: { include: ['src/**/*.test.ts'] },
});
