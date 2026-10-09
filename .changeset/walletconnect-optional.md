---
'biatec-wallet-use-wallet-client': minor
---

`projectId` is now optional, and `biatec()` can be called with no options. Without a (non-empty)
`projectId` the WalletConnect transport is simply not enabled, so the default integration offers
only Biatec Direct and Liquid Auth. WalletConnect stays available by passing
`biatec({ projectId })`; it is currently the only method that connects a wallet on a remote device
for key types Liquid Auth does not support (post-quantum, Ledger and multisig accounts).

Migration: previously a missing `projectId` threw `Missing required option: projectId`. Now it
silently means no WalletConnect. If you forgot the id in a setup that relies on WalletConnect, your
users will see only the Direct and Liquid Auth tabs (a warning is logged when `projectId` is passed but empty/undefined, e.g. an unset env var, or when `relayUrl`/`chains` are set without one). `defaultMethod: 'walletconnect'` without a `projectId`, or
disabling every method, still throws, now with a message that explains the missing `projectId`. A
persisted WalletConnect session is dropped cleanly on reload when WalletConnect is no longer
enabled. The docs, examples and integration skill are updated accordingly.
