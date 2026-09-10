# Troubleshooting

## `Missing required option: projectId`

Thrown synchronously by `biatec({...})` / `new BiatecWalletAdapter(...)`. `projectId` wasn't
passed, or is `undefined` at construction time — a common cause is reading an env var that Vite/
Next.js hasn't inlined yet (e.g. missing the `VITE_`/`NEXT_PUBLIC_` prefix, or the `.env` file not
being loaded because the dev server started before it existed). Log the value right before
constructing the `WalletManager` to confirm it's a non-empty string.

## `No URI found` / `connect()` hangs forever

`client.connect()` didn't return a pairing `uri`. This is almost always a WalletConnect Cloud
project misconfiguration: the project id is invalid, deleted, or over its free-tier rate limit.
Check the project at <https://cloud.reown.com> and confirm requests are going through in its
dashboard logs. It can also happen if `relayUrl` was overridden to an unreachable endpoint.

## Connection modal never opens, or opens and does nothing

- **Content Security Policy**: the default relay is `wss://relay.walletconnect.com`. If your
  dApp sets a CSP header, its `connect-src` must allow that host (and `https://verify.walletconnect.com`
  / `https://verify.walletconnect.org` for the WalletConnect Verify API the modal calls). A CSP
  violation shows only in the browser console, not as a thrown error.
- **`onDisplayUri` set but nothing renders it**: when `onDisplayUri` is provided, the built-in
  modal is skipped entirely — you're responsible for showing the URI (e.g. as a QR code) yourself.
  Confirm your handler actually renders/opens something.
- **SSR**: don't call `wallet.connect()` during server rendering — it needs `window`/`document`.
  Gate it behind a client-only render path (`useEffect`, `onMounted`, `client:only`, etc.), same as
  any other wallet-connect button.

## `Network "<id>" has no caipChainId; add one to its NetworkConfig`

Thrown from `connect()`. The `WalletManager`'s active network doesn't have a `caipChainId` set —
either a custom `NetworkConfig` you registered is missing that field, or `defaultNetwork` points at
a network id that doesn't exist in `networks`/`DEFAULT_NETWORK_CONFIG` at all (a typo is a common
cause). Every network you connect on needs `caipChainId` — see
[`BIATEC_EXTRA_NETWORKS`](API.md#biatec_extra_networks) for ready-made Voi/Aramid configs, or
compute your own with [`caipChainIdFromGenesisHash`](API.md#caipchainidfromgenesishashgenesishashb64).

## `SessionError: No session found!`

`signTransactions()` or `signData()` was called before `connect()` resolved (or before
`resumeSession()` restored a prior session). Check `wallet.isConnected` /
`activeAddress` before offering a sign action, and make sure `resumeSessions()` has actually run
— framework providers (`WalletProvider`, `WalletManagerPlugin`, …) do this for you on mount, but a
vanilla integration must call `walletManager.resumeSessions()` explicitly before rendering
connected UI.

## Switching network breaks signing

If `setActiveNetwork('someNetwork')` is followed by `signTransactions`/`signData` failures, the
network almost certainly wasn't registered on the `WalletManager` **before** `connect()` was
called — see [ARCHITECTURE.md § Multi-chain sessions](ARCHITECTURE.md#multi-chain-sessions).
Adding a network after the session was approved requires disconnecting and reconnecting once so
the new chain gets included in the next `connect()` call's optional namespace.

## `signData()` throws a `SignDataError` with code `4200`

Two possible causes, both intentional:

1. The adapter was constructed with `enableSignData: false` — `signData()` always throws `4200` in
   that case, and `wallet.canSignData` is `false` so you can gate the UI on it.
2. The **live session** doesn't advertise `algo_signData` even though `enableSignData` is `true` —
   check `adapter.sessionSupportsSignData`. This happens when the connected Biatec Wallet build
   predates ARC-0060 support; ask the user to update their wallet and reconnect.

## `signData()` throws a `SignDataError` with code `4001`

The user rejected the request inside Biatec Wallet, or the wallet returned no signature for some
other reason (e.g. it closed the connection mid-request). This is the expected "user said no"
path — show it as a cancellation, not a fatal error.

## Stale session after logging out of Biatec Wallet / switching accounts in it

`BiatecWalletAdapter` listens for the WalletConnect `session_delete` event and clears its stored
accounts automatically when Biatec Wallet ends the session from its side. If your UI still shows a
stale connected state after that, confirm you're reading wallet state reactively (the framework
hooks / `walletManager.subscribe()`) rather than caching `wallet.activeAddress` in local component
state at connect time.

## `esbuild` / postinstall scripts blocked (pnpm)

pnpm 10+ ignores build scripts by default for security. This repo's own build needs `esbuild`'s
postinstall (a transitive dependency of `tsdown`); it's pre-approved via `pnpm-workspace.yaml`'s
`allowBuilds`. If you see `[ERR_PNPM_IGNORED_BUILDS]` in **your own** dApp (not this repo), run
`pnpm approve-builds` and select the packages you trust, or add the same `allowBuilds:` block to
your project's `pnpm-workspace.yaml`.

## `@vitejs/plugin-react` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED ... './internal'`

`@vitejs/plugin-react` 6.x requires Vite **8**. If your project (or a template you started from)
pins an older `vite` (6.x/7.x) alongside a newer `@vitejs/plugin-react`, bump `vite` to match — see
[`examples/react-ts/package.json`](../examples/react-ts/package.json) for versions known to work
together.

## Still stuck?

- Re-read [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.
- Check [RESEARCH.md](RESEARCH.md) for exactly what Biatec Wallet expects on the wire — useful if
  you're debugging with WalletConnect's own logging (`SignClient.init({ logger: 'debug', ... })`
  isn't exposed by this adapter's options today; fork `src/adapter.ts` locally to add it if you
  need relay-level tracing).
- Open an issue: <https://github.com/scholtz/biatec-wallet-use-wallet-client/issues>.
