import { NetworkConfigBuilder, type WalletManagerConfig } from '@txnlab/use-wallet'
import { biatec, BIATEC_EXTRA_NETWORKS } from 'biatec-wallet-use-wallet-client'

// OPTIONAL. Without a WalletConnect project id the wallet offers Biatec Direct and Liquid Auth
// only. To also offer WalletConnect (the only way to reach a wallet on another device for
// post-quantum, Ledger and multisig accounts), get a free project id at https://cloud.reown.com
// and put it in examples/vue-ts/.env as VITE_WC_PROJECT_ID (copy .env.example).
const projectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined

// Optional: point the Liquid Auth transport at a self-hosted service (defaults to Biatec's).
const liquidOrigin = import.meta.env.VITE_LIQUID_ORIGIN as string | undefined

// use-wallet ships Algorand mainnet/testnet/betanet/fnet/localnet by default. Biatec Wallet
// also approves Voi mainnet and Aramid mainnet sessions, so this example registers those too
// using the ready-made configs this package exports.
const networks = new NetworkConfigBuilder()
  .addNetwork('voimain', BIATEC_EXTRA_NETWORKS.voimain)
  .addNetwork('aramidmain', BIATEC_EXTRA_NETWORKS.aramidmain)
  .build()

const dappMetadata = {
  name: 'use-wallet + Biatec example',
  description: 'Example dApp integrating Biatec Wallet via @txnlab/use-wallet',
  url: typeof window !== 'undefined' ? window.location.origin : '',
  icons: []
}

/**
 * `WalletManagerPlugin.install(app, config)` builds the `WalletManager` itself — unlike the
 * React example, this Vue plugin takes a plain config object rather than a pre-built instance,
 * so this file exports that config to `app.use(WalletManagerPlugin, walletManagerConfig)` in
 * main.ts.
 *
 * A single Biatec Wallet entry supports Biatec Direct (popup), Liquid Auth (passkey-linked,
 * peer-to-peer) and, when a project id is set, WalletConnect (relay-based). No `onDisplayUri` is set here, so `connect()` shows the
 * adapter's own built-in dialog — one window with a method selector on the left and the QR
 * code for whichever method is selected on the right. Only reach for `onDisplayUri` if you
 * need to replace that UI with something fully custom (see docs/API.md).
 */
export const walletManagerConfig: WalletManagerConfig = {
  wallets: [
    biatec({
      ...(projectId ? { projectId } : {}),
      // Optional: dApp metadata shown to the user inside Biatec Wallet.
      // Auto-detected from <title>/<meta description>/favicon when omitted.
      metadata: dappMetadata,
      ...(liquidOrigin ? { liquid: { origin: liquidOrigin } } : {})
    })
  ],
  networks,
  defaultNetwork: 'testnet',
  options: {
    // Persist the active network choice across reloads; verbose console logging while wiring this up.
    debug: import.meta.env.DEV
  }
}
