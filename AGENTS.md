# AGENTS.md

Guidance for AI coding agents working **on this repository** (the adapter package itself). If
you're instead helping someone integrate Biatec Wallet **into their own dApp**, use
[skill/biatec-wallet-integration/SKILL.md](skill/biatec-wallet-integration/SKILL.md) — that file is
the portable playbook meant for exactly that; this one is for maintaining this package.

## What this is

`biatec-wallet-use-wallet-client` is a wallet adapter package for
[`@txnlab/use-wallet`](https://github.com/TxnLab/use-wallet) v5. It connects dApps to
[Biatec Wallet](https://wallet.biatec.io) over WalletConnect v2 and implements ARC-0001
transaction signing (`algo_signTxn`) and ARC-0060 data signing (`algo_signData`).

It follows the same shape as the official adapter packages in
`use-wallet/packages/wallets/*`: one `adapter.ts` extending `BaseWallet` from
`@txnlab/use-wallet/adapter`, an `icon.ts`, and an `index.ts` exporting a factory function. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design and why it isn't a subclass of
the official WalletConnect adapter.

## Commands (pnpm only — this is a pnpm workspace)

```bash
pnpm install        # install (root + examples/*)
pnpm test           # vitest (node environment, WalletConnect SDKs mocked)
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm build          # tsdown -> dist/ (ESM + d.ts + sourcemaps)
pnpm publint        # validate package.json / dist
pnpm check          # all of the above
pnpm format:fix     # prettier
pnpm changeset      # record a change for release — see docs/RELEASING.md
```

## Layout

- `src/adapter.ts` — `BiatecWalletAdapter`: single `BaseWallet` (id `biatec`) that dispatches
  `connect`/`disconnect`/`resumeSession`/`signTransactions`/`signData` to one of two transports
  based on the method chosen (built-in picker, or `connect({ method })`) or persisted account
  metadata.
- `src/transports/` — the two transport implementations, plain classes (not `BaseWallet`
  subclasses) taking a `TransportContext`: `walletconnect-transport.ts` (`WalletConnectTransport`)
  and `liquid-transport.ts` (`LiquidTransport`). `types.ts` defines `TransportContext`,
  `BiatecAccountMetadata`, `BiatecDisplayUriInfo`.
- `src/connect-dialog.ts` — the built-in vanilla-DOM connect UI: one window with a method
  selector (WalletConnect / Liquid Auth) on the left and the QR/link content for the selected
  method on the right; also the `adapter-constants.ts` values it and `adapter.ts` both need
  without importing each other.
- `src/index.ts` — the `biatec()` factory + public exports (no separate Liquid Auth factory).
- `src/liquid/` — Liquid Auth wire protocol, transport-agnostic: `protocol.ts` (ARC-0027 CBOR
  envelope + ARC-0060 extension, deep links, base64url — mirrored in the wallet repo at
  `src/scripts/liquid/protocol.ts`, keep in sync), `signaling.ts` (socket.io + WebRTC answer
  role). Spec: `docs/LIQUID_AUTH_PROTOCOL.md`.
- `src/networks.ts` — CAIP-2 ids and extra `NetworkConfig`s (Voi, Aramid).
- `src/window-metadata.ts` — dApp metadata auto-detection from the document.
- `src/icon.ts` — Biatec logo as SVG / data URI.
- `src/*.test.ts` — vitest suites; use `createTestHarness` from `@txnlab/use-wallet/testing`.
- `docs/` — extensive developer documentation:
  - `GETTING_STARTED.md` — narrative integration walkthrough (all frameworks).
  - `API.md` — full exported API reference.
  - `ARCHITECTURE.md` — internal design, session/signing flow diagrams.
  - `TROUBLESHOOTING.md` — known failure modes and fixes.
  - `RELEASING.md` — the Changesets-based release pipeline.
  - `RESEARCH.md` — original research notes on use-wallet v5 and Biatec Wallet internals, sources.
  - `LIQUID_AUTH_PROTOCOL.md` — normative description of the Liquid Auth transport and message schemas.
- `skill/biatec-wallet-integration/SKILL.md` — portable AI-agent instructions for integrating this
  package into a **consumer's** dApp. Shipped inside the published npm package (see `files` in
  `package.json`). Mirrored at `.claude/skills/biatec-wallet-integration/SKILL.md` for this repo's
  own Claude Code sessions.
- `examples/vanilla-ts`, `examples/react-ts` — runnable Vite apps; both `private: true` workspace
  packages linked to the adapter via `workspace:*`, excluded from Changesets versioning.
- `.changeset/` — pending release notes; see `docs/RELEASING.md`.

## Conventions

- Prettier: no semicolons, single quotes, width 100, no trailing commas.
- Keep `exactOptionalPropertyTypes` happy: build optional fields conditionally.
- `metadata` in adapter options is WalletConnect _dApp_ metadata; `displayMetadata` in the
  factory is the wallet-list name/icon. Do not merge the two.
- Never call the WalletConnect SDKs at import time; they are dynamically imported inside the
  adapter so SSR and tests stay clean.
- `SignDataError`/`ScopeType` are **not** re-exported by this package — they're generic
  `@txnlab/use-wallet` types; import them from there. Don't add a re-export "for convenience"
  without updating `docs/API.md`'s explicit note about this.
- Any change to the public API (exports from `src/index.ts`) needs: a `docs/API.md` update, a
  changeset (`pnpm changeset`), and — if it changes integration steps — a
  `skill/biatec-wallet-integration/SKILL.md` update. See [CONTRIBUTING.md](CONTRIBUTING.md).
- Release: fully automated via Changesets + `.github/workflows/release.yml`. Never manually bump
  `version` in `package.json`, edit `CHANGELOG.md`, or run `npm publish` — see
  [docs/RELEASING.md](docs/RELEASING.md). Do add a changeset file for any change that should ship.
