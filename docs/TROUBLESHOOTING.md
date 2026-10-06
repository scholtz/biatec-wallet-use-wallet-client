# Troubleshooting

## `Missing required option: projectId`

Thrown synchronously by `biatec({...})` / `new BiatecWalletAdapter(...)` while the WalletConnect
transport is enabled. If you only use Direct and/or Liquid Auth, pass `walletconnect: false` and
drop `projectId`. Otherwise `projectId` wasn't passed, or is `undefined` at construction time — a common cause is reading an env var that Vite/
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

## Liquid Auth: `Cannot reach Liquid Auth service`

The adapter could not open the socket.io connection to `origin` (default
`https://liquid.biatec.io`). Check the URL, that the service is up, and that your CSP
`connect-src` allows both `https://` and `wss://` to that host.

## Liquid Auth: `Timed out after … waiting for Biatec Wallet to connect`

Nobody completed the passkey link for the shown `requestId` within `connectTimeoutMs`
(5 min default). The wallet must scan/paste the **same** link; if the wallet reports a passkey
error, the service's RP ID / origin do not match the wallet's domain — see
[LIQUID_AUTH_PROTOCOL.md § 6](LIQUID_AUTH_PROTOCOL.md#6-service-deployment-requirements-for-operators).

## Liquid Auth: `Biatec Wallet is not reachable … Open Biatec Wallet` (code 4002)

After a page reload the adapter re-pairs lazily on the first signing request and waits
`reconnectTimeoutMs` (30 s) for the wallet, which must still be open on the Connect page with
the session listed. Otherwise disconnect and connect again.

## Liquid Auth: channel connects but signing hangs

Both peers are behind symmetric NATs and STUN alone cannot find a path — pass `iceServers`
with a TURN server. The WebRTC connection state is visible via `adapter.isChannelOpen`.

## Direct: `PopupBlockedError` / the popup never opens

The browser refused `window.open`. It is only allowed synchronously inside a user gesture: call
`wallet.connect({ method: 'direct' })` / `signTransactions()` / `signData()` directly from a click
handler, with **no `await` (or `setTimeout`, or promise `.then`) before it**. In frameworks, don't
route the click through an async function that awaits something first. Also check the browser's
popup-blocker setting for your site (the address bar shows a "popup blocked" icon); the built-in
dialog keeps its _Open Biatec Wallet_ button so the user can allow popups and click again.

## Direct: `Biatec Wallet window was closed before the request completed` (code 4001)

Either the user closed the popup, or the channel was severed on open. If the popup visibly
loaded and you did not close it, your dApp page probably sends
`Cross-Origin-Opener-Policy: same-origin` (or opens the wallet with `noopener`/`noreferrer`),
which cuts `window.opener` — use `same-origin-allow-popups` or no COOP header.

## Direct: `Biatec Wallet did not respond — popup blocked or wallet origin unreachable` (code 4002)

The popup opened but never posted its `ready` message to this page within `connectTimeoutMs`.
Common causes: the wallet origin is unreachable/offline, a custom `direct.walletUrl` doesn't match
what the wallet expects, the wallet is waiting for the user to unlock it (raise
`connectTimeoutMs`), or an extension/blocker is interfering. Messages from any origin other than
the pinned wallet origin (or from any window other than the popup) are ignored on purpose.

## Direct: error `4100` — "site not connected in Biatec Wallet"

The wallet has no session for this site's origin (the user removed it in the wallet, cleared its
data, or connected from a different origin such as `localhost` vs `127.0.0.1`), or the account
used is not one the user approved for the site. Call `connect({ method: 'direct' })` again.

## Direct: `DirectNetworkMismatchError` (code 4004)

The wallet is on a different network than the dApp's active network (compared by genesis hash).
Switch the network in the wallet, or call `setActiveNetwork()` to match; the error carries
`genesisHash` (requested) and `walletGenesisHashes` (when the wallet reports them).

## Direct: `Biatec Wallet returned a signed transaction … that does not match the transaction that was sent` (code 4200)

The adapter re-checks that each signed transaction the wallet returns has the same transaction id
as the one it sent, and rejects anything else (a compromised or buggy wallet page, or a
man-in-the-middle script, could otherwise swap the transaction). Nothing is returned to your code.
Treat it as a security event: verify the wallet origin (`adapter.directWalletOrigin`) and that you
are not overriding `direct.walletUrl` in production.

## Still stuck?

- Re-read [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.
- Check [RESEARCH.md](RESEARCH.md) for exactly what Biatec Wallet expects on the wire — useful if
  you're debugging with WalletConnect's own logging (`SignClient.init({ logger: 'debug', ... })`
  isn't exposed by this adapter's options today; fork `src/adapter.ts` locally to add it if you
  need relay-level tracing).
- Open an issue: <https://github.com/scholtz/biatec-wallet-use-wallet-client/issues>.
