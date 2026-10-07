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
built-in picker between the enabled methods; pass `liquid: false, direct: false` to disable Liquid
Auth and Direct and always connect over WalletConnect instead. See [§ 9](#9-liquid-auth-and-the-method-picker) below.

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

## 8. Custom pairing UI (advanced, optional)

By default `connect()` shows the adapter's own built-in dialog — one window with a method
selector on the left (when more than one method is enabled) and a QR code, the raw pairing/session
link, and a copy button on the right. Both example apps in this repo use exactly this default
(no `onDisplayUri` set) — open one of them (`pnpm --filter example-vanilla-ts dev` or
`example-react-ts`) to see it.

Most dApps don't need to replace it. If you do want full control over the pairing UI, pass
`onDisplayUri` to receive the raw string yourself instead:

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
only on success. Setting `onDisplayUri` still leaves the built-in method selector in place when
more than one method is enabled (it only replaces the QR/link step); render your own QR code with a
library such as [`qrcode`](https://www.npmjs.com/package/qrcode), and remember
`navigator.clipboard.writeText()` for a copy button requires a secure context (`https://` or
`localhost`).

## 9. Liquid Auth and the method picker

> There is also a third method, **Direct (popup)** — see [section 10](#10-direct-popup-no-relay-no-qr-code).
> The built-in dialog lists all three; WalletConnect stays the pre-selected tab unless you pass
> `defaultMethod`.

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

With several methods enabled (the default), calling `wallet.connect()` with no arguments shows a built-in,
dark/light-aware dialog: a method selector (WalletConnect / Liquid Auth / Biatec Direct) next to a
live QR code (or an Open Biatec Wallet button, for Direct) for whichever one is selected. WalletConnect is selected by default so its QR shows immediately;
clicking the Liquid Auth tab connects that transport and shows its QR instead. To build your own
picker, call `wallet.connect({ method: 'liquid' })` or `wallet.connect({ method: 'walletconnect' })`
directly and skip the built-in one. To always go straight to WalletConnect (no picker),
pass `liquid: false, direct: false`.

Once connected, the user opens Biatec Wallet → Connect → Liquid Auth (or scans the QR your
`onDisplayUri` renders), pastes/scans the link, and approves with a passkey; `connect()` resolves
with the linked account exactly like the WalletConnect path. Everything else
(`signTransactions`, `signData`, network switching) is identical regardless of which transport
connected. Read [docs/LIQUID_AUTH_PROTOCOL.md](LIQUID_AUTH_PROTOCOL.md) for how it works and what
the service deployment needs.

## 10. Direct (popup): no relay, no QR code

`direct` opens Biatec Wallet in a popup and talks to it over `window.postMessage`. It needs no
WalletConnect project id, no Liquid Auth service and no internet round-trip other than loading
the wallet itself, and it works for `http://localhost` dApps.

```ts
// Direct only — projectId can be omitted because WalletConnect is switched off.
const manager = new WalletManager({
  wallets: [biatec({ walletconnect: false, liquid: false })],
  networks
})
const wallet = manager.getWallet('biatec')!

// Must run inside a click handler, with no `await` before the call.
connectButton.onclick = () => wallet.connect({ method: 'direct' })
```

Things to know:

- **Start it from a user gesture.** Browsers only let `window.open` through when it is called
  synchronously from a click/tap. `connect()`, `signTransactions()` and `signData()` each open a
  fresh popup (the wallet answers exactly one request per popup), so call them straight from an
  event handler — building the transaction beforehand is fine, `await`ing something _before_
  calling `signTransactions` is not. If the browser blocks the popup you get a
  `PopupBlockedError`; the built-in dialog turns that into an "allow popups, then click again"
  hint.
- **Fetch everything async BEFORE the click.** An `await` (e.g. `getTransactionParams()`) between the click and `signTransactions()` can outlive the browser's user-activation window (about 1 s in Safari, or a slow node anywhere) and the popup is blocked. Load suggested params on mount / after connect / on a timer into state, build the transaction synchronously in the click handler (the shipped examples do this), and **catch `PopupBlockedError` and let the user click again** (it is not a failure of the wallet or the session).
- **Do not set `Cross-Origin-Opener-Policy: same-origin`** on your dApp: it severs the
  connection to the popup. `same-origin-allow-popups` (or no COOP header) is fine.
- With the built-in dialog, the **Biatec Direct** tab shows an _Open Biatec Wallet_ button instead
  of a QR code; selecting the tab alone never opens a popup. Calling
  `connect({ method: 'direct' })` yourself from a click skips the picker.
- `biatec({ projectId, defaultMethod: 'direct' })` pre-selects (and, on `connect()`, immediately
  starts) the popup — only do that when `connect()` is called from a click.
- The wallet decides which accounts the site may use (`enable` returns the accounts the user
  ticked). Switching `setActiveNetwork()` to a network the wallet isn't on fails with
  `DirectNetworkMismatchError` (`4004`).
- Local wallet development: `biatec({ …, direct: { walletUrl: 'http://localhost:8080' } })`
  (https or `localhost`/`127.0.0.1` only; logs a warning).

The full protocol and security rules are in [DIRECT_PROTOCOL.md](DIRECT_PROTOCOL.md).

## Next steps

- [docs/API.md](API.md) — full option/method reference.
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — how the WalletConnect session, chain negotiation, and
  signing flows actually work.
- [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md) — fixes for the errors you're most likely to hit.
- [../examples](../examples) — full working apps you can `pnpm dev` and click through.
