# Contributing

Thanks for improving the Biatec Wallet adapter for `@txnlab/use-wallet`. This document covers the
day-to-day workflow; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code works and
[docs/RELEASING.md](docs/RELEASING.md) for how versions ship.

## Setup

Requires Node ≥ 20.19 and **pnpm** (see `packageManager` in `package.json`; run `corepack enable`
if you don't have pnpm yet).

```bash
git clone https://github.com/scholtz/biatec-wallet-use-wallet-client.git
cd biatec-wallet-use-wallet-client
pnpm install
```

This is a pnpm workspace: the adapter package at the repo root, plus `examples/vanilla-ts` and
`examples/react-ts`, both linked to the adapter via `workspace:*`.

## Everyday commands

```bash
pnpm test           # vitest run
pnpm test:watch     # vitest --watch
pnpm test:e2e       # playwright, against the built vanilla-ts example — see "End-to-end tests"
pnpm typecheck       # tsc --noEmit
pnpm lint            # eslint
pnpm format:fix       # prettier --write .
pnpm build           # tsdown -> dist/
pnpm check           # lint + typecheck + test + build + publint — run this before opening a PR
```

Run an example against your change: `pnpm build` first (examples import the built `dist/`, not
`src/` directly), then `cd examples/react-ts && pnpm dev` (or `vanilla-ts`).

## Code style

- Prettier: no semicolons, single quotes, width 100, no trailing commas. `pnpm format:fix` before
  committing; CI's `format:check` fails the build otherwise.
- ESLint flat config (`eslint.config.js`), `@typescript-eslint/no-explicit-any` is off — this
  package deliberately uses `any` in a few WalletConnect JSON-RPC boundary spots where the SDK
  itself is loosely typed, matching upstream `use-wallet`'s own convention.
- `tsconfig.json` has `exactOptionalPropertyTypes: true` — build optional fields conditionally
  (`if (x) obj.field = x`) rather than assigning `undefined` to them.
- Follow the shape of the official `@txnlab/use-wallet` adapters (`packages/wallets/*` in that
  repo) where this package's behavior overlaps with theirs — see
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the specific design choices and why this
  package doesn't just subclass the official WalletConnect adapter.

## Tests

`BiatecWalletAdapter` (`src/adapter.ts`) is a thin dispatcher over two transports, and the test
suites mirror that split:

- `src/adapter.test.ts` — dispatch only: method picker shown/skipped, `resumeSession()` branching
  on persisted account `metadata.method`. No real WalletConnect/Liquid SDK involved.
- `src/transports/walletconnect-transport.test.ts` — mocks `@walletconnect/sign-client` and
  drives the full adapter through `createTestHarness()` from `@txnlab/use-wallet/testing`,
  calling `connect({ method: 'walletconnect' })` to bypass the picker.
- `src/transports/liquid-transport.test.ts` — mocks `socket.io-client` and WebRTC globals the same
  way, calling `connect({ method: 'liquid' })`.

When adding behavior:

- New WalletConnect option → add a constructor test in the walletconnect-transport suite and, if
  it changes what gets requested at connect time, a `describe('connect')` test asserting the exact
  `requiredNamespaces`/`optionalNamespaces` shape sent to `client.connect()`.
- New signing behavior → extend `describe('signTransactions')` / `describe('signData')` in the
  relevant transport suite; reuse the `connectAdapter()` helper to get a connected adapter with a
  mocked session in one line.
- New dispatch behavior (e.g. how a method is chosen, or how resume picks a transport) → extend
  `src/adapter.test.ts`, mocking `./connect-dialog` rather than any transport SDK.
- Network/chain logic → `src/networks.test.ts` checks `BIATEC_EXTRA_NETWORKS` stay consistent with
  `caipChainIdFromGenesisHash`; extend it if you add another network.

Run `pnpm test:watch` while iterating.

## End-to-end tests

`src/adapter.test.ts` mocks `./connect-dialog` entirely, so it can't catch a real bug in the
dialog's own DOM/wiring — that's what `e2e/` (Playwright) is for. It drives the built
`vanilla-ts` example in a real browser: click Connect, confirm the built-in dialog opens with the
right method(s) and no thrown errors, switch tabs, cancel. It never completes a real
WalletConnect/Liquid Auth pairing (that needs a live wallet), so keep new e2e tests scoped to UI
behavior up to that point.

```bash
pnpm build                  # the example resolves the adapter via workspace:* -> dist/
pnpm test:e2e:install       # once, to fetch the Chromium binary
pnpm test:e2e               # runs against a vite dev server Playwright starts itself
```

Runs in CI on every PR (`.github/workflows/ci.yml`'s `e2e` job) against `dist/`, so rebuild
before running locally if you changed `src/`.

## Documentation

If your change affects the public API, update:

- [docs/API.md](docs/API.md) — the option/method/type reference table.
- [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) and/or the examples under `examples/`, if it
  changes how a consumer would set things up.
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md), if it introduces a new failure mode worth
  documenting.
- [skill/biatec-wallet-integration/SKILL.md](skill/biatec-wallet-integration/SKILL.md), if it
  changes the steps an AI agent should follow to integrate this package — keep it in sync with
  `docs/GETTING_STARTED.md`; see that file's own header for what "in sync" means here.

Doc-only PRs don't need a changeset (see below) unless they change a file that ships inside the
published npm package (`README.md`, `skill/`).

## Releasing

1. Make your change.
2. Run `pnpm changeset` and commit the generated file in the same PR — see
   [docs/RELEASING.md](docs/RELEASING.md#adding-a-changeset) for how to pick a bump type and write
   the summary. Skip this for changes that don't affect the published package (CI config, internal
   docs, example-only changes).
3. Open the PR. CI runs lint/typecheck/test/build/publint on every push, plus an example build
   check and an advisory changeset reminder.
4. Once merged, `.github/workflows/release.yml` takes over automatically — see
   [docs/RELEASING.md](docs/RELEASING.md) for the full pipeline.

## Reporting issues

<https://github.com/scholtz/biatec-wallet-use-wallet-client/issues> — include your
`@txnlab/use-wallet` and `algosdk` versions, the framework binding in use (if any), and whether the
issue reproduces in `examples/react-ts` or `examples/vanilla-ts` against `main`.
