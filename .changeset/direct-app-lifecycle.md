---
'biatec-wallet-use-wallet-client': minor
---

Direct: application creation, update and delete transactions are no longer refused by the adapter before the popup opens. Biatec Wallet's Direct popup already reviews and signs the whole application lifecycle, so dApps that deploy, update or delete applications (e.g. Algo Safe) can sign them through Direct. The adapter now applies the same limits as the wallet (programs only on a create or update, extra pages only on a create, program size within the declared pages).
A wallet page that predates lifecycle support still answers create/update with 4200; reloading the wallet page fixes it.
