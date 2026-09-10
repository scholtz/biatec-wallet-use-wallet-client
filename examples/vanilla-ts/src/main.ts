import algosdk from 'algosdk'
import QRCode from 'qrcode'
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

// --- WalletConnect pairing dialog: just a QR code + copy button, no wallet explorer. ---
// biatec()'s onDisplayUri receives the pairing URI instead of the default WalletConnect modal
// opening itself; we render it into the <dialog id="wc-dialog"> from index.html.
const wcDialog = $<HTMLDialogElement>('wc-dialog')
const wcQr = $<HTMLImageElement>('wc-qr')
const wcCopy = $<HTMLButtonElement>('wc-copy')

let currentUri = ''

async function showWalletConnectDialog(uri: string) {
  currentUri = uri
  wcQr.src = await QRCode.toDataURL(uri, { width: 280, margin: 1 })
  wcDialog.showModal()
}

function closeWalletConnectDialog() {
  wcDialog.close()
}

wcCopy.onclick = async () => {
  await navigator.clipboard.writeText(currentUri)
  wcCopy.textContent = 'Copied!'
  setTimeout(() => (wcCopy.textContent = 'Copy connection string'), 2000)
}
$<HTMLButtonElement>('wc-cancel').onclick = () => wcDialog.close()
wcDialog.onclick = (e) => {
  if (e.target === wcDialog) wcDialog.close() // click on the ::backdrop
}

const manager = new WalletManager({
  wallets: [
    biatec({
      projectId,
      onDisplayUri: (uri) => showWalletConnectDialog(uri)
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
  } finally {
    closeWalletConnectDialog()
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
