# biatec-wallet-use-wallet-client

[![CI](https://github.com/scholtz/biatec-wallet-use-wallet-client/actions/workflows/ci.yml/badge.svg)](https://github.com/scholtz/biatec-wallet-use-wallet-client/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/biatec-wallet-use-wallet-client)](https://www.npmjs.com/package/biatec-wallet-use-wallet-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Live demo (React): [biatec-wallet-use-wallet-client-example-react.vercel.app](https://biatec-wallet-use-wallet-client-example-react.vercel.app)

[Biatec Wallet](https://wallet.biatec.io) adapter for [`@txnlab/use-wallet`](https://github.com/TxnLab/use-wallet) v5.

Connects your Algorand / AVM dApp to Biatec Wallet with

- ARC-0001 transaction signing (`algo_signTxn`), including transaction groups where only some
  transactions belong to the connected accounts,
- ARC-0060 arbitrary data signing (`algo_signData`) — `wallet.signData()` / `canSignData` work out of the box,
- multi-chain sessions: Algorand mainnet, testnet, betanet, fnet, Voi mainnet and Aramid mainnet
  are all approved in one session, so `setActiveNetwork()` does not require a reconnect,
- **up to three connection transports under one wallet**: **Direct** (the wallet in a popup, ARC-0027
  over `postMessage` — no relay, no signaling server, works on `http://localhost`), Liquid Auth
  (passkey-linked, peer-to-peer WebRTC, no relay in the signing path) and, **optionally**,
  WalletConnect v2 (relay-based; enabled only when you pass a `projectId`) — `connect()` shows a modern, dark/light-aware dialog with a method selector
  next to a live QR code (or an "Open Biatec Wallet" button for Direct), or skip it with
  `connect({ method: 'liquid' })` / `connect({ method: 'direct' })`,
- that same built-in dialog **or** your own QR / deep-link UI through `onDisplayUri`.

Works with every use-wallet framework binding: `@txnlab/use-wallet-react`, `-vue`, `-solid`, `-svelte`
and the vanilla `WalletManager`.

## Install

```bash
pnpm add biatec-wallet-use-wallet-client @txnlab/use-wallet algosdk
```

`@txnlab/use-wallet` (`^5`) and `algosdk` (`^3`) are peer dependencies. The WalletConnect SDKs are
bundled as regular dependencies and loaded lazily on first `connect()`.

No account, API key or WalletConnect project id is needed to get started: the default
integration offers Biatec Direct and Liquid Auth. A WalletConnect Cloud project id
(<https://cloud.reown.com>, free) is **optional** and only adds the WalletConnect method — see
[Which connection methods do I get?](#which-connection-methods-do-i-get).

## Usage

### Vanilla / any framework

```ts
import { WalletManager } from '@txnlab/use-wallet'
import { biatec } from 'biatec-wallet-use-wallet-client'

const manager = new WalletManager({
  wallets: [
    biatec({
      // Optional dApp metadata shown inside Biatec Wallet (auto-detected from the page otherwise)
      metadata: {
        name: 'My dApp',
        description: 'Example dApp',
        url: 'https://my-dapp.example',
        icons: ['https://my-dapp.example/icon.png']
      }
    })
  ],
  defaultNetwork: 'mainnet'
})

await manager.resumeSessions()

const wallet = manager.getWallet('biatec')!
await wallet.connect()

// Sign a transaction (ARC-0001)
const signed = await wallet.signTransactions([txn])

// Sign arbitrary data (ARC-0060)
const { signature } = await wallet.signData(btoa('hello'), { scope: 1, encoding: 'base64' })
```

### React

```tsx
import { WalletProvider, WalletManager, useWallet } from '@txnlab/use-wallet-react'
import { biatec } from 'biatec-wallet-use-wallet-client'

const manager = new WalletManager({
  wallets: [biatec()]
})

export function App() {
  return (
    <WalletProvider manager={manager}>
      <Connect />
    </WalletProvider>
  )
}

function Connect() {
  const { wallets, activeAddress } = useWallet()
  const wallet = wallets.find((w) => w.id === 'biatec')!
  return activeAddress ? (
    <button onClick={() => wallet.disconnect()}>Disconnect {activeAddress}</button>
  ) : (
    <button onClick={() => wallet.connect()}>
      <img src={wallet.metadata.icon} width={24} /> {wallet.metadata.name}
    </button>
  )
}
```

### Vue

```ts
import { createApp } from 'vue'
import { WalletManagerPlugin } from '@txnlab/use-wallet-vue'
import { biatec } from 'biatec-wallet-use-wallet-client'

createApp(App)
  .use(WalletManagerPlugin, {
    wallets: [biatec()]
  })
  .mount('#app')
```

### Alongside other wallets

```ts
import { pera } from '@txnlab/use-wallet-pera'
import { defly } from '@txnlab/use-wallet-defly'
import { biatec } from 'biatec-wallet-use-wallet-client'

new WalletManager({ wallets: [biatec(), pera(), defly()] })
```

## Which connection methods do I get?

`biatec()` with no options offers **Biatec Direct** and **Liquid Auth**. Add a WalletConnect
Cloud project id (`biatec({ projectId })`) to offer **WalletConnect** as a third method.
**WalletConnect is optional**, but it is currently the only way to connect a wallet on a
**remote device** for the key types Liquid Auth does not support: **post-quantum (Falcon-1024)
accounts, Ledger accounts and multisig accounts**. If your users need those on another device,
add a `projectId`.

| Method                                          | Needs                                                          | Works with these accounts                                                                                                                                                     | Which device                                        |
| ----------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Direct** (popup + `postMessage`)              | nothing (on by default)                                        | Every account the wallet can sign for itself: plain, HD, **Ledger**, **multisig**, **post-quantum** (not accounts that are only proxied through another WalletConnect wallet) | Same browser on the same device as the dApp (popup) |
| **Liquid Auth** (passkey + peer-to-peer WebRTC) | nothing (on by default; Biatec-hosted service)                 | Plain (ed25519) and HD accounts only. **Not** Ledger, post-quantum or multisig / 2FA accounts                                                                                 | Remote device (the wallet can be on your phone)     |
| **WalletConnect** (relay, QR code / deep link)  | a free WalletConnect Cloud project id: `biatec({ projectId })` | All key types, including Ledger, multisig and post-quantum                                                                                                                    | Remote device (the wallet can be on your phone)     |

```ts
// Default: Direct + Liquid Auth. No project id, no WalletConnect Cloud account.
biatec()

// Also offer WalletConnect (needed for remote post-quantum / Ledger / multisig accounts):
biatec({ projectId: '<your-walletconnect-project-id>' })
```

Without a `projectId` the WalletConnect method is simply not enabled (nothing throws, the
connect dialog shows two tabs). `walletconnect: false` switches it off even when a `projectId`
is given.

## Options

`biatec(options)` accepts:

| Option            | Type                                                                 | Default                                                                                  | Description                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectId`       | `string`                                                             | – (optional)                                                                             | WalletConnect Cloud project id. Optional: without it WalletConnect is not enabled and only Direct and Liquid Auth are offered. Add it for remote post-quantum / Ledger / multisig accounts. |
| `walletconnect`   | `false`                                                              | on with `projectId`                                                                      | Pass `false` to disable the WalletConnect transport even though a `projectId` is given (without a `projectId` it is already off).                                                           |
| `relayUrl`        | `string`                                                             | `wss://relay.walletconnect.com`                                                          | WalletConnect relay.                                                                                                                                                                        |
| `metadata`        | `SignClientTypes.Metadata`                                           | detected from the document                                                               | dApp metadata (name, description, url, icons) shown to the user in Biatec Wallet, for every transport.                                                                                      |
| `onDisplayUri`    | `(uri: string, info: BiatecDisplayUriInfo) => void \| Promise<void>` | –                                                                                        | Receive the pairing/session URI and render your own QR / link. When set, the built-in dialog is not used. `connect()` resolves once the wallet approves.                                    |
| `enableSignData`  | `boolean`                                                            | `true`                                                                                   | Expose `signData()` on all enabled transports. Set `false` to advertise transaction signing only.                                                                                           |
| `chains`          | `string[]`                                                           | `[]`                                                                                     | WalletConnect only: extra CAIP-2 chain ids to request as optional chains (every configured network's `caipChainId` is requested automatically).                                             |
| `liquid`          | `BiatecLiquidTransportOptions \| false`                              | enabled, Biatec defaults                                                                 | Liquid Auth transport config, or `false` to disable it (pass `direct: false` too to always use WalletConnect). See [docs/API.md](docs/API.md#biatecliquidtransportoptions).                 |
| `direct`          | `BiatecDirectTransportOptions \| false`                              | enabled, Biatec defaults                                                                 | Direct (popup + postMessage) transport config, or `false` to disable it. See [docs/DIRECT_PROTOCOL.md](docs/DIRECT_PROTOCOL.md).                                                            |
| `defaultMethod`   | `'walletconnect' \| 'liquid' \| 'direct'`                            | `'direct'`; `'walletconnect'`/first other if `onDisplayUri` is set or Direct is disabled | Method pre-selected in the connect dialog (must be enabled).                                                                                                                                |
| `displayMetadata` | `Partial<{ name; icon }>`                                            | Biatec name + logo                                                                       | Override how the wallet appears in your wallet picker.                                                                                                                                      |

### Choosing a connection method

When several transports are enabled (the default is Direct and Liquid Auth; WalletConnect joins them when you pass a `projectId`), `connect()` shows a modern,
glassmorphic dialog — a method selector (Biatec Direct / Liquid Auth, plus WalletConnect when a `projectId` is set) next to a
live QR code / link for whichever method is selected. Biatec Direct is listed first and selected by
default: it shows an **Open Biatec Wallet** button (a popup can only be opened from a click, so
it is never opened just by selecting the tab or by `connect()` itself). Switching to the WalletConnect or Liquid Auth tab connects that transport on demand. If you pass your own `onDisplayUri`, or disable Direct, the default is WalletConnect when enabled (then Liquid Auth) and it starts immediately. It follows the system's
light/dark theme automatically (or an explicit `data-theme` on `<html>`, if your page sets one),
and it's translated into every language Biatec Wallet itself ships — auto-detected from the
browser, or force one with `biatec({ locale: 'sk' })` (see
[Localization](docs/API.md#localization)). Skip the selector from your own UI with
`connect({ method: 'liquid' })`, `connect({ method: 'walletconnect' })` or
`connect({ method: 'direct' })`, or disable transports you don't want:
`biatec({ projectId, liquid: false, direct: false })` (WalletConnect needs the `projectId`) makes `connect()` always go straight to
WalletConnect. Change which tab is pre-selected with `defaultMethod` (an explicit `defaultMethod: 'direct'` opens the popup immediately inside `connect()`, so call it from a click).

> **Upgrading (`projectId` is now optional):** previously a missing `projectId` threw
> `Missing required option: projectId`. Now a missing (or empty) `projectId` silently means
> WalletConnect is not enabled, so `biatec()` offers only Direct and Liquid Auth. If you forgot
> the id in a setup that relies on WalletConnect, users will see only those two tabs and the
> console logs a warning when `projectId` is passed but empty/undefined (e.g. an unset env var)
> or WalletConnect options (`relayUrl`, `chains`) are set without it; a plain `biatec()` logs only
> an info line.
> Pass `projectId` to keep WalletConnect.
>
> **Direct and networks:** Direct works on every network (including custom ones): each request carries the genesis hash of your active network, the wallet shows it to the user and signs on it. A persisted Direct session survives `setActiveNetwork()`; the wallet's old "different network" error (`DirectNetworkMismatchError`, 4004) is now only seen with outdated wallet versions.

> **Upgrading:** Direct-only setups (`walletconnect: false, liquid: false`) now also see the _Open Biatec Wallet_ button first instead of an immediately opened popup; pass `defaultMethod: 'direct'` or call `connect({ method: 'direct' })` to keep opening the popup immediately. The dialog now lists **Direct first and pre-selects it**; WalletConnect no longer auto-starts (its pairing begins when its tab is selected) unless it is the default. Integrators who want the QR first pass `defaultMethod: 'walletconnect'`; integrators with their own `onDisplayUri` UI keep WalletConnect as the default and are unaffected. The picker is skipped only when exactly **one** method is enabled. If you previously passed only `liquid: false` to always use WalletConnect, also pass `direct: false`. With `onDisplayUri`, a picker-only overlay now appears unless exactly one method is enabled.

### Custom QR code instead of the built-in dialog

The built-in dialog already renders a QR code and copy button, styled to match your dApp's light
or dark theme — most dApps don't need to replace it. Pass `onDisplayUri` if you want full control
over rendering instead:

```ts
biatec({
  onDisplayUri: (uri, info) => showMyQrDialog(uri, info.method) // hide it once connect() settles
})
```

Both examples in [examples/](examples) rely on the built-in dialog (no `onDisplayUri` set) — see
their `walletManager.ts` / `main.ts`. Only reach for `onDisplayUri` when you need pixel-level
control over the pairing UI yourself.

### Extra networks (Voi, Aramid)

use-wallet ships Algorand mainnet/testnet/betanet/fnet/localnet. Biatec Wallet also supports Voi
mainnet and Aramid mainnet; ready-made configs are exported:

```ts
import { NetworkConfigBuilder, WalletManager } from '@txnlab/use-wallet'
import { biatec, BIATEC_EXTRA_NETWORKS } from 'biatec-wallet-use-wallet-client'

const networks = new NetworkConfigBuilder()
  .addNetwork('voimain', BIATEC_EXTRA_NETWORKS.voimain)
  .addNetwork('aramidmain', BIATEC_EXTRA_NETWORKS.aramidmain)
  .build()

const manager = new WalletManager({ wallets: [biatec()], networks })
await manager.setActiveNetwork('voimain') // no reconnect needed
```

Every network in the manager that has a `caipChainId` is requested as an optional chain when
connecting. For your own AVM network use `caipChainIdFromGenesisHash(genesisHashBase64)`.

## ARC-0060 data signing

`signData(data, metadata)` follows the use-wallet contract: `data` is a base64 string,
`metadata` is `{ scope: ScopeType.AUTH, encoding: 'base64' }`. The adapter builds the
`StdSignData` payload (signer public key, `domain = location.host`, `authenticatorData =
SHA-256(domain)`) and sends it to Biatec Wallet, which verifies the domain against the
WalletConnect session peer before signing. Errors use ARC-0060 codes:

| Code   | Meaning                                                                |
| ------ | ---------------------------------------------------------------------- |
| `4001` | User rejected / wallet returned no signature                           |
| `4200` | `signData` disabled, or the session does not advertise `algo_signData` |
| `4300` | Any other failure (relay, encoding, …)                                 |

## How this relates to `walletConnect({ skin: 'biatec' })`

`@txnlab/use-wallet-walletconnect` ships a _skin_ that only changes the name and icon of the
generic WalletConnect adapter. This package is a full adapter with a stable wallet id (`biatec`),
ARC-0060 support, multi-chain sessions and a custom-QR hook. Both can coexist in one
`WalletManager` because they use different wallet keys (`biatec` vs `walletconnect:biatec`).

## Liquid Auth transport (passkeys + WebRTC)

Besides Direct, `biatec()` supports the Algorand Foundation's
[Liquid Auth](https://liquidauth.com) protocol as a second transport, enabled by default: the
wallet is linked with a **passkey** at a Liquid Auth service and then talks to your dApp over a
**direct, encrypted WebRTC data channel** (ICE via public Google STUN servers), so no relay ever
sees a transaction. Messages follow ARC-0027 (`arc0027:sign_transactions`) with an ARC-0060
`arc0060:sign_data` extension, and interoperate with other Liquid Auth peers for transaction
signing.

```ts
import { biatec } from 'biatec-wallet-use-wallet-client'

new WalletManager({
  wallets: [
    biatec({
      // liquid: { origin: 'https://liquid.biatec.io' }, // Biatec-hosted service is the default
      onDisplayUri: (uri, info) => showMyQrDialog(uri, info) // info.method is 'direct' | 'liquid' (| 'walletconnect' with a projectId)
    })
  ]
})
```

One wallet entry (id `biatec`) covers all transports — `connect()` shows a built-in picker
between the enabled ones (see [Choosing a connection method](#choosing-a-connection-method) above).
`signTransactions()` and `signData()` behave the same regardless of which transport connected.
See [docs/LIQUID_AUTH_PROTOCOL.md](docs/LIQUID_AUTH_PROTOCOL.md) for the full protocol, the
`liquid` option in [docs/API.md](docs/API.md#biatecliquidtransportoptions), and the service
deployment requirements (the service must be hosted under the wallet's domain because of the
WebAuthn RP-ID rule). Pass `liquid: false` to disable this transport entirely.

## Direct transport (popup + postMessage, no relay)

`direct` opens Biatec Wallet in a **popup** and exchanges ARC-0027 messages with it over
`window.postMessage`. No WalletConnect relay, no Liquid Auth service, no QR code, no `projectId`
— and it works for `http://localhost` dApps and offline PWAs. The browser itself tells the wallet
which site is asking (`event.origin`), and the adapter pins the wallet's origin, so there is
nothing to pair and nothing to encrypt.

```ts
// Direct only: zero servers, no projectId (it works with every account type, but only when
// the wallet runs in the same browser as the dApp).
biatec({ walletconnect: false, liquid: false })

// ...and start it from a click handler (the browser blocks popups opened any other way):
button.onclick = () => wallet.connect({ method: 'direct' })
```

Rules of thumb:

- **Call `connect()` / `signTransactions()` / `signData()` from a user gesture**, with no `await`
  before the call. Each signing request opens a fresh popup; a blocked popup rejects with
  `PopupBlockedError` (ask the user to allow popups and click again — the built-in dialog does
  this for you).
- **Do not send `Cross-Origin-Opener-Policy: same-origin`** from your dApp (it severs the channel
  to the popup). Use `same-origin-allow-popups` or no COOP header.
- **Fetch everything async BEFORE the click.** An `await` (e.g. `getTransactionParams()`) between the click and `signTransactions()` can outlive the browser's user-activation window (about 1 s in Safari, or a slow node anywhere) and the popup is blocked. Load suggested params on mount / after connect / on a timer into state, build the transaction synchronously in the click handler (the shipped examples do this), and **catch `PopupBlockedError` and let the user click again** (it is not a failure of the wallet or the session).
- **Direct signs only payments, asset transfers and calls to existing applications.** Asset
  config/freeze, key registration, state proofs, heartbeats, application creation and program
  updates are refused with error `4200` (before a popup opens); use the WalletConnect method for
  those.
- Everything the wallet returns is validated (addresses, array lengths, and that each returned
  signed transaction is really the one you sent) before it reaches your code.
- `direct: { walletUrl }` is for local wallet development only: it must be `https` or
  `localhost`/`127.0.0.1`, and logs a warning.

Full normative protocol, security rules and the wallet-side requirements:
[docs/DIRECT_PROTOCOL.md](docs/DIRECT_PROTOCOL.md).

## Documentation

| Doc                                                          | What's in it                                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)           | Full walkthrough — React/Vue/Solid/Svelte/vanilla, networks, custom QR UI, ARC-0060.                                 |
| [docs/LIQUID_AUTH_PROTOCOL.md](docs/LIQUID_AUTH_PROTOCOL.md) | The Liquid Auth transport: linking, signaling, ARC-0027/ARC-0060 messages, security model, service deployment.       |
| [docs/DIRECT_PROTOCOL.md](docs/DIRECT_PROTOCOL.md)           | The Direct (popup + postMessage) transport: messages, origin rules, error codes, wallet- and dApp-side requirements. |
| [docs/API.md](docs/API.md)                                   | Every export: `biatec()` options, `BiatecWalletAdapter` members, error codes, network helpers.                       |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                 | Internal design — session lifecycle, multi-chain negotiation, signing flows, sequence diagram.                       |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)           | Fixes for the errors and dead-ends you're most likely to hit.                                                        |
| [docs/RELEASING.md](docs/RELEASING.md)                       | How the automated Changesets release pipeline works.                                                                 |
| [docs/RESEARCH.md](docs/RESEARCH.md)                         | Original research: how use-wallet v5 adapters work, what Biatec Wallet supports, sources.                            |
| [CONTRIBUTING.md](CONTRIBUTING.md)                           | Contributor workflow, code style, testing, release checklist.                                                        |

## Integrating with an AI coding agent

[`skill/biatec-wallet-integration/SKILL.md`](skill/biatec-wallet-integration/SKILL.md) is a
self-contained, step-by-step playbook written for AI coding agents (Claude Code, Cursor, Copilot,
etc.) to follow when adding Biatec Wallet to **your** dApp — framework detection, installation,
`WalletManager` setup per framework, transaction/data signing, and a troubleshooting table. It
ships inside the published npm package, so once installed you can point your agent straight at it:

```bash
pnpm add biatec-wallet-use-wallet-client
```

```
Read node_modules/biatec-wallet-use-wallet-client/skill/biatec-wallet-integration/SKILL.md
and follow it to add Biatec Wallet support to this app.
```

For Claude Code specifically, copy it into your project so it's auto-discovered as a skill:

```bash
mkdir -p .claude/skills/biatec-wallet-integration
cp node_modules/biatec-wallet-use-wallet-client/skill/biatec-wallet-integration/SKILL.md \
   .claude/skills/biatec-wallet-integration/SKILL.md
```

Then ask Claude Code to "add Biatec Wallet support" — the skill is picked up automatically.

## Development

```bash
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc
pnpm lint        # eslint
pnpm build       # tsdown -> dist/
pnpm check       # everything, also run by prepublishOnly
pnpm test:e2e    # playwright, against the built vanilla-ts example (run `pnpm build` first)
```

Run an example dApp: see [examples/](examples) for a vanilla TypeScript and a React integration
(`cd examples/react-ts && cp .env.example .env && pnpm install && pnpm dev`).

The React example is deployed at
[biatec-wallet-use-wallet-client-example-react.vercel.app](https://biatec-wallet-use-wallet-client-example-react.vercel.app).
Vercel's Root Directory for that project is `examples/react-ts` (`vercel.json` there installs the
workspace from the repo root and builds this package before Vite, because the example depends on
it via `workspace:*` → `dist/`).

Full contributor workflow, code style, and testing conventions: [CONTRIBUTING.md](CONTRIBUTING.md).

### CI/CD

- **CI** (`.github/workflows/ci.yml`) — on every push/PR: lint, typecheck, test, build, publint,
  format check, building both examples against the freshly built package, and a Playwright
  end-to-end suite that clicks through the built-in connect dialog in a real browser.
- **Release** (`.github/workflows/release.yml`) — [Changesets](https://github.com/changesets/changesets)-driven:
  merging a PR with a changeset opens an automatic "Version Packages" PR; merging _that_ publishes
  to npm with provenance and creates a GitHub release. No manual version bumps or `npm publish`.
  Full details: [docs/RELEASING.md](docs/RELEASING.md).

## License

MIT. The WalletConnect transaction-signing flow is adapted from
[`@txnlab/use-wallet-walletconnect`](https://github.com/TxnLab/use-wallet) (MIT, TxnLab, Inc.).
