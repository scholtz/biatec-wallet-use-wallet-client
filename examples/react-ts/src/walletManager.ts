import { NetworkConfigBuilder, WalletManager } from '@txnlab/use-wallet'
import { biatec, biatecLiquid, BIATEC_EXTRA_NETWORKS } from 'biatec-wallet-use-wallet-client'

// Get a project id at https://cloud.reown.com and put it in examples/react-ts/.env
// as VITE_WC_PROJECT_ID (copy .env.example).
const projectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined
if (!projectId) {
  throw new Error('Set VITE_WC_PROJECT_ID in examples/react-ts/.env (see .env.example)')
}

// Optional: point the Liquid Auth transport at a self-hosted service (defaults to Biatec's).
const liquidOrigin = import.meta.env.VITE_LIQUID_ORIGIN as string | undefined

// use-wallet ships Algorand mainnet/testnet/betanet/fnet/localnet by default.
// Biatec Wallet also approves Voi mainnet and Aramid mainnet sessions, so we
// register those too using the ready-made configs this package exports.
const networks = new NetworkConfigBuilder()
  .addNetwork('voimain', BIATEC_EXTRA_NETWORKS.voimain)
  .addNetwork('aramidmain', BIATEC_EXTRA_NETWORKS.aramidmain)
  .build()

/**
 * Bridges the adapters' `onDisplayUri` callbacks (fired outside React, from module-scope
 * `walletManager`) into React state. `<ConnectQrDialog>` subscribes to this and renders the
 * pairing URI (a WalletConnect `wc:` URI or a Liquid Auth `liquid://` link) as a QR code plus
 * copy button — see that component for why.
 */
export const walletConnectUriEvents = new EventTarget()

const WALLET_CONNECT_URI_EVENT = 'wc-uri'
const WALLET_CONNECT_CLOSE_EVENT = 'wc-close'

export function emitWalletConnectUri(uri: string): void {
  walletConnectUriEvents.dispatchEvent(
    new CustomEvent<string>(WALLET_CONNECT_URI_EVENT, { detail: uri })
  )
}

/** Tell `<ConnectQrDialog>` to close — call this once `connect()` settles, success or failure. */
export function closeWalletConnectDialog(): void {
  walletConnectUriEvents.dispatchEvent(new Event(WALLET_CONNECT_CLOSE_EVENT))
}

export function onWalletConnectUri(handler: (uri: string) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<string>).detail)
  walletConnectUriEvents.addEventListener(WALLET_CONNECT_URI_EVENT, listener)
  return () => walletConnectUriEvents.removeEventListener(WALLET_CONNECT_URI_EVENT, listener)
}

export function onWalletConnectClose(handler: () => void): () => void {
  walletConnectUriEvents.addEventListener(WALLET_CONNECT_CLOSE_EVENT, handler)
  return () => walletConnectUriEvents.removeEventListener(WALLET_CONNECT_CLOSE_EVENT, handler)
}

const dappMetadata = {
  name: 'use-wallet + Biatec example',
  description: 'Example dApp integrating Biatec Wallet via @txnlab/use-wallet',
  url: typeof window !== 'undefined' ? window.location.origin : '',
  icons: []
}

/**
 * The single WalletManager instance for the app. Create it once, outside any
 * component, and pass it to <WalletProvider manager={walletManager}>.
 *
 * Both Biatec Wallet transports are registered so the picker shows two entries:
 * WalletConnect (relay-based) and Liquid Auth (passkey-linked, peer-to-peer). Add
 * pera()/defly()/etc. from their own @txnlab/use-wallet-* packages for more choices.
 */
export const walletManager = new WalletManager({
  wallets: [
    biatec({
      projectId,
      // Optional: dApp metadata shown to the user inside Biatec Wallet.
      // Auto-detected from <title>/<meta description>/favicon when omitted.
      metadata: dappMetadata,
      // Skip the built-in WalletConnect modal (wallet explorer, "copy link", etc.) and show
      // only a QR code + copy button instead — see <ConnectQrDialog>.
      onDisplayUri: (uri) => emitWalletConnectUri(uri)
    }),
    biatecLiquid({
      ...(liquidOrigin ? { origin: liquidOrigin } : {}),
      metadata: dappMetadata,
      // Same dialog: the QR code now encodes the liquid:// link the wallet scans.
      onDisplayUri: (uri) => emitWalletConnectUri(uri)
    })
  ],
  networks,
  defaultNetwork: 'testnet',
  options: {
    // Persist the active network choice across reloads; verbose console logging while wiring this up.
    debug: import.meta.env.DEV
  }
})
