# Examples

Two minimal dApps showing how to integrate [Biatec Wallet](https://wallet.biatec.io) into a
frontend using `@txnlab/use-wallet` and the `biatec-wallet-use-wallet-client` adapter from this
repository.

| Example                    | Stack                           | Shows                                                                                                                                                                                |
| -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`vanilla-ts`](vanilla-ts) | Vite + TypeScript, no framework | Talking to `WalletManager` directly: connect, disconnect, network switch, `signTransactions`, `signData`.                                                                            |
| [`react-ts`](react-ts)     | Vite + React 19                 | `WalletProvider` / `useWallet()` / `useNetwork()` from `@txnlab/use-wallet-react`: a wallet picker, account switcher, network switcher, and the same two sign actions as components. |

Both examples register **only Biatec Wallet** to keep the integration obvious. To offer users a
choice of wallets, add more factories from their own `@txnlab/use-wallet-*` packages to the same
`wallets: [...]` array — see [Alongside other wallets](../README.md#alongside-other-wallets) in
the main README.

Both also show a **minimal pairing UI**: a QR code and a "Copy connection string" button, with no
wallet explorer or other wallets' links — see
[Custom QR UI](../docs/GETTING_STARTED.md#8-custom-qr-ui-qr-code--copy-button-only).

## Prerequisites

1. Build the adapter package once from the repo root, so the examples' `workspace:*` dependency
   resolves to real `dist/` output:

   ```bash
   pnpm install
   pnpm build
   ```

2. Get a free WalletConnect Cloud project id at <https://cloud.reown.com>. Both examples read it
   from an env var.

## Run an example

```bash
cd examples/react-ts        # or examples/vanilla-ts
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

- **`src/walletManager.ts`** (React example) / the top of `src/main.ts` (vanilla example) — the
  `WalletManager` setup: `biatec({ projectId, metadata })` plus, optionally,
  `BIATEC_EXTRA_NETWORKS` to add Voi mainnet / Aramid mainnet.
- **`ConnectWallet.tsx`** / the connect button wiring in `main.ts` — the connect/disconnect/account
  flow. It is written against the generic `Wallet` shape, so it works unmodified if you add more
  wallets later.
- **`SignActions.tsx`** — `signTransactions()` (ARC-0001) and `signData()` (ARC-0060), both
  wallet-agnostic calls that route to whichever wallet is active.
- **`ConnectQrDialog.tsx`** (React) / the `wc-dialog` wiring in `main.ts` + `index.html` (vanilla)
  — the QR-code-and-copy-button pairing dialog, wired via `biatec()`'s `onDisplayUri` option
  instead of the default WalletConnect modal.

None of the example code imports anything Biatec-specific beyond the `biatec()` factory call and
the `BIATEC_EXTRA_NETWORKS` constant — everything else is standard `@txnlab/use-wallet` API, so it
transfers directly to a dApp that also supports Pera, Defly, Lute, etc.
