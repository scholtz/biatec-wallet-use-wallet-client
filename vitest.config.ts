import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'biatec-wallet-use-wallet-client',
    dir: './src',
    environment: 'node',
    watch: false,
    globals: false,
    // The Liquid Auth transport tests drive several chained async hops (dynamic imports,
    // signaling round-trips) through a mocked socket.io-client, each polled with its own
    // `waitFor`; on a loaded CI runner that can occasionally outrun the default 5s test
    // timeout. A longer timeout plus one retry absorbs that without masking a real
    // regression — see CONTRIBUTING.md#tests.
    testTimeout: 15000,
    retry: process.env.CI ? 1 : 0
  }
})
