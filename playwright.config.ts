import { defineConfig, devices } from '@playwright/test'

const PORT = 5183

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The adapter package must already be built (`pnpm build`) before this runs — the vanilla-ts
  // example depends on it via `workspace:*`, resolving to `dist/`.
  webServer: {
    command: `pnpm --filter example-vanilla-ts exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: {
      // Never a real WalletConnect Cloud project — these tests never complete a real pairing,
      // they only exercise the UI up to (and including) opening the connect dialog.
      VITE_WC_PROJECT_ID: 'e2e-test-project-id'
    }
  }
})
