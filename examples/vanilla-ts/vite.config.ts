import { defineConfig } from 'vite'

// VITE_CACHE_DIR lets a second dev server in this directory (the e2e server without a
// WalletConnect project id) use its own dependency cache instead of sharing node_modules/.vite.
export default defineConfig({
  // src/main.ts uses top-level await (`await manager.resumeSessions()`), which Vite's default
  // es2020 build target cannot compile; this matches the tsconfig target (ES2022).
  build: { target: 'es2022' },
  ...(process.env.VITE_CACHE_DIR ? { cacheDir: process.env.VITE_CACHE_DIR } : {})
})
