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

test('clicking Connect opens the built-in dialog with Biatec Direct selected and idle', async ({
  page
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.click('#connect')

  const panel = page.locator('.bcd-panel')
  await expect(panel).toBeVisible()

  // The vanilla-ts example passes no `onDisplayUri`, so the built-in dialog renders its full
  // single-window UI: a method selector on the left (Direct first, then WalletConnect and
  // Liquid Auth), Direct selected by default, and that method's content on the right — never
  // a second, separate dialog. Direct stays idle (an "Open Biatec Wallet" button, no popup)
  // until the button is clicked.
  const methods = page.locator('.bcd-method')
  await expect(methods).toHaveCount(3)
  await expect(methods.nth(0)).toContainText('Biatec Direct')
  await expect(methods.nth(1)).toContainText('WalletConnect')
  await expect(methods.nth(2)).toContainText('Liquid Auth')
  await expect(page.locator('.bcd-method--active')).toContainText('Biatec Direct')
  await expect(panel.locator('.bcd-content')).toBeVisible()
  await expect(page.locator('.bcd-open')).toBeVisible()
  expect(page.context().pages()).toHaveLength(1)

  // WalletConnect starts lazily when its tab is selected.
  await page.click('[data-method="walletconnect"]')
  await expect(page.locator('.bcd-method--active')).toContainText('WalletConnect')
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

test('pressing Enter on "Open Biatec Wallet" keeps keyboard focus inside the dialog', async ({
  page
}) => {
  // Direct is the pre-selected tab, so its open button already holds the initial focus.
  await page.click('#connect')
  await expect(page.locator('.bcd-open')).toBeFocused()
  await page.keyboard.press('Enter')
  // The panel re-renders into its "connecting" state; focus must land on the new primary button.
  await expect(page.locator('.bcd-open')).toBeFocused()
  expect(await page.evaluate(() => !!document.activeElement?.closest('.bcd-panel'))).toBe(true)
})

test('Escape closes the dialog and leaves the app usable', async ({ page }) => {
  await page.click('#connect')
  await expect(page.locator('.bcd-panel')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.bcd-panel')).toHaveCount(0)
  await expect(page.locator('#connect')).toBeVisible()
  // Focus goes back to the control that opened the dialog.
  await expect(page.locator('#connect')).toBeFocused()
})

test('Tab from the last control wraps to the first, Shift+Tab from the first to the last', async ({
  page
}) => {
  await page.click('#connect')
  await expect(page.locator('.bcd-panel')).toBeVisible()
  const ids = await page.evaluate(() => {
    const panel = document.querySelector('.bcd-panel') as HTMLElement
    const els = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null)
    els.forEach((el, i) => el.setAttribute('data-e2e-order', String(i)))
    return els.length
  })
  expect(ids).toBeGreaterThan(2)
  await page.focus(`[data-e2e-order="${ids - 1}"]`)
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-e2e-order="0"]')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.locator(`[data-e2e-order="${ids - 1}"]`)).toBeFocused()
})
