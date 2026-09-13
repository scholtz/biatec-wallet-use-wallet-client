import { expect, test } from '@playwright/test'

/**
 * The vanilla-ts example's light/dark toggle (see index.html's inline head script and
 * src/main.ts). Also confirms the built-in connect dialog picks up the same `data-theme`
 * attribute it sets on <html>, so the dialog never mismatches the page around it.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('toggling switches the page theme and persists across reloads', async ({ page }) => {
  const html = page.locator('html')

  // Whatever the initial theme is, clicking the toggle flips it.
  const initial = await html.getAttribute('data-theme')
  await page.click('#theme-toggle')
  const toggled = await html.getAttribute('data-theme')
  expect(toggled).not.toBe(initial)
  expect(['light', 'dark']).toContain(toggled)

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', toggled!)
})

test('the built-in connect dialog matches the page theme', async ({ page }) => {
  // Force a known theme rather than relying on whatever the initial system preference is.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.click('#connect')
  const panel = page.locator('.bcd-panel')
  await expect(panel).toBeVisible()
  const darkBg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor)
  await page.click('.bcd-close')

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await page.click('#connect')
  await expect(panel).toBeVisible()
  const lightBg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor)

  // --bcd-bg is rgba(24,30,42,...) in dark mode and rgba(255,255,255,...) in light mode — the
  // dialog's own hardcoded `prefers-color-scheme` fallback would ignore our forced attribute,
  // so seeing two different backgrounds here proves it actually reads `data-theme` from <html>.
  expect(darkBg).not.toBe(lightBg)
  const darkRed = Number(darkBg.match(/\d+/)![0])
  const lightRed = Number(lightBg.match(/\d+/)![0])
  expect(darkRed).toBeLessThan(100)
  expect(lightRed).toBeGreaterThan(200)
})
