# Getting started

A from-scratch walkthrough for adding Biatec Wallet support to a dApp. If you'd rather read
working code, see [`examples/vanilla-ts`](../examples/vanilla-ts) and
[`examples/react-ts`](../examples/react-ts) — this guide explains the same code in more detail.

If you (or your AI coding assistant) want this done automatically, see the
[integration skill](../skill/biatec-wallet-integration/SKILL.md) instead — it's a step-by-step
playbook written for AI agents to execute directly.

## 1. Nothing to sign up for

You do **not** need a WalletConnect project id, or any account, to get started. The default
`biatec()` offers two connection methods that need no configuration on your part:

- **Biatec Direct**: Biatec Wallet in a popup, same browser, any account type the wallet can sign
  for itself (including Ledger, multisig and post-quantum).
- **Liquid Auth**: passkey + peer-to-peer WebRTC, so the wallet can be on another device, but only
  for plain and HD accounts (not Ledger, post-quantum or multisig).

**WalletConnect is optional.** It needs a free project id from <https://cloud.reown.com> and is
currently the only method that lets a wallet on a **remote device** connect for key types Liquid
Auth does not support (post-quantum, Ledger, multisig). If your users need that, follow
[section 11](#11-adding-walletconnect-optional) later; the steps below work without it.

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

`biatec()` registers **one** wallet that supports Direct (popup), Liquid Auth (a
passkey-linked, peer-to-peer WebRTC transport — no relay in the signing path) and, when you pass a
`projectId`, WalletConnect. Direct and Liquid Auth are enabled by default (Liquid Auth with
Biatec's hosted service). When the user calls `connect()`, they get a built-in picker between the
enabled methods; with a `projectId`, pass `liquid: false, direct: false` to always connect over
WalletConnect instead. See [§ 9](#9-liquid-auth-and-the-method-picker) below.

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
    wallets: [biatec()],
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
  wallets: [biatec()],
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
  onDisplayUri: (uri, info) => {
    // info.method is 'direct', 'liquid' or (with a projectId) 'walletconnect'
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

> Besides Liquid Auth there is **Direct (popup)** — see [section 10](#10-direct-popup-no-relay-no-qr-code)
> — and, only with a `projectId`, WalletConnect. The built-in dialog lists the enabled ones, Direct first, and pre-selects Direct (its popup only opens
> from the _Open Biatec Wallet_ click). Pass `defaultMethod: 'walletconnect'` to show the QR first; with
> your own `onDisplayUri` WalletConnect stays the default.

Liquid Auth (a passkey-linked, peer-to-peer WebRTC connection with no WalletConnect relay in the
signing path) is enabled by default — it's the `liquid` option on
`biatec()`, not a separate factory:

```ts
biatec({
  liquid: {
    // origin: 'https://liquid.biatec.io' // Biatec-hosted service (default)
  }
})
```

With several methods enabled (the default), calling `wallet.connect()` with no arguments shows a built-in,
dark/light-aware dialog: a method selector (Biatec Direct / Liquid Auth, plus WalletConnect when a `projectId` is set) next to a
live QR code (or an Open Biatec Wallet button, for Direct) for whichever one is selected. Biatec Direct is selected by default (idle, with the button); clicking the WalletConnect or Liquid Auth tab connects
that transport and shows its QR instead (pass `defaultMethod: 'walletconnect'` to show the QR immediately). To build your own
picker, call `wallet.connect({ method: 'liquid' })` or `wallet.connect({ method: 'walletconnect' })`
directly and skip the built-in one (`'walletconnect'` needs a `projectId`). To always go straight to
WalletConnect (no picker), pass `projectId` plus `liquid: false, direct: false`.

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
// Direct only. (No projectId is needed for any of the default methods.)
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
- `biatec({ defaultMethod: 'direct' })` pre-selects explicitly (and, on `connect()`, immediately
  starts) the popup; without `defaultMethod`, Direct is pre-selected but only opens on the button click — only do that when `connect()` is called from a click.
- The wallet decides which accounts the site may use (`enable` returns the accounts the user
  ticked). Switching `setActiveNetwork()` to a network the wallet isn't on fails with
  `DirectNetworkMismatchError` (`4004`).
- Local wallet development: `biatec({ …, direct: { walletUrl: 'http://localhost:8080' } })`
  (https or `localhost`/`127.0.0.1` only; logs a warning).

The full protocol and security rules are in [DIRECT_PROTOCOL.md](DIRECT_PROTOCOL.md).

## 11. Adding WalletConnect (optional)

WalletConnect is the relay-based method (QR code / deep link). It is **not mandatory**, but today
it is the only method that connects a wallet on a **remote device** for **post-quantum
(Falcon-1024), Ledger and multisig accounts**; Liquid Auth cannot sign for those, and Direct only
works when the wallet runs in the same browser as your dApp. Add it when your users need that.

1. Create a free project at <https://cloud.reown.com> and copy its project id. Your dApp is the
   WalletConnect _client_, so the id belongs to **your** account; Biatec Wallet itself needs no
   configuration.
2. Keep it in an env var (`VITE_WC_PROJECT_ID` for Vite, `NEXT_PUBLIC_WC_PROJECT_ID` for Next.js).
   It is not a secret (it only identifies the relay quota), but it varies per environment.
3. Pass it only when set, so the same code works with and without it:

   ```ts
   const projectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined

   biatec({
     // exactOptionalPropertyTypes-safe: omit the key rather than passing undefined
     ...(projectId ? { projectId } : {})
   })
   ```

The dialog then lists Direct, WalletConnect and Liquid Auth. An empty or missing `projectId` just
leaves WalletConnect out (nothing throws). `walletconnect: false` disables it even when an id is
given. Related options: `relayUrl`, `chains` and `metadata`; the first two only take effect with
a `projectId` (a warning is logged otherwise).

## Next steps

- [docs/API.md](API.md) — full option/method reference.
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — how the WalletConnect session, chain negotiation, and
  signing flows actually work.
- [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md) — fixes for the errors you're most likely to hit.
- [../examples](../examples) — full working apps you can `pnpm dev` and click through.
