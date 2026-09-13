import { expect, test } from '@playwright/test'

/**
 * End-to-end regression coverage for the built-in connect dialog (`src/connect-dialog.ts`),
 * run against the vanilla-ts example. Unit tests mock `./connect-dialog` entirely (see
 * `src/adapter.test.ts`), so a real DOM/browser bug in the dialog's own wiring — like the
 * "Cannot access 'attempt' before initialization" regression this suite guards against — can
 * only be caught by actually clicking the button in a real page.
 *
 * These tests never complete a real WalletConnect/Liquid Auth pairing (that needs a live wallet
 * and a real project id); they only assert the dialog opens and behaves correctly up to that
 * point.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('clicking Connect opens the built-in dialog with WalletConnect selected and its content visible', async ({
  page
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.click('#connect')

  const panel = page.locator('.bcd-panel')
  await expect(panel).toBeVisible()

  // The vanilla-ts example passes no `onDisplayUri`, so the built-in dialog renders its full
  // single-window UI: a method selector on the left, both methods listed, WalletConnect
  // selected by default, and that method's content (spinner, then QR/link) on the right —
  // never a second, separate dialog.
  const methods = page.locator('.bcd-method')
  await expect(methods).toHaveCount(2)
  await expect(page.locator('.bcd-method--active')).toContainText('WalletConnect')
  await expect(panel.locator('.bcd-content')).toBeVisible()
  await expect(panel.locator('.bcd-content-state, .bcd-qr-tile')).toBeVisible()

  expect(pageErrors).toEqual([])
  await expect(page.locator('#log')).not.toContainText('Cannot access')
})

test('switching to the Liquid Auth tab updates the content panel without throwing', async ({
  page
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.click('#connect')
  const panel = page.locator('.bcd-panel')
  await expect(panel).toBeVisible()

  await page.click('[data-method="liquid"]')
  await expect(page.locator('.bcd-method--active')).toContainText('Liquid Auth')
  await expect(panel.locator('.bcd-content-title')).toContainText('Liquid Auth', {
    timeout: 10000
  })

  expect(pageErrors).toEqual([])
})

test('cancelling the dialog closes it and leaves the app usable', async ({ page }) => {
  await page.click('#connect')
  await expect(page.locator('.bcd-panel')).toBeVisible()

  await page.click('.bcd-close')
  await expect(page.locator('.bcd-panel')).toHaveCount(0)

  // The app should still be responsive — a failed/cancelled connect() must not wedge the UI.
  await expect(page.locator('#connect')).toBeVisible()
})
