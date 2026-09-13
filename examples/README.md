# Examples

Five minimal dApps showing how to integrate [Biatec Wallet](https://wallet.biatec.io) into a
frontend using `@txnlab/use-wallet` and the `biatec-wallet-use-wallet-client` adapter from this
repository — one per major framework `@txnlab/use-wallet` ships bindings for, plus a
framework-free one.

| Example                    | Stack                           | Shows                                                                                                                                                                                |
| -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`vanilla-ts`](vanilla-ts) | Vite + TypeScript, no framework | Talking to `WalletManager` directly: connect, disconnect, network switch, `signTransactions`, `signData`.                                                                            |
| [`react-ts`](react-ts)     | Vite + React 19                 | `WalletProvider` / `useWallet()` / `useNetwork()` from `@txnlab/use-wallet-react`: a wallet picker, account switcher, network switcher, and the same two sign actions as components. |
| [`vue-ts`](vue-ts)         | Vite + Vue 3                    | `WalletManagerPlugin` / `useWallet()` / `useNetwork()` from `@txnlab/use-wallet-vue`, as Vue SFCs (Composition API, `<script setup>`).                                               |
| [`solid-ts`](solid-ts)     | Vite + SolidJS                  | `WalletProvider` / `useWallet()` / `useNetwork()` from `@txnlab/use-wallet-solid`, using Solid's signals and `<Show>`/`<For>` control-flow components.                               |
| [`svelte-ts`](svelte-ts)   | Vite + Svelte 5                 | `useWalletContext()` / `useWallet()` / `useNetwork()` from `@txnlab/use-wallet-svelte`, using Svelte 5 runes (`$state`).                                                             |

All five examples register **only Biatec Wallet** to keep the integration obvious. To offer users a
choice of wallets, add more factories from their own `@txnlab/use-wallet-*` packages to the same
`wallets: [...]` array — see [Alongside other wallets](../README.md#alongside-other-wallets) in
the main README.

None of them set `onDisplayUri`, so `connect()` shows the adapter's own built-in dialog — one
window with a WalletConnect/Liquid Auth method selector on one side and a live QR code plus
"Copy link" button on the other, themed to match the page's light/dark mode. Only reach for
`onDisplayUri` if you need to replace that UI with something fully custom — see
[docs/API.md](../docs/API.md).

## Prerequisites

1. Build the adapter package once from the repo root, so the examples' `workspace:*` dependency
   resolves to real `dist/` output:

   ```bash
   pnpm install
   pnpm build
   ```

2. Get a free WalletConnect Cloud project id at <https://cloud.reown.com>. Every example reads it
   from an env var.

## Run an example

```bash
cd examples/react-ts        # or vanilla-ts, vue-ts, solid-ts, svelte-ts
cp .env.example .env
# edit .env and set VITE_WC_PROJECT_ID
pnpm install
pnpm dev
```

Open the printed local URL, click **Connect**, and approve the WalletConnect pairing in
[Biatec Wallet](https://wallet.biatec.io) (or the Biatec mobile/extension app once available).
Biatec Wallet does not require its own project id — only the dApp side does, since the dApp is the
WalletConnect client that initiates the session.

## What to copy into your own dApp

- **`src/walletManager.ts`** (React/Solid/Svelte) / **`src/main.ts`**'s top (vanilla) —
  the `WalletManager` setup: `biatec({ projectId, metadata })` plus, optionally,
  `BIATEC_EXTRA_NETWORKS` to add Voi mainnet / Aramid mainnet. The Vue example is the one
  exception: its `walletManagerConfig` is a plain config object, since `WalletManagerPlugin`
  builds the `WalletManager` itself.
- **`ConnectWallet.*`** / the connect button wiring in `main.ts` (vanilla) — the
  connect/disconnect/account flow. It is written against the generic `Wallet` shape from each
  framework binding, so it works unmodified if you add more wallets later.
- **`SignActions.*`** — `signTransactions()` (ARC-0001) and `signData()` (ARC-0060), both
  wallet-agnostic calls that route to whichever wallet is active.

None of the example code imports anything Biatec-specific beyond the `biatec()` factory call and
the `BIATEC_EXTRA_NETWORKS` constant — everything else is standard `@txnlab/use-wallet` (or its
`-react`/`-vue`/`-solid`/`-svelte` binding) API, so it transfers directly to a dApp that also
supports Pera, Defly, Lute, etc.
