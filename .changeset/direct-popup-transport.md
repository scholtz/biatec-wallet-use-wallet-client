---
'biatec-wallet-use-wallet-client': minor
---

Add the `direct` connection method: Biatec Wallet opens in a popup and exchanges ARC-0027 messages with the dApp over `window.postMessage` — no WalletConnect relay, no Liquid Auth service, works on `http://localhost`. It is enabled by default as a third tab ("Biatec Direct", with an "Open Biatec Wallet" button) in the built-in connect dialog; WalletConnect stays the default method (configurable with the new `defaultMethod` option).

- New options: `direct` (`BiatecDirectTransportOptions | false`), `walletconnect: false`, `defaultMethod`. `projectId` is now optional **only** when `walletconnect: false` is passed; otherwise the constructor still throws as before.
- New exports: `PopupBlockedError`, `DirectNetworkMismatchError`, `BiatecDirectTransportOptions`, `DIRECT_*` protocol constants, `EnableParams`/`EnableResult`/`EnableAccount`, `BiatecWalletAdapter#directWalletOrigin`; `BiatecMethod` and `BiatecAccountMetadata` gain `'direct'`.
- Security: the wallet origin is pinned and every inbound message must come from that origin **and** the popup window; outbound messages always use an explicit target origin; every wallet response is validated, returned account addresses are checked with `algosdk.isValidAddress`, and returned signed transactions must match the transactions that were sent.
- `connect({ method })` now rejects with `SessionError` when that method is disabled (previously `method: 'liquid'` silently fell back to WalletConnect when Liquid Auth was disabled).
- Direct must be started from a user gesture (a click handler, no `await` before the call) because browsers block other popups; see `docs/DIRECT_PROTOCOL.md`.
- The connect dialog is translated into all 10 locales for the new strings.
