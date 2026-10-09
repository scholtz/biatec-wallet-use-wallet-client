import { expect, test } from '@playwright/test'

/**
 * The default integration — `biatec()` with NO WalletConnect project id — offers only Biatec
 * Direct and Liquid Auth. Runs against a second dev server of the vanilla-ts example started
 * without VITE_WC_PROJECT_ID (see playwright.config.ts).
 */
test.use({ baseURL: 'http://localhost:5185' })

test('without a project id the dialog shows exactly Direct and Liquid Auth', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/')
  await page.click('#connect')
  await expect(page.locator('.bcd-panel')).toBeVisible()

  const methods = page.locator('.bcd-method')
  await expect(methods).toHaveCount(2)
  await expect(methods.nth(0)).toContainText('Biatec Direct')
  await expect(methods.nth(1)).toContainText('Liquid Auth')
  await expect(page.locator('[data-method="walletconnect"]')).toHaveCount(0)
  await expect(page.locator('.bcd-method--active')).toContainText('Biatec Direct')

  expect(pageErrors).toEqual([])
})
