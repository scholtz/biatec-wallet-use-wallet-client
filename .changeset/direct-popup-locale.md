---
'biatec-wallet-use-wallet-client': minor
---

Direct: the wallet popup now opens in the language of the dApp. `/direct` gets a `lang` query parameter with the adapter's current locale (the `locale` option, a live change of it, or the language the user picked in the connect dialog), so a dApp in Slovak no longer opens the wallet in English. Wallets that do not know `lang` ignore it.
