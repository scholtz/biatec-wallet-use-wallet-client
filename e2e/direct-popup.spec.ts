import algosdk from 'algosdk'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

/**
 * End-to-end coverage of the Biatec Direct (popup + postMessage) transport against the
 * vanilla-ts example. The real wallet lives in another repository; here a **stub wallet page**
 * is served on a second origin (`http://127.0.0.1:5184`, vs the dApp on `http://localhost:5183`
 * — a different origin, so the cross-origin path is genuinely exercised) by intercepting the
 * requests with `context.route()`. The stub implements the wallet side of
 * docs/DIRECT_PROTOCOL.md: `ready` → `enable` → `sign_transactions`, with the same origin/source
 * checks the real wallet must do. Signing is delegated to this test process (which has algosdk)
 * through an exposed binding, so the adapter's "returned txn matches what was sent" check runs
 * against a genuinely signed transaction.
 */

const WALLET_URL = 'http://127.0.0.1:5184'
const account = algosdk.generateAccount()
const ADDRESS = account.addr.toString()

type Behavior = 'approve' | 'reject' | 'silent'

function stubWalletHtml(behavior: Behavior): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Stub Biatec Wallet</title></head>
<body><p id="status">Stub wallet</p>
<script>
  const BEHAVIOR = ${JSON.stringify(behavior)}
  const ADDRESS = ${JSON.stringify(ADDRESS)}
  const dapp = new URLSearchParams(location.search).get('origin')
  let handled = false
  const reply = (request, reference, result, error) => {
    window.opener.postMessage(
      { id: crypto.randomUUID(), requestId: request.id, reference, ...(error ? { error } : { result }) },
      dapp
    )
    setTimeout(() => window.close(), 150)
  }
  window.addEventListener('message', async (event) => {
    // Exactly what the real wallet must do: only its opener, only the origin it was told.
    if (event.origin !== dapp || event.source !== window.opener) return
    if (handled) return // one request per popup
    handled = true
    const request = event.data
    document.getElementById('status').textContent = request.reference
    if (BEHAVIOR === 'silent') return
    if (BEHAVIOR === 'reject') {
      return reply(request, request.reference.replace(':request', ':response'), undefined, {
        code: 4001,
        message: 'User rejected'
      })
    }
    if (request.reference === 'arc0027:enable:request') {
      reply(request, 'arc0027:enable:response', {
        providerId: request.params.providerId,
        genesisHash: request.params.genesisHash,
        accounts: [{ address: ADDRESS, name: 'Stub account' }]
      })
    } else if (request.reference === 'arc0027:sign_transactions:request') {
      const stxns = []
      for (const entry of request.params.txns) stxns.push(await window.stubSign(entry.txn))
      reply(request, 'arc0027:sign_transactions:response', {
        providerId: request.params.providerId,
        stxns
      })
    }
  })
  window.opener.postMessage(
    { v: 1, reference: 'biatec:direct:ready', capabilities: { methods: ['enable', 'sign_transactions'], genesisHashes: [] } },
    dapp
  )
</script></body></html>`
}

async function installStubWallet(context: BrowserContext, behavior: Behavior): Promise<void> {
  await context.exposeBinding('stubSign', (_source, txnBase64Url: string) => {
    const bytes = Buffer.from(txnBase64Url.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    const signed = algosdk.decodeUnsignedTransaction(bytes).signTxn(account.sk)
    return Buffer.from(signed).toString('base64url')
  })
  await context.route(`${WALLET_URL}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: stubWalletHtml(behavior) })
  )
}

/** Mocks the algod endpoint the example reads suggested params from. */
async function mockAlgodParams(page: Page): Promise<void> {
  await page.route('**/v2/transactions/params', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        'consensus-version': 'https://github.com/algorandfoundation/specs/tree/abc',
        fee: 0,
        'genesis-hash': 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
        'genesis-id': 'testnet-v1.0',
        'last-round': 1000,
        'min-fee': 1000
      })
    })
  )
}

test('connect (popup) opens the wallet on its own origin, stores the approved account and the popup closes', async ({
  page,
  context
}) => {
  await installStubWallet(context, 'approve')
  await page.goto('/')

  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#connect-popup')])
  await popup.waitForLoadState()
  const url = new URL(popup.url())
  expect(url.origin).toBe(WALLET_URL)
  expect(url.pathname).toBe('/direct')
  expect(url.searchParams.get('origin')).toBe('http://localhost:5183')

  await expect(page.locator('#log')).toContainText('connected (popup):')
  await expect(page.locator('#log')).toContainText(ADDRESS)
  await expect(page.locator('#disconnect')).toBeVisible()
  await popup.waitForEvent('close')
})

test('a connected direct session signs a transaction through a fresh popup and the signature is verified', async ({
  page,
  context
}) => {
  await installStubWallet(context, 'approve')
  await mockAlgodParams(page)
  await page.goto('/')

  await Promise.all([page.waitForEvent('popup'), page.click('#connect-popup')])
  await expect(page.locator('#sign-txn')).toBeVisible()

  const [signPopup] = await Promise.all([page.waitForEvent('popup'), page.click('#sign-txn')])
  await signPopup.waitForLoadState()
  await expect(page.locator('#log')).toContainText('signed txn bytes:')
  await expect(page.locator('#log')).not.toContainText('sign failed')
})

test('the wallet rejecting the connection surfaces the error and leaves the dApp usable', async ({
  page,
  context
}) => {
  await installStubWallet(context, 'reject')
  await page.goto('/')

  await Promise.all([page.waitForEvent('popup'), page.click('#connect-popup')])
  await expect(page.locator('#log')).toContainText('connect failed:')
  await expect(page.locator('#log')).toContainText('User rejected')
  await expect(page.locator('#connect-popup')).toBeVisible()
})

test('closing the popup before answering rejects instead of hanging', async ({ page, context }) => {
  await installStubWallet(context, 'silent')
  await page.goto('/')

  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#connect-popup')])
  await popup.waitForLoadState()
  await popup.close()

  await expect(page.locator('#log')).toContainText('connect failed:', { timeout: 10_000 })
  await expect(page.locator('#log')).toContainText('closed')
})

test('a blocked popup shows the "allow popups" hint in the dialog instead of failing', async ({
  page,
  context
}) => {
  await installStubWallet(context, 'approve')
  await page.addInitScript(() => {
    window.open = () => null
  })
  await page.goto('/')

  await page.click('#connect-popup')
  await expect(page.locator('.bcd-panel')).toBeVisible()
  await expect(page.locator('.bcd-error')).toContainText('popup', { ignoreCase: true })
  // The dialog stays open with a button to retry.
  await expect(page.locator('.bcd-open')).toBeVisible()
})

test('in the dialog the direct tab only opens the popup from the "Open Biatec Wallet" click', async ({
  page,
  context
}) => {
  await installStubWallet(context, 'approve')
  await page.goto('/')

  await page.click('#connect')
  await page.click('[data-method="direct"]')
  await expect(page.locator('.bcd-method--active')).toContainText('Biatec Direct')
  await expect(page.locator('.bcd-open')).toBeVisible()
  // Highlighting the tab did not open a popup.
  expect(context.pages()).toHaveLength(1)

  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('.bcd-open')])
  await popup.waitForLoadState()
  expect(new URL(popup.url()).origin).toBe(WALLET_URL)

  await expect(page.locator('#log')).toContainText('connected:')
  await expect(page.locator('.bcd-panel')).toHaveCount(0)
})
