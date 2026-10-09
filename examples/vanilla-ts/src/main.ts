import algosdk from 'algosdk'
import { NetworkConfigBuilder, ScopeType, WalletManager } from '@txnlab/use-wallet'
import { biatec, BIATEC_EXTRA_NETWORKS } from 'biatec-wallet-use-wallet-client'

// OPTIONAL. Without a WalletConnect project id only Biatec Direct and Liquid Auth are offered.
// Get one at https://cloud.reown.com and put it in examples/vanilla-ts/.env as VITE_WC_PROJECT_ID
// to also offer WalletConnect (needed for a wallet on another device with post-quantum, Ledger or
// multisig accounts).
const projectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined

const networks = new NetworkConfigBuilder()
  .addNetwork('voimain', BIATEC_EXTRA_NETWORKS.voimain)
  .addNetwork('aramidmain', BIATEC_EXTRA_NETWORKS.aramidmain)
  .build()

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

// --- Light/dark mode toggle -------------------------------------------------------- //
// The inline script in index.html's <head> already applied any stored choice before first
// paint (no flash on reload); this just wires up the button and keeps its icon/label in sync.
// The adapter's own built-in connect dialog (src/connect-dialog.ts) reads the same
// `data-theme` attribute on <html>, so it always matches whatever the page is showing.
const THEME_STORAGE_KEY = 'biatec-example-theme'
const themeToggle = $<HTMLButtonElement>('theme-toggle')

function currentTheme(): 'light' | 'dark' {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙'
  themeToggle.setAttribute(
    'aria-label',
    theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  )
}

applyTheme(currentTheme())
themeToggle.onclick = () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark')

// No `onDisplayUri` here, so `connect()` shows the adapter's own built-in dialog: one window
// with a method selector (Biatec Direct / Liquid Auth, plus WalletConnect when a project id is set) on the left and the content for whichever
// method is selected on the right — see src/connect-dialog.ts in the adapter package.
// Only for local/e2e wallet development: point the Direct popup at another wallet origin.
// Leave VITE_DIRECT_WALLET_URL unset to use https://wallet.biatec.io.
const directWalletUrl = import.meta.env.VITE_DIRECT_WALLET_URL as string | undefined

const manager = new WalletManager({
  wallets: [
    biatec({
      ...(projectId ? { projectId } : {}),
      ...(directWalletUrl ? { direct: { walletUrl: directWalletUrl } } : {})
    })
  ],
  networks,
  defaultNetwork: 'testnet',
  options: { debug: true }
})

const wallet = manager.getWallet('biatec')!

const log = (...args: unknown[]) => {
  $('log').textContent +=
    args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n'
}

const networkSelect = $<HTMLSelectElement>('network')
for (const id of Object.keys(manager.networkConfig)) {
  const option = document.createElement('option')
  option.value = id
  option.textContent = id
  networkSelect.append(option)
}
networkSelect.value = manager.activeNetwork
networkSelect.onchange = async () => {
  await manager.setActiveNetwork(networkSelect.value)
  log('active network:', manager.activeNetwork)
}

function render() {
  const connected = wallet.isConnected
  $('connect').hidden = connected
  $('connect-popup').hidden = connected
  $('disconnect').hidden = !connected
  $('sign-txn').hidden = !connected
  $('sign-data').hidden = !connected
}

manager.subscribe(render)

$('connect').onclick = async () => {
  try {
    const accounts = await wallet.connect()
    log('connected:', accounts)
  } catch (e) {
    log('connect failed:', String(e))
  }
}

// Biatec Direct: `connect({ method: 'direct' })` is called straight from the click handler (no
// await before it), so the browser lets the wallet popup open.
$('connect-popup').onclick = async () => {
  try {
    const accounts = await wallet.connect({ method: 'direct' })
    log('connected (popup):', accounts)
  } catch (e) {
    log('connect failed:', String(e))
  }
}

$('disconnect').onclick = () => wallet.disconnect()

// Suggested params are fetched BEFORE the click (and refreshed on a timer), so the click handler
// can build the transaction and call signTransactions with NO `await` in between: the Biatec
// Direct popup must be opened inside the user's gesture or the browser blocks it.
let cachedParams: algosdk.SuggestedParams | null = null
const refreshParams = () =>
  manager.algodClient
    .getTransactionParams()
    .do()
    .then((params) => (cachedParams = params))
    .catch(() => undefined)
void refreshParams()
setInterval(refreshParams, 20_000)
manager.subscribe(() => void refreshParams()) // also after a network switch / connect

$('sign-txn').onclick = async () => {
  try {
    const sender = wallet.activeAddress!
    const suggestedParams = cachedParams
    if (!suggestedParams) {
      log('suggested params not loaded yet; click again in a moment')
      return
    }
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender,
      receiver: sender,
      amount: 0,
      suggestedParams
    })
    const signed = await wallet.signTransactions([txn])
    log('signed txn bytes:', signed[0]?.length)
  } catch (e) {
    if (e instanceof Error && e.name === 'PopupBlockedError') {
      log('popup blocked: allow popups for this site, then click again')
    } else {
      log('sign failed:', String(e))
    }
  }
}

$('sign-data').onclick = async () => {
  const data = btoa('Hello from use-wallet + Biatec Wallet')
  const result = await wallet.signData(data, { scope: ScopeType.AUTH, encoding: 'base64' })
  log('signature (base64):', btoa(String.fromCharCode(...result.signature)))
}

await manager.resumeSessions()
render()
log('ready; active network:', manager.activeNetwork)
