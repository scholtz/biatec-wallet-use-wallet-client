import { expect, test } from '@playwright/test'

/**
 * Mobile layout regression: on narrow phones the method picker (Direct / WalletConnect /
 * Liquid Auth) used to overflow the dialog and the screen. Every control must stay inside both
 * the panel and the viewport, for each method and for the widest-label locales.
 */

const WIDTHS = [320, 360, 390, 430, 600, 640, 641]

for (const width of WIDTHS) {
  test(`connect dialog fits a ${width}px wide viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await page.click('#connect')
    const panel = page.locator('.bcd-panel')
    await expect(panel).toBeVisible()

    const check = async () => {
      const metrics = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth
        const p = document.querySelector('.bcd-panel') as HTMLElement
        const pr = p.getBoundingClientRect()
        const offenders = Array.from(p.querySelectorAll<HTMLElement>('*'))
          .filter((el) => el.offsetParent !== null)
          .map((el) => ({ cls: el.className.toString(), r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && (r.left < pr.left - 1 || r.right > pr.right + 1))
          .map(({ cls }) => cls)
        return {
          vw,
          panelLeft: pr.left,
          panelRight: pr.right,
          scrollW: p.scrollWidth,
          clientW: p.clientWidth,
          offenders
        }
      })
      expect(metrics.panelLeft).toBeGreaterThanOrEqual(0)
      expect(metrics.panelRight).toBeLessThanOrEqual(metrics.vw)
      expect(metrics.scrollW).toBeLessThanOrEqual(metrics.clientW)
      expect(metrics.offenders).toEqual([])
    }

    for (const method of ['direct', 'walletconnect', 'liquid']) {
      await page.click(`[data-method="${method}"]`)
      await expect(page.locator('.bcd-method--active')).toHaveAttribute('data-method', method)
      await check()
    }
  })
}

test('on a phone the three method buttons sit in one row and are all reachable', async ({
  page
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/')
  await page.click('#connect')
  const boxes = await page.locator('.bcd-method').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top }
    })
  )
  expect(boxes).toHaveLength(3)
  expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBe(1)
  for (const b of boxes) {
    expect(b.left).toBeGreaterThanOrEqual(0)
    expect(b.right).toBeLessThanOrEqual(360)
  }
  // Tapping the one that used to fall off-screen selects it.
  await page.click('[data-method="liquid"]')
  await expect(page.locator('.bcd-method--active')).toContainText('Liquid Auth')
})

test('a short landscape phone viewport scrolls inside the dialog instead of clipping it', async ({
  page
}) => {
  await page.setViewportSize({ width: 640, height: 320 })
  await page.goto('/')
  await page.click('#connect')
  const panel = page.locator('.bcd-panel')
  await expect(panel).toBeVisible()
  const box = await panel.boundingBox()
  expect(box!.height).toBeLessThanOrEqual(320)
  const scroll = await panel.evaluate((el) => ({
    sh: el.scrollHeight,
    ch: el.clientHeight,
    oy: getComputedStyle(el).overflowY
  }))
  expect(scroll.oy).toBe('auto')
  expect(scroll.sh).toBeGreaterThan(scroll.ch)
  await page.locator('.bcd-link').scrollIntoViewIfNeeded()
  await expect(page.locator('.bcd-link')).toBeInViewport()
})

test('stacked layout has no extra gap above the picker and fits a long-label locale', async ({
  page
}) => {
  await page.setViewportSize({ width: 360, height: 700 })
  await page.goto('/')
  await page.click('#connect')
  await page.click('[data-locale=\"ru\"]')
  const m = await page.evaluate(() => {
    const h = document.querySelector('.bcd-header')!.getBoundingClientRect()
    const s = document.querySelector('.bcd-methods')!.getBoundingClientRect()
    const p = document.querySelector('.bcd-panel')!.getBoundingClientRect()
    return { gap: s.top - h.bottom, left: s.left - p.left, right: p.right - s.right, w: p.width }
  })
  expect(m.gap).toBeLessThan(40)
  expect(m.left).toBeGreaterThanOrEqual(0)
  expect(m.right).toBeGreaterThanOrEqual(0)
})
