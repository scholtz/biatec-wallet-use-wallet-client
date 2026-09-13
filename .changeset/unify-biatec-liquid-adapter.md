---
'biatec-wallet-use-wallet-client': minor
---

BREAKING: merge the WalletConnect and Liquid Auth transports into a single `biatec()` wallet (id `biatec`). `biatecLiquid()`, `WALLET_ID_LIQUID`, `BiatecLiquidAdapter` and the standalone `BiatecLiquidOptions` are removed — Liquid Auth is now configured via the `liquid` option on `biatec({ ... })` (or `liquid: false` to disable it; it's enabled by default). When both transports are enabled, `connect()` shows a built-in method picker (Biatec logo, "WalletConnect" vs. "Liquid Auth"); pass `connect({ method: 'liquid' })` or `connect({ method: 'walletconnect' })` from your own UI to skip it. `onDisplayUri` now receives a second `info: { method, requestId?, origin? }` argument, and by default renders through a built-in dialog instead of `@walletconnect/modal`'s wallet-explorer modal — pass `useWalletConnectModal: true` to keep that modal for the WalletConnect step.

Migration: remove any `biatecLiquid({...})` entry from your `wallets` array and move those options under `biatec({ liquid: {...} })`; update `onDisplayUri` callbacks to accept the new second argument.
