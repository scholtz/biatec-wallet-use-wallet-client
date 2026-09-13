---
'biatec-wallet-use-wallet-client': minor
---

Redesigned the built-in connect dialog to be a single window, not two — a method selector (WalletConnect / Liquid Auth) on one side and the QR code / pairing link for whichever method is selected on the other, updating live as you switch methods (similar to Pera Wallet's connect modal). Also added brief per-method instructions ("Open Biatec Wallet, tap the scan icon…") and a "Don't have Biatec Wallet?" link, so the dialog is self-explanatory without extra documentation.

Both bundled examples (`examples/react-ts`, `examples/vanilla-ts`) were simplified to demonstrate this default experience directly — they no longer set `onDisplayUri` or ship a second custom QR dialog, since the built-in one now covers that out of the box.
