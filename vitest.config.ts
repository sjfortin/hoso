import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()], resolve: { alias: { '@': fileURLToPath(new URL('./frontend/src', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['frontend/tests/**/*.test.tsx'], setupFiles: ['frontend/tests/setup.ts'], environmentOptions: { jsdom: { url: 'http://localhost:4312/' } } },
});
