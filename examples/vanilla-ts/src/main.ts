import algosdk from 'algosdk'
import { NetworkConfigBuilder, ScopeType, WalletManager } from '@txnlab/use-wallet'
import { biatec, BIATEC_EXTRA_NETWORKS } from 'biatec-wallet-use-wallet-client'

// Get one at https://cloud.reown.com and put it in examples/vanilla-ts/.env as VITE_WC_PROJECT_ID
const projectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined
if (!projectId) {
  throw new Error('Set VITE_WC_PROJECT_ID in examples/vanilla-ts/.env')
}

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
// with a method selector (WalletConnect / Liquid Auth) on the left and the QR code for whichever
// method is selected on the right — see src/connect-dialog.ts in the adapter package.
const manager = new WalletManager({
  wallets: [biatec({ projectId })],
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

$('disconnect').onclick = () => wallet.disconnect()

$('sign-txn').onclick = async () => {
  const sender = wallet.activeAddress!
  const suggestedParams = await manager.algodClient.getTransactionParams().do()
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender,
    receiver: sender,
    amount: 0,
    suggestedParams
  })
  const signed = await wallet.signTransactions([txn])
  log('signed txn bytes:', signed[0]?.length)
}

$('sign-data').onclick = async () => {
  const data = btoa('Hello from use-wallet + Biatec Wallet')
  const result = await wallet.signData(data, { scope: ScopeType.AUTH, encoding: 'base64' })
  log('signature (base64):', btoa(String.fromCharCode(...result.signature)))
}

await manager.resumeSessions()
render()
log('ready; active network:', manager.activeNetwork)
