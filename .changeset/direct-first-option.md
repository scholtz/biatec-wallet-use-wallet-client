---
'biatec-wallet-use-wallet-client': minor
---

The built-in connect dialog now lists Biatec Direct first (order: Direct, WalletConnect, Liquid Auth) and pre-selects it when you did not pass `defaultMethod` and the dialog shows content (no `onDisplayUri`). A default of Direct that was only chosen implicitly never opens the popup by itself: `connect()` shows the "Open Biatec Wallet" button and the popup opens on that click. An explicit `defaultMethod: 'direct'` or `connect({ method: 'direct' })` still opens it immediately.

Migration: WalletConnect no longer starts automatically unless it is the default. To show the WalletConnect QR first, pass `defaultMethod: 'walletconnect'`. Integrators with their own `onDisplayUri` UI, or with Direct disabled, keep WalletConnect (else Liquid Auth) as the default and need no change. Direct-only setups (`walletconnect: false, liquid: false`) now also see the _Open Biatec Wallet_ button first instead of an immediately opened popup; pass `defaultMethod: 'direct'` or call `connect({ method: 'direct' })` to keep opening the popup immediately.
