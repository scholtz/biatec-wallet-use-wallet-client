---
'biatec-wallet-use-wallet-client': minor
---

Biatec Direct now works on every network. A persisted Direct session is no longer dropped on resume when the dApp's active network differs from the one it was connected on (the stored `genesisHash` is informational), and the early `capabilities.genesisHashes` check is gone. The legacy wallet error 4004 (`DirectNetworkMismatchError`) is still handled, but its message and the localized `wrongNetwork` dialog copy now tell the user to reload the wallet page or use another connection method instead of asking to switch network.
