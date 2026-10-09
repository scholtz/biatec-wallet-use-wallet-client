import { defineConfig } from 'vite'

// VITE_CACHE_DIR lets a second dev server in this directory (the e2e server without a
// WalletConnect project id) use its own dependency cache instead of sharing node_modules/.vite.
export default defineConfig({
  ...(process.env.VITE_CACHE_DIR ? { cacheDir: process.env.VITE_CACHE_DIR } : {})
})
