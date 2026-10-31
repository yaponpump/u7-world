import { defineConfig } from 'vite';

// Base path: "/" lokal, "/u7-world/" kalau di-deploy ke GitHub Pages.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/u7-world/' : '/',
  build: { target: 'es2022' }, // top-level await buat loading asset
});
