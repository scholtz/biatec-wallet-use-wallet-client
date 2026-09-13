# biatec-wallet-use-wallet-client

[![CI](https://github.com/scholtz/biatec-wallet-use-wallet-client/actions/workflows/ci.yml/badge.svg)](https://github.com/scholtz/biatec-wallet-use-wallet-client/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/biatec-wallet-use-wallet-client)](https://www.npmjs.com/package/biatec-wallet-use-wallet-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Biatec Wallet](https://wallet.biatec.io) adapter for [`@txnlab/use-wallet`](https://github.com/TxnLab/use-wallet) v5.

Connects your Algorand / AVM dApp to Biatec Wallet with

- ARC-0001 transaction signing (`algo_signTxn`), including transaction groups where only some
  transactions belong to the connected accounts,
- ARC-0060 arbitrary data signing (`algo_signData`) — `wallet.signData()` / `canSignData` work out of the box,
- multi-chain sessions: Algorand mainnet, testnet, betanet, fnet, Voi mainnet and Aramid mainnet
  are all approved in one session, so `setActiveNetwork()` does not require a reconnect,
- **two connection transports under one wallet**: WalletConnect v2 (relay-based) and Liquid Auth
  (passkey-linked, peer-to-peer WebRTC, no relay in the signing path) — `connect()` shows a
  modern, dark/light-aware dialog with a method selector next to a live QR code, or skip it with
  `connect({ method: 'liquid' })`,
- that same built-in dialog **or** your own QR / deep-link UI through `onDisplayUri`.

Works with every use-wallet framework binding: `@txnlab/use-wallet-react`, `-vue`, `-solid`, `-svelte`
and the vanilla `WalletManager`.

## Install

```bash
pnpm add biatec-wallet-use-wallet-client @txnlab/use-wallet algosdk
```

`@txnlab/use-wallet` (`^5`) and `algosdk` (`^3`) are peer dependencies. The WalletConnect SDKs are
bundled as regular dependencies and loaded lazily on first `connect()`.

You need a WalletConnect Cloud **project id** from <https://cloud.reown.com>.

## Usage

### Vanilla / any framework

```ts
import { WalletManager } from '@txnlab/use-wallet'
import { biatec } from 'biatec-wallet-use-wallet-client'

const manager = new WalletManager({
  wallets: [
    biatec({
      projectId: '<your-walletconnect-project-id>',
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
  wallets: [biatec({ projectId: import.meta.env.VITE_WC_PROJECT_ID })]
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
    wallets: [biatec({ projectId: import.meta.env.VITE_WC_PROJECT_ID })]
  })
  .mount('#app')
```

### Alongside other wallets

```ts
import { pera } from '@txnlab/use-wallet-pera'
import { defly } from '@txnlab/use-wallet-defly'
import { biatec } from 'biatec-wallet-use-wallet-client'

new WalletManager({ wallets: [biatec({ projectId }), pera(), defly()] })
```

## Options

`biatec(options)` accepts:

| Option            | Type                                                                 | Default                         | Description                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectId`       | `string`                                                             | **required**                    | WalletConnect Cloud project id (used by the WalletConnect transport).                                                                                    |
| `relayUrl`        | `string`                                                             | `wss://relay.walletconnect.com` | WalletConnect relay.                                                                                                                                     |
| `metadata`        | `SignClientTypes.Metadata`                                           | detected from the document      | dApp metadata (name, description, url, icons) shown to the user in Biatec Wallet, for both transports.                                                   |
| `onDisplayUri`    | `(uri: string, info: BiatecDisplayUriInfo) => void \| Promise<void>` | –                               | Receive the pairing/session URI and render your own QR / link. When set, the built-in dialog is not used. `connect()` resolves once the wallet approves. |
| `enableSignData`  | `boolean`                                                            | `true`                          | Expose `signData()` on both transports. Set `false` to advertise transaction signing only.                                                               |
| `chains`          | `string[]`                                                           | `[]`                            | WalletConnect only: extra CAIP-2 chain ids to request as optional chains (every configured network's `caipChainId` is requested automatically).          |
| `liquid`          | `BiatecLiquidTransportOptions \| false`                              | enabled, Biatec defaults        | Liquid Auth transport config, or `false` to disable it and always use WalletConnect. See [docs/API.md](docs/API.md#biatecliquidtransportoptions).        |
| `displayMetadata` | `Partial<{ name; icon }>`                                            | Biatec name + logo              | Override how the wallet appears in your wallet picker.                                                                                                   |

### Choosing a connection method

When both transports are enabled (the default), `connect()` shows a modern, glassmorphic dialog
— a method selector (WalletConnect / Liquid Auth) next to a live QR code / link for whichever
method is selected. WalletConnect is selected by default, so its QR is visible immediately;
switching to the Liquid Auth tab connects that transport on demand. It follows the system's
light/dark theme automatically. Skip the selector from your own UI with
`connect({ method: 'liquid' })` or `connect({ method: 'walletconnect' })`, or disable Liquid Auth
entirely with `biatec({ projectId, liquid: false })` so `connect()` always goes straight to
WalletConnect.

### Custom QR code instead of the built-in dialog

The built-in dialog already renders a QR code and copy button, styled to match your dApp's light
or dark theme — most dApps don't need to replace it. Pass `onDisplayUri` if you want full control
over rendering instead:

```ts
biatec({
  projectId,
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

const manager = new WalletManager({ wallets: [biatec({ projectId })], networks })
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

Besides WalletConnect, `biatec()` supports the Algorand Foundation's
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
      projectId,
      // liquid: { origin: 'https://liquid.biatec.io' }, // Biatec-hosted service is the default
      onDisplayUri: (uri, info) => showMyQrDialog(uri, info) // info.method is 'walletconnect' | 'liquid'
    })
  ]
})
```

One wallet entry (id `biatec`) covers both transports — `connect()` shows a built-in picker
between them (see [Choosing a connection method](#choosing-a-connection-method) above).
`signTransactions()` and `signData()` behave the same regardless of which transport connected.
See [docs/LIQUID_AUTH_PROTOCOL.md](docs/LIQUID_AUTH_PROTOCOL.md) for the full protocol, the
`liquid` option in [docs/API.md](docs/API.md#biatecliquidtransportoptions), and the service
deployment requirements (the service must be hosted under the wallet's domain because of the
WebAuthn RP-ID rule). Pass `liquid: false` to disable this transport entirely.

## Documentation

| Doc                                                          | What's in it                                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)           | Full walkthrough — React/Vue/Solid/Svelte/vanilla, networks, custom QR UI, ARC-0060.                           |
| [docs/LIQUID_AUTH_PROTOCOL.md](docs/LIQUID_AUTH_PROTOCOL.md) | The Liquid Auth transport: linking, signaling, ARC-0027/ARC-0060 messages, security model, service deployment. |
| [docs/API.md](docs/API.md)                                   | Every export: `biatec()` options, `BiatecWalletAdapter` members, error codes, network helpers.                 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                 | Internal design — session lifecycle, multi-chain negotiation, signing flows, sequence diagram.                 |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)           | Fixes for the errors and dead-ends you're most likely to hit.                                                  |
| [docs/RELEASING.md](docs/RELEASING.md)                       | How the automated Changesets release pipeline works.                                                           |
| [docs/RESEARCH.md](docs/RESEARCH.md)                         | Original research: how use-wallet v5 adapters work, what Biatec Wallet supports, sources.                      |
| [CONTRIBUTING.md](CONTRIBUTING.md)                           | Contributor workflow, code style, testing, release checklist.                                                  |

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
