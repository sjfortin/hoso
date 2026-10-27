import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('./frontend', import.meta.url));
export default defineConfig({
  root,
  publicDir: '../public',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(root, 'src') } },
  build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { input: { phone: resolve(root, 'index.html'), desktop: resolve(root, 'desktop.html') } } },
});
