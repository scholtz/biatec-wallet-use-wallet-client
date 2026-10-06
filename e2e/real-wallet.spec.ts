import { expect, test, type Page } from '@playwright/test'

/**
 * OPT-IN interoperability test against the REAL Biatec Wallet (scholtz/wallet, `/direct` route).
 * Skipped unless `WALLET_E2E_URL` is set, so CI is unaffected:
 *
 *   # terminal 1, in the wallet repo (feat/direct-popup-transport or later)
 *   pnpm run serve --port 8080
 *   # terminal 2, here (the example dApp must be started with the same wallet URL)
 *   VITE_DIRECT_WALLET_URL=http://localhost:8080 pnpm --filter example-vanilla-ts exec vite --port 5183
 *   WALLET_E2E_URL=http://localhost:8080 pnpm exec playwright test real-wallet
 *
 * The dApp (http://localhost:5183) and the wallet (http://localhost:8080) are different origins.
 * The wallet runs on mainnet by default, so the dApp switches to mainnet; algod is mocked so the
 * dApp can build a payment without network access, and the adapter cryptographically verifies
 * the signature the real wallet returns.
 */

const WALLET_URL = process.env.WALLET_E2E_URL
const PASSWORD = 'TestPassword123'

test.skip(
  !WALLET_URL,
  'set WALLET_E2E_URL (e.g. http://localhost:8080) to run against a real wallet'
)

async function createWallet(page: Page): Promise<string> {
  await page.goto(`${WALLET_URL}/`)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('AWallet')
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
        request.onblocked = () => resolve()
        setTimeout(() => resolve(), 1000)
      })
  )
  await page.goto(`${WALLET_URL}/new-wallet`)
  await expect(page.locator('#newwallet-name')).toBeVisible()
  await page.locator('#newwallet-name').fill('Interop Wallet')
  await page.locator('#newwallet-pass').fill(PASSWORD)
  // Click elsewhere so the password-strength overlay does not cover the create button.
  await page.locator('#newwallet-name').click()
  await page.waitForTimeout(500)
  const create = page.locator('#new_wallet_button_create')
  await create.scrollIntoViewIfNeeded()
  await create.click({ force: true })
  await page.waitForURL(/\/account\//, { timeout: 60_000 })
  return new URL(page.url()).pathname.split('/').pop()!
}

async function unlock(popup: Page) {
  await expect(popup.locator('#new_wallet_button_open')).toBeVisible({ timeout: 30_000 })
  await popup.locator('#wallet-pass').fill(PASSWORD)
  await popup.locator('#new_wallet_button_open').click()
}

test('real wallet: connect from the example dApp and sign a payment that verifies', async ({
  page,
  context
}) => {
  test.setTimeout(300_000)

  // The wallet (other origin) with a freshly created account.
  const walletPage = await context.newPage()
  const address = await createWallet(walletPage)

  // The dApp, switched to mainnet (the wallet's active network), with algod mocked.
  await page.route('**/v2/transactions/params', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        'consensus-version': 'https://github.com/algorandfoundation/specs/tree/abc',
        fee: 0,
        'genesis-hash': 'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=',
        'genesis-id': 'mainnet-v1.0',
        'last-round': 1000,
        'min-fee': 1000
      })
    })
  )
  await page.goto('/')
  await page.selectOption('#network', 'mainnet')

  // connect (popup): unlock, approve the account
  const [connectPopup] = await Promise.all([
    page.waitForEvent('popup'),
    page.click('#connect-popup')
  ])
  expect(new URL(connectPopup.url()).origin).toBe(new URL(WALLET_URL!).origin)
  await unlock(connectPopup)
  await expect(connectPopup.getByTestId('direct-approve')).toBeVisible({ timeout: 60_000 })
  await connectPopup.getByTestId('direct-approve').click()
  await expect(page.locator('#log')).toContainText('connected (popup):', { timeout: 60_000 })
  await expect(page.locator('#log')).toContainText(address)
  await expect(page.locator('#sign-txn')).toBeVisible()

  // sign: a fresh popup, unlock, sign, send back
  const [signPopup] = await Promise.all([page.waitForEvent('popup'), page.click('#sign-txn')])
  await unlock(signPopup)
  await expect(signPopup.getByRole('button', { name: 'Sign transaction' })).toBeVisible({
    timeout: 60_000
  })
  await signPopup.getByRole('button', { name: 'Sign transaction' }).click()
  await signPopup.getByRole('button', { name: 'Send back to DApp' }).click()

  // The adapter verified txID + ed25519 signature before returning; the example logs the length.
  await expect(page.locator('#log')).toContainText('signed txn bytes:', { timeout: 60_000 })
  await expect(page.locator('#log')).not.toContainText('sign failed')
})
