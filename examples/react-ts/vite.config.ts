import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The adapter is a workspace package whose `exports` point at `dist/`, which is not committed.
// Alias the import at the built entry so Vite can resolve it even when the install only
// symlinked the package after `dist/` was missing (the Vercel failure mode). `build` produces
// this file before `vite build` runs.
const adapterEntry = fileURLToPath(new URL('../../dist/index.js', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'biatec-wallet-use-wallet-client': adapterEntry
    }
  }
})
