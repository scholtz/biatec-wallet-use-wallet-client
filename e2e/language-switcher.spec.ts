import { expect, test } from '@playwright/test'

/**
 * The built-in connect dialog's language switcher (flags below the method selector — see
 * SUPPORTED_LOCALES / LOCALE_FLAG in src/i18n.ts and src/flags.ts).
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('shows one flag per supported language and switches live without closing', async ({
  page
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.click('#connect')
  const panel = page.locator('.bcd-panel')
  await expect(panel).toBeVisible()

  const flags = page.locator('.bcd-locale')
  await expect(flags).toHaveCount(10)

  // English is the default in this example (no VITE_ locale override, browser default in CI).
  await expect(page.locator('.bcd-locale--active')).toHaveAttribute('data-locale', 'en')
  await expect(page.locator('.bcd-title')).toHaveText('Connect Biatec Wallet')

  await page.click('[data-locale="sk"]')
  await expect(page.locator('.bcd-locale--active')).toHaveAttribute('data-locale', 'sk')
  await expect(page.locator('.bcd-title')).toHaveText('Pripojiť Biatec Wallet')
  await expect(page.locator('.bcd-subtitle')).toHaveText('Vyberte spôsob a naskenujte kód')
  // The dialog must stay open and keep its state — switching language only re-renders text.
  await expect(panel).toBeVisible()
  await expect(page.locator('.bcd-method--active')).toContainText('WalletConnect')

  expect(pageErrors).toEqual([])
})

test('the language switcher survives switching connection methods', async ({ page }) => {
  await page.click('#connect')
  await page.click('[data-locale="cs"]')
  await page.click('[data-method="liquid"]')

  // Both the chosen language and the full flag row should still be there after the method
  // selector's own re-render.
  await expect(page.locator('.bcd-locale--active')).toHaveAttribute('data-locale', 'cs')
  await expect(page.locator('.bcd-locale')).toHaveCount(10)
})
