---
name: biatec-wallet-integration
description: Integrate Biatec Wallet (an Algorand/AVM WalletConnect wallet at wallet.biatec.io) into a dApp using @txnlab/use-wallet v5 and the biatec-wallet-use-wallet-client adapter package. Use when a user asks to add Biatec Wallet, add an Algorand/AVM wallet connect button, wire up ARC-0001 transaction signing or ARC-0060 data signing for an Algorand app, or troubleshoot an existing Biatec Wallet / use-wallet integration.
license: MIT
---

# Biatec Wallet integration

You are integrating **Biatec Wallet**, an open-source Algorand/AVM wallet
(<https://wallet.biatec.io>), into a dApp via **`@txnlab/use-wallet` v5** and the
**`biatec-wallet-use-wallet-client`** npm adapter package
(<https://github.com/scholtz/biatec-wallet-use-wallet-client>). Follow this playbook end to end;
don't skip the verification steps at the end.

This file is portable: it works the same whether it's discovered as a Claude Code skill, copied
into a Cursor/Windsurf rules file, pasted into a Copilot instructions file, or just read directly.
It assumes no other context about the target repo — gather what you need with the steps below.

## When NOT to use this

- The dApp already has a working `@txnlab/use-wallet` v5 setup with Biatec Wallet registered and
  the ask is unrelated (e.g. "add Pera Wallet too") — still relevant context, but go straight to
  [Step 7](#7-optional-add-more-wallets-alongside-biatec-wallet) instead of starting from scratch.
- The project uses `@txnlab/use-wallet` **v3/v4** (the old `WalletId` enum API) or a different
  wallet library entirely (`@blockshake/defly-connect` direct, `@perawallet/connect` direct,
  `avm-wallet`, …). This package targets v5 only. Either propose migrating to v5 first (large,
  confirm with the user before doing it) or fall back to `custom()` / a raw WalletConnect
  integration — say so explicitly rather than silently forcing a v5 upgrade.

## 0. Gather context first

Before writing anything, determine:

1. **Package manager**: look for `pnpm-lock.yaml` / `yarn.lock` / `package-lock.json` /
   `bun.lock` in the repo root and use that one consistently. Default to `npm` only if none exist.
2. **Framework**: check `package.json` dependencies for `react`, `vue`, `solid-js`, `svelte` (and
   their meta-frameworks: `next`, `nuxt`, `sveltekit`, `astro`, …), or none (vanilla
   TS/JS). This decides which framework binding package to add in
   [Step 1](#1-install-dependencies) and how [Step 4](#4-wire-up-the-ui) is written.
3. **Existing use-wallet setup**: search for `WalletManager(` and `@txnlab/use-wallet` imports. If
   found, you're **adding** Biatec Wallet to an existing `wallets: [...]` array, not creating a
   new manager — go to [Step 7](#7-optional-add-more-wallets-alongside-biatec-wallet) for the
   registration snippet and skip re-creating the provider/plugin wiring.
4. **A WalletConnect Cloud project id**: search env files (`.env`, `.env.local`, `.env.example`)
   and the codebase for an existing `WC_PROJECT_ID` / `WALLETCONNECT_PROJECT_ID` / similar — many
   dApps already have one from another wallet integration (Pera, Defly, …), and the **same** id
   works for Biatec Wallet (it identifies your dApp to the relay, not the wallet). If none exists,
   tell the user to create one at <https://cloud.reown.com> (free) — you cannot generate this
   value yourself. Ask for it or add a placeholder env var and clearly flag it as required.

## 1. Install dependencies

Always required:

```bash
<pkg-manager> add @txnlab/use-wallet algosdk biatec-wallet-use-wallet-client
```

Add exactly one framework binding, matching what you found in Step 0:

| Framework                | Add                                              |
| ------------------------ | ------------------------------------------------ |
| React (incl. Next.js)    | `@txnlab/use-wallet-react`                       |
| Vue (incl. Nuxt)         | `@txnlab/use-wallet-vue`                         |
| Solid                    | `@txnlab/use-wallet-solid`                       |
| Svelte (incl. SvelteKit) | `@txnlab/use-wallet-svelte`                      |
| none / vanilla           | _(nothing extra — use `WalletManager` directly)_ |

`@txnlab/use-wallet` and `algosdk` are **peer dependencies** of `biatec-wallet-use-wallet-client` —
install them explicitly (done above) rather than relying on transitive resolution.

## 2. Create the `WalletManager`

Create **one** file for this, at module scope — never inside a component/render function (that
would reconnect on every re-render). Exact placement:

- React/Solid/Svelte: a plain module, e.g. `src/walletManager.ts`, imported by your app entry.
- Vue: `WalletManagerPlugin` builds the manager itself — inline the config where you call
  `app.use(...)` instead (see Step 4).
- Vanilla: same as React — a plain module.

```ts
// src/walletManager.ts  (skip for Vue — see Step 4 instead)
import { WalletManager } from '@txnlab/use-wallet'
import { biatec } from 'biatec-wallet-use-wallet-client'

export const walletManager = new WalletManager({
  wallets: [
    biatec({
      projectId: /* the id from Step 0.4 — read it from an env var, don't hardcode */,
      metadata: {
        name: /* the dApp's name */,
        description: /* one sentence describing the dApp */,
        url: typeof window !== 'undefined' ? window.location.origin : '',
        icons: [/* absolute URL to an icon, or [] */]
      }
      // liquid: false // uncomment to disable Liquid Auth and always use WalletConnect — see Step 5b
    })
  ],
  defaultNetwork: 'testnet' // 'mainnet' once ready for production; see Step 5 for other networks
})
```

Read the project id from whatever env var convention the framework uses
(`import.meta.env.VITE_*` for Vite, `process.env.NEXT_PUBLIC_*` for Next.js, etc.) — **never**
hardcode it as a literal string in committed code. Add the corresponding entry to `.env.example`
if one exists. **`projectId` is required even if the dApp mainly wants Liquid Auth** (Step 5b) —
`biatec()` covers both transports under one wallet.

`metadata` is optional; omitting it makes the adapter read `<title>`/`<meta description>`/favicon
from the page at connect time. Prefer setting it explicitly for a stable, intentional presentation
inside Biatec Wallet's approval screen.

`biatec()` registers **one** wallet (id `biatec`) that supports both WalletConnect and Liquid Auth
— Liquid Auth is enabled by default. `wallet.connect()` with no arguments shows a built-in picker
letting the user choose; pass `liquid: false` to disable Liquid Auth and skip that picker entirely
(see Step 5b for when to keep it enabled).

## 3. Detect the framework and continue accordingly

Jump to the matching subsection of [Step 4](#4-wire-up-the-ui). All four follow the exact same
mental model — a `wallets` array, an `activeAddress`, `connect()`/`disconnect()` — the only
difference is how each framework exposes reactive state.

## 4. Wire up the UI

### React (incl. Next.js)

Wrap the app in `WalletProvider` once, near the root (it calls `resumeSessions()` for you on
mount — don't call it again):

```tsx
import { WalletProvider } from '@txnlab/use-wallet-react'
import { walletManager } from './walletManager'

export function Root() {
  return (
    <WalletProvider manager={walletManager}>
      <App />
    </WalletProvider>
  )
}
```

In any component under it:

```tsx
import { useWallet } from '@txnlab/use-wallet-react'

function ConnectButton() {
  const { wallets, activeAddress } = useWallet()
  const biatecWallet = wallets.find((w) => w.id === 'biatec')
  if (!biatecWallet) return null // shouldn't happen if Step 2 registered it

  if (activeAddress) {
    return <button onClick={() => biatecWallet.disconnect()}>Disconnect {activeAddress}</button>
  }
  return <button onClick={() => biatecWallet.connect()}>Connect Biatec Wallet</button>
}
```

Next.js App Router: mark the component that calls `useWallet()` / renders the connect button
`'use client'` — wallet state is inherently client-only.

### Vue (incl. Nuxt)

`WalletManagerPlugin` constructs the manager itself from a **config object** — don't build one
separately (skip Step 2's file for Vue):

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
  <button v-if="!activeAddress" @click="biatecWallet?.connect()">Connect Biatec Wallet</button>
  <button v-else @click="biatecWallet?.disconnect()">Disconnect {{ activeAddress }}</button>
</template>
```

Nuxt: put the manager setup in a client-side plugin (`plugins/wallet.client.ts`).

### Solid / Svelte

Same shape as React/Vue: `@txnlab/use-wallet-solid` / `@txnlab/use-wallet-svelte` each export a
provider component/store plus a `useWallet()` accessor with the identical field set (`wallets`,
`activeAddress`, `connect`/`disconnect` per wallet, `signTransactions`, `signData`). Mirror the
React pattern above, adapted to that framework's reactivity primitives (`createSignal`/`$store`).
If unsure of the exact syntax, check that package's own README before guessing.

### Vanilla / no framework

No provider needed — call `resumeSessions()` once yourself, then use the manager directly:

```ts
import { walletManager } from './walletManager'

const wallet = walletManager.getWallet('biatec')!

await walletManager.resumeSessions() // do this once, before rendering connected UI

connectButton.addEventListener('click', () => wallet.connect())
disconnectButton.addEventListener('click', () => wallet.disconnect())

walletManager.subscribe(() => {
  addressLabel.textContent = wallet.activeAddress ?? '(not connected)'
})
```

## 5. Default pairing UI (do nothing) / optional fully custom UI

By default — i.e. don't pass `onDisplayUri` at all — `connect()` shows the adapter's own built-in
dialog: one window with a method selector (WalletConnect / Liquid Auth, when both are enabled) on
the left and a QR code, the raw pairing/session link, and a copy button on the right, matching the
system's light/dark theme. **This is almost always the right choice** — don't build a custom
pairing dialog unless the user explicitly asks for one; just call `biatec({ projectId, ... })`
with no `onDisplayUri` and leave it there. Both example apps in this repo (`examples/react-ts`,
`examples/vanilla-ts`) do exactly this.

Only if the user explicitly wants **their own** pairing UI (not just a different look — the
built-in dialog is already themeable via their page's light/dark mode), implement this instead:

1. Add a QR code renderer: `<pkg-manager> add qrcode` (+ `@types/qrcode` as a dev dependency in a
   TypeScript project).
2. Pass `onDisplayUri` in Step 2's `biatec({...})` call — it receives the raw pairing/session
   string, plus which transport produced it, instead of the built-in dialog's QR/link step:

   ```ts
   biatec({
     projectId,
     onDisplayUri: (uri, info) => showQrDialog(uri, info) // info.method: 'walletconnect' | 'liquid'
   })
   ```

3. Build a small dialog component that renders `await QRCode.toDataURL(uri)` as an `<img>`, plus a
   button calling `navigator.clipboard.writeText(uri)`. Wrap the `wallet.connect()` call from
   Step 4 in `try { ... } finally { hideQrDialog() }` so the dialog closes whether the connection
   succeeds, fails, or is cancelled. If Liquid Auth is enabled (Step 5b, the default), the built-in
   method selector still shows first — `onDisplayUri` only replaces the QR/link step after a
   method is chosen.
4. If the framework wraps `WalletManager` construction in a module-scope file (React/Solid/Svelte,
   per Step 2) rather than component state, `onDisplayUri` fires outside the framework's reactive
   system — bridge it with a plain `EventTarget` (emit an event from `onDisplayUri`, subscribe to
   it in the dialog component's effect/lifecycle hook). Don't reach for a state-management library
   for this — one `EventTarget` is enough. Vue's `WalletManagerPlugin` and a vanilla setup don't
   need this bridge; call the dialog function directly.

## 5b. Liquid Auth transport and the method picker (enabled by default)

`biatec()` supports the Algorand Foundation's Liquid Auth protocol as a **second transport** under
the same wallet — a passkey-authenticated link, then a direct encrypted WebRTC data channel
(public Google STUN servers) — **enabled by default**, configured via the `liquid` option, not a
separate factory or wallet id:

```ts
biatec({
  projectId, // still required even if the dApp mainly wants Liquid Auth
  liquid: {
    // origin: 'https://liquid.biatec.io' // default; only change for a self-hosted service
  }
  // liquid: false // disable Liquid Auth entirely — connect() always uses WalletConnect, no picker
})
```

With both transports enabled (the default), calling `wallet.connect()` with no arguments shows a
**built-in, modern dialog**: a method selector (WalletConnect / Liquid Auth) next to a live QR
code for whichever method is selected — WalletConnect selected by default so its QR appears
immediately, with a tab to switch to Liquid Auth on demand. It follows the system's light/dark
theme automatically. Leave it as-is unless the user asks for a custom picker UI — in that case,
build your own method-selection UI and call `wallet.connect({ method: 'liquid' })` or
`wallet.connect({ method: 'walletconnect' })` directly to skip the built-in one. If the user only
wants WalletConnect (no selector at all), pass `liquid: false`.

Everything downstream (`useWallet()`, `signTransactions`, `signData`) is identical regardless of
which transport connected. Do not try to host a Liquid Auth service for the dApp: with the web
wallet the service must live under the wallet's own domain, which the default `origin` already
does. Details: `docs/LIQUID_AUTH_PROTOCOL.md` in the package repo.

## 6. Optional: register Voi mainnet / Aramid mainnet

`@txnlab/use-wallet` ships Algorand mainnet/testnet/betanet/fnet/localnet by default. Biatec Wallet
additionally approves sessions for **Voi mainnet** and **Aramid mainnet** — only add these if the
user's dApp actually targets those chains:

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

Register every network **before** the first `connect()` call — switching networks afterward with
`setActiveNetwork()` works without reconnecting only for chains that were already configured when
the session was approved.

## 7. Optional: add more wallets alongside Biatec Wallet

Biatec Wallet coexists with any other `@txnlab/use-wallet` v5 adapter in the same array — nothing
Biatec-specific needs to change:

```ts
import { pera } from '@txnlab/use-wallet-pera'
import { defly } from '@txnlab/use-wallet-defly'
import { biatec } from 'biatec-wallet-use-wallet-client'

new WalletManager({ wallets: [biatec({ projectId }), pera(), defly()] })
```

The UI code from Step 4 already iterates `wallets` generically, so a multi-wallet picker needs no
extra Biatec-specific branching — just render one button per entry in `wallets`.

## 8. Transaction signing (ARC-0001)

Wire this wherever the dApp submits an Algorand transaction. Wallet-agnostic — identical for every
`@txnlab/use-wallet` adapter, not just Biatec Wallet:

```ts
import algosdk from 'algosdk'

const suggestedParams = await walletManager.algodClient.getTransactionParams().do() // or algodClient from the framework hook
const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
  sender: activeAddress,
  receiver: 'RECEIVER_ADDRESS',
  amount: 1_000_000,
  suggestedParams
})

const [signedBytes] = await wallet.signTransactions([txn]) // wallet = the active/selected Wallet object
if (signedBytes) {
  await walletManager.algodClient.sendRawTransaction(signedBytes).do()
}
```

For `algosdk.AtomicTransactionComposer`, use `wallet.transactionSigner` directly as the `signer`
instead of calling `signTransactions` yourself.

## 9. Optional: arbitrary data signing (ARC-0060, e.g. "Sign in with Algorand")

Only wire this if the dApp needs message/auth signing, not just transactions:

```ts
import { ScopeType } from '@txnlab/use-wallet'

if (wallet.canSignData) {
  const message = `Sign in to My dApp — ${new Date().toISOString()}`
  const { signature } = await wallet.signData(btoa(message), {
    scope: ScopeType.AUTH,
    encoding: 'base64'
  })
}
```

Gate any "sign in" UI on `wallet.canSignData` — it's `false` if the dApp constructed
`biatec({ enableSignData: false })`.

## 10. Verify the integration

Run these, in order, and don't report the task done until all pass:

1. **Install succeeds**: `<pkg-manager> install` with no errors.
2. **Type-checks**: run the project's typecheck script (`tsc --noEmit`, `pnpm typecheck`, etc.).
   Fix any type errors before moving on — don't silence them with `any`/`@ts-ignore` unless the
   error is a pre-existing, unrelated one.
3. **Builds**: run the project's build script. A build failure here usually means a bundler/peer
   dependency mismatch — see the troubleshooting table below before guessing.
4. **Manual smoke test** (tell the user to do this, or do it yourself if you can run a browser):
   start the dev server, click the connect button, confirm a WalletConnect URI/QR appears, and
   (if a real Biatec Wallet instance is available) approve the pairing and confirm the address
   renders. This step needs a live WalletConnect Cloud project id — a placeholder value fails here
   with `No URI found`, which is expected until a real id is set.

## Troubleshooting quick reference

| Symptom                                                                            | Likely cause                                                                       | Fix                                                                                                                             |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Missing required option: projectId`                                               | Env var not set, wrong prefix, or `.env` not loaded                                | Confirm the exact env var name the framework requires (e.g. `VITE_` / `NEXT_PUBLIC_` prefix) and that it's non-empty at runtime |
| `No URI found` / connect hangs                                                     | Invalid/placeholder WalletConnect project id, or relay unreachable                 | Get a real id from <https://cloud.reown.com>; check its dashboard for rejected requests                                         |
| Modal never opens                                                                  | CSP blocks `wss://relay.walletconnect.com`, or `onDisplayUri` set but not rendered | Add the relay host to `connect-src`; confirm your custom URI handler actually shows something                                   |
| `Network "<id>" has no caipChainId`                                                | Custom `NetworkConfig` missing that field, or `defaultNetwork` typo'd              | Use `BIATEC_EXTRA_NETWORKS`/`caipChainIdFromGenesisHash`, or fix the typo                                                       |
| `SessionError: No session found!`                                                  | Signing called before `connect()`/`resumeSession()` resolved                       | Gate sign actions on `wallet.isConnected`; call `resumeSessions()` before rendering connected UI in vanilla setups              |
| Signing breaks right after `setActiveNetwork()`                                    | New network wasn't registered before the session was approved                      | Reconnect once after adding a network, or register every network before first `connect()`                                       |
| `@vitejs/plugin-react` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED ... './internal'` | `@vitejs/plugin-react` 6.x needs Vite 8; an older `vite` is pinned                 | Bump `vite` to match the plugin's peer requirement                                                                              |
| `[ERR_PNPM_IGNORED_BUILDS]`                                                        | pnpm 10+ blocks postinstall scripts by default (e.g. `esbuild`)                    | `pnpm approve-builds`, or add `allowBuilds:` to `pnpm-workspace.yaml`                                                           |

For anything not covered here, read the adapter package's own
[docs/TROUBLESHOOTING.md](https://github.com/scholtz/biatec-wallet-use-wallet-client/blob/main/docs/TROUBLESHOOTING.md)
and [docs/ARCHITECTURE.md](https://github.com/scholtz/biatec-wallet-use-wallet-client/blob/main/docs/ARCHITECTURE.md)
(fetch them if you have network access) rather than guessing at the WalletConnect internals.

## Reference

- Package: <https://www.npmjs.com/package/biatec-wallet-use-wallet-client> ·
  <https://github.com/scholtz/biatec-wallet-use-wallet-client>
- Full API reference: `docs/API.md` in that repo (every option, method, error code).
- `@txnlab/use-wallet` v5 docs: <https://txnlab.gitbook.io/use-wallet>
- Biatec Wallet: <https://wallet.biatec.io> · <https://github.com/scholtz/wallet>
- WalletConnect Cloud (get a project id): <https://cloud.reown.com>
- ARC-0001 (transaction signing): <https://github.com/algorandfoundation/ARCs/blob/main/ARCs/arc-0001.md>
- ARC-0060 (data signing): <https://github.com/algorandfoundation/ARCs/blob/main/ARCs/arc-0060.md>
