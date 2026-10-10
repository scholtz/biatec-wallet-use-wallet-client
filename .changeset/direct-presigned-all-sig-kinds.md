---
'biatec-wallet-use-wallet-client': patch
---

Direct: a pre-signed transaction (a Uint8Array input) that carries a multisig (`msig`), logic signature (`lsig`) or post-quantum (`pqsig`) signature is now recognised as already signed (`null` result, no popup) instead of failing to decode as an unsigned transaction. Added unit tests for large multisig and Falcon (`pqsig`) signed-transaction replies.
