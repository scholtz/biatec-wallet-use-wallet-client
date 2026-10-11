---
'biatec-wallet-use-wallet-client': minor
---

Direct: application creation and application update transactions are no longer refused by the adapter before the popup opens (delete was already allowed). Biatec Wallet's Direct popup reviews and signs the whole application lifecycle, so dApps that deploy or update applications can sign them through Direct. The adapter's pre-check now follows the wallet's refusal rules and wording, so it newly refuses, with 4200 and before any popup: program bytes on a call that is neither a create nor an update, extra pages on an existing application, programs larger than the declared pages, an unknown OnComplete, and a creation that closes out or clears state. A wallet page that predates lifecycle support still answers create/update with 4200; reloading the wallet page fixes it. The wallet itself still refuses application calls on a network it does not recognise, so there the popup opens and closes with 4200.
