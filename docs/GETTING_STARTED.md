# Getting started

A from-scratch walkthrough for adding Biatec Wallet support to a dApp. If you'd rather read
working code, see [`examples/vanilla-ts`](../examples/vanilla-ts) and
[`examples/react-ts`](../examples/react-ts) — this guide explains the same code in more detail.

If you (or your AI coding assistant) want this done automatically, see the
[integration skill](../skill/biatec-wallet-integration/SKILL.md) instead — it's a step-by-step
playbook written for AI agents to execute directly.

## 1. Get a WalletConnect project id

Biatec Wallet connects over WalletConnect v2. Your dApp is the WalletConnect _client_, so it needs
a project id from **your** account, free, at <https://cloud.reown.com>. Biatec Wallet itself needs
no configuration on your part — it already knows how to receive pairing requests.

Store it in an env var, e.g. `VITE_WC_PROJECT_ID` (Vite), `NEXT_PUBLIC_WC_PROJECT_ID` (Next.js), or
`process.env.WC_PROJECT_ID` server-side-rendered. Never hardcode it — while it isn't a secret
credential (it only identifies the relay quota, not private data), it does vary per environment.

## 2. Install

```bash
pnpm add @txnlab/use-wallet algosdk biatec-wallet-use-wallet-client
# React: also add @txnlab/use-wallet-react
# Vue:   also add @txnlab/use-wallet-vue
# Solid: also add @txnlab/use-wallet-solid
# Svelte: also add @txnlab/use-wallet-svelte
```

`@txnlab/use-wallet` and `algosdk` are peer dependencies of this package — install them explicitly
so their versions are under your control. The WalletConnect SDKs are regular dependencies of this
package and need no separate install.

## 3. Create the `WalletManager`

This is the one piece of setup every framework shares. Create it **once**, at module scope (not
inside a component/render function), so reconnecting on every re-render doesn't happen:

```ts
// src/walletManager.ts
import { WalletManager } from '@txnlab/use-wallet'
import { biatec } from 'biatec-wallet-use-wallet-client'

export const walletManager = new WalletManager({
  wallets: [
    biatec({
      projectId: import.meta.env.VITE_WC_PROJECT_ID, // or process.env.* — see step 1
      metadata: {
        name: 'My dApp',
        description: 'What my dApp does',
        url: 'https://my-dapp.example',
        icons: ['https://my-dapp.example/icon.png']
      }
    })
  ],
  defaultNetwork: 'testnet'
})
```

`metadata` here is optional — if you omit it, the adapter reads `<title>`, `<meta description>`,
and favicon `<link>` tags from the page automatically. Set it explicitly for a stable, intentional
name/icon inside Biatec Wallet's approval screen.

`biatec()` registers **one** wallet that supports both WalletConnect and Liquid Auth (a
passkey-linked, peer-to-peer WebRTC transport — no relay in the signing path) — Liquid Auth is
enabled by default with Biatec's hosted service. When the user calls `connect()`, they get a
built-in picker between the two; pass `liquid: false` to disable Liquid Auth and always connect
over WalletConnect instead. See [§ 9](#9-liquid-auth-and-the-method-picker) below.

## 4. Wire it into your framework

### Vanilla / any framework without a use-wallet binding

```ts
import { walletManager } from './walletManager'

const wallet = walletManager.getWallet('biatec')!

await walletManager.resumeSessions() // restores a session from localStorage, if any

connectButton.onclick = () => wallet.connect()
disconnectButton.onclick = () => wallet.disconnect()

walletManager.subscribe(() => {
  addressLabel.textContent = wallet.activeAddress ?? '(not connected)'
})
```

### React

```tsx
// main.tsx
import { WalletProvider } from '@txnlab/use-wallet-react'
import { walletManager } from './walletManager'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <WalletProvider manager={walletManager}>
    <App />
  </WalletProvider>
)
```

```tsx
// Anywhere inside <WalletProvider>
import { useWallet } from '@txnlab/use-wallet-react'

function ConnectButton() {
  const { wallets, activeAddress } = useWallet()
  const biatecWallet = wallets.find((w) => w.id === 'biatec')!

  if (activeAddress) {
    return <button onClick={() => biatecWallet.disconnect()}>Disconnect {activeAddress}</button>
  }
  return <button onClick={() => biatecWallet.connect()}>Connect Biatec Wallet</button>
}
```

`WalletProvider` calls `resumeSessions()` for you on mount — don't call it again yourself.

### Vue

`WalletManagerPlugin` builds the `WalletManager` for you — give it the **config object**, not an
instance (so skip the standalone `walletManager.ts` from step 3 for Vue and inline the config):

```ts
// main.ts
import { createApp } from 'vue'
import { WalletManagerPlugin } from '@txnlab/use-wallet-vue'
import { biatec } from 'biatec-wallet-use-wallet-client'

createApp(App)
  .use(WalletManagerPlugin, {
    wallets: [biatec({ projectId: import.meta.env.VITE_WC_PROJECT_ID })],
    defaultNetwork: 'testnet'
  })
  .mount('#app')
```

```vue
<script setup>
import { computed } from 'vue'
import { useWallet } from '@txnlab/use-wallet-vue'
const { wallets, activeAddress } = useWallet()
const biatecWallet = computed(() => wallets.value.find((w) => w.id === 'biatec'))
</script>
<template>
  <button v-if="!activeAddress" @click="biatecWallet.connect()">Connect</button>
  <button v-else @click="biatecWallet.disconnect()">Disconnect {{ activeAddress }}</button>
</template>
```

### Solid / Svelte

Same shape as React/Vue — `@txnlab/use-wallet-solid` and `@txnlab/use-wallet-svelte` each expose
their own `useWallet()` composable/store with an identical field set (`wallets`, `activeAddress`,
`signTransactions`, `signData`, …). See the
[use-wallet docs](https://txnlab.gitbook.io/use-wallet) for the exact binding syntax.

## 5. Sign a transaction (ARC-0001)

```ts
import algosdk from 'algosdk'

const suggestedParams = await walletManager.algodClient.getTransactionParams().do()
const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
  sender: wallet.activeAddress!,
  receiver: 'RECEIVER_ADDRESS',
  amount: 1_000_000, // microAlgos
  suggestedParams
})

const [signedBytes] = await wallet.signTransactions([txn])
if (signedBytes) {
  const { txid } = await walletManager.algodClient.sendRawTransaction(signedBytes).do()
}
```

For a transaction group where some transactions are signed by other parties (multisig-style
flows, atomic swaps), pass the _entire_ group and an `indexesToSign` array naming which positions
this wallet should sign; the rest come back `null` and you merge in the other signatures yourself.
With `algosdk.AtomicTransactionComposer`, use `wallet.transactionSigner` directly as the `signer`
for that account's transactions instead of calling `signTransactions` yourself.

## 6. Sign arbitrary data (ARC-0060), optional

```ts
import { ScopeType } from '@txnlab/use-wallet'

const message = `Sign in to My dApp — ${new Date().toISOString()}`
const data = btoa(message) // must be base64

const { signature } = await wallet.signData(data, { scope: ScopeType.AUTH, encoding: 'base64' })
```

Check `wallet.canSignData` before showing a "sign in" button — it's `false` if you constructed
`biatec({ enableSignData: false })`. See [docs/API.md](API.md#signdata) for the full contract and
error codes.

## 7. Optional: Voi and Aramid networks

`@txnlab/use-wallet` ships Algorand mainnet/testnet/betanet/fnet/localnet. Biatec Wallet also
approves sessions for Voi mainnet and Aramid mainnet — register them if your dApp needs them:

```ts
import { NetworkConfigBuilder, WalletManager } from '@txnlab/use-wallet'
import { biatec, BIATEC_EXTRA_NETWORKS } from 'biatec-wallet-use-wallet-client'

const networks = new NetworkConfigBuilder()
  .addNetwork('voimain', BIATEC_EXTRA_NETWORKS.voimain)
  .addNetwork('aramidmain', BIATEC_EXTRA_NETWORKS.aramidmain)
  .build()

export const walletManager = new WalletManager({
  wallets: [biatec({ projectId })],
  networks,
  defaultNetwork: 'testnet'
})
```

Switching `walletManager.setActiveNetwork('voimain')` (or the framework hook's `setActiveNetwork`)
does **not** require reconnecting — every configured network's chain id is requested as an
optional chain up front. See [docs/ARCHITECTURE.md](ARCHITECTURE.md#multi-chain-sessions).

## 8. Custom QR UI (QR code + copy button only)

By default `connect()` shows a built-in dialog with just the raw pairing/session link and a copy
button (or, with `useWalletConnectModal: true`, the full WalletConnect modal — a QR code, "copy
link", a wallet explorer, and other wallets' links). Pass `onDisplayUri` to receive the raw
string yourself and render **only** a QR code and a copy button instead:

```ts
biatec({
  projectId,
  onDisplayUri: (uri, info) => {
    // info.method is 'walletconnect' or 'liquid' — whichever the user picked
    showMyQrDialog(uri, info) // your own component; hide it once connect() resolves or throws
  }
})
```

`connect()` still resolves once the user approves in Biatec Wallet, so a `try { await
wallet.connect() } finally { hideMyQrDialog() }` pattern works well — call your close function in
a `finally` block so the dialog also disappears if the user cancels or the connection fails, not
only on success.

For a complete, working implementation of exactly this (QR code rendered with the
[`qrcode`](https://www.npmjs.com/package/qrcode) package, plus a "Copy connection string" button,
nothing else), see:

- **React**: [`examples/react-ts/src/ConnectQrDialog.tsx`](../examples/react-ts/src/ConnectQrDialog.tsx)
  — a modal component that subscribes to `onDisplayUri` via a small `EventTarget` bridge defined
  in [`walletManager.ts`](../examples/react-ts/src/walletManager.ts) (needed because the
  `WalletManager`/`biatec()` config is created once at module scope, outside React, so
  `onDisplayUri` can't call `useState` directly — it emits an event that the component listens
  for instead).
- **Vanilla**: [`examples/vanilla-ts/src/main.ts`](../examples/vanilla-ts/src/main.ts) — uses the
  native `<dialog>` element (see the matching markup in
  [`index.html`](../examples/vanilla-ts/index.html)); no event bridge needed since the whole app
  is already plain imperative code.

Both call `navigator.clipboard.writeText(uri)` for the copy button — that API requires a secure
context (`https://` or `localhost`), which any real deployment already has.

## 9. Liquid Auth and the method picker

Liquid Auth (a passkey-linked, peer-to-peer WebRTC connection with no WalletConnect relay in the
signing path) is enabled by default alongside WalletConnect — it's the `liquid` option on
`biatec()`, not a separate factory:

```ts
biatec({
  projectId, // still required even if every user ends up on Liquid Auth
  liquid: {
    // origin: 'https://liquid.biatec.io' // Biatec-hosted service (default)
  }
})
```

With both transports enabled, calling `wallet.connect()` with no arguments shows a built-in
picker (Biatec logo, "Connect with WalletConnect" / "Connect with Liquid Auth (Passkey)"). To
build your own picker instead, call `wallet.connect({ method: 'liquid' })` or
`wallet.connect({ method: 'walletconnect' })` directly and skip the built-in one. To disable
Liquid Auth entirely and always go straight to WalletConnect, pass `liquid: false`.

Once connected, the user opens Biatec Wallet → Connect → Liquid Auth (or scans the QR your
`onDisplayUri` renders), pastes/scans the link, and approves with a passkey; `connect()` resolves
with the linked account exactly like the WalletConnect path. Everything else
(`signTransactions`, `signData`, network switching) is identical regardless of which transport
connected. Read [docs/LIQUID_AUTH_PROTOCOL.md](LIQUID_AUTH_PROTOCOL.md) for how it works and what
the service deployment needs.

## Next steps

- [docs/API.md](API.md) — full option/method reference.
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — how the WalletConnect session, chain negotiation, and
  signing flows actually work.
- [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md) — fixes for the errors you're most likely to hit.
- [../examples](../examples) — full working apps you can `pnpm dev` and click through.
