import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'biatec-wallet-use-wallet-client',
    dir: './src',
    environment: 'node',
    watch: false,
    globals: false
  }
})
