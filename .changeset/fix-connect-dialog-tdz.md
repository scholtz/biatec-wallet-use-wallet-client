---
'biatec-wallet-use-wallet-client': minor
---

Fix `ReferenceError: Cannot access 'attempt' before initialization` thrown synchronously by `connect()` whenever both transports were enabled: the built-in connect dialog invoked its `onSelectMethod` callback for its own initial default-method selection before the adapter had finished setting up that callback's closure. The dialog's initial selection is now purely visual — the adapter explicitly kicks off the default transport afterward, exactly like a real tab click does for the other method.

BREAKING: removes `@walletconnect/modal` (deprecated upstream, with no non-deprecated replacement version — see https://docs.reown.com/appkit/upgrade/wcm) as a dependency. It only backed the optional `useWalletConnectModal` escape hatch, which is removed along with the `ModalOptions` type and the `enableExplorer` / `explorerRecommendedWalletIds` / `privacyPolicyUrl` / `termsOfServiceUrl` / `themeMode` / `themeVariables` options — the built-in connect dialog is the only WalletConnect pairing UI now (or your own, via `onDisplayUri`).
