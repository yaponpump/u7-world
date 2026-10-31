import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Base path: "/" lokal, "/u7-world/" kalau di-deploy ke GitHub Pages.
// Dua halaman: game (index.html) dan website (site/index.html -> dist/site/index.html).
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/u7-world/' : '/',
  build: {
    target: 'es2022', // top-level await buat loading asset
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        site: resolve(__dirname, 'site/index.html'),
      },
    },
  },
});
