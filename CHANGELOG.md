# Changelog

## 0.2.0

### Minor Changes

- [`21809da`](https://github.com/scholtz/biatec-wallet-use-wallet-client/commit/21809daa5a9714ebdf62fb047a0d02dd53ff6ad8) Thanks [@scholtz](https://github.com/scholtz)! - Fixed low-contrast text on the built-in connect dialog's "Copy link" button in dark mode (bright teal background with white text). The button now uses a dedicated `--bcd-accent-contrast` token per theme instead of hardcoded white.
  
  Widened the dialog's layout on desktop viewports (≥640px): more padding, a wider method sidebar, and a larger max width, so the picker + QR layout doesn't feel cramped next to all the extra screen space.
  
  Localized the dialog into every language Biatec Wallet itself ships — Afrikaans, Czech, English, Spanish, Hungarian, Italian, Dutch, Russian, Slovak, and Turkish — auto-detected from the browser (`navigator.languages`) and overridable with the new `locale` option on `biatec({ ... })`. `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `BiatecLocale`, and `resolveLocale()` are exported for building a language switcher of your own.

- [`f5525bb`](https://github.com/scholtz/biatec-wallet-use-wallet-client/commit/f5525bbc46fd75e67524d9ad9df7ea08d3ff78b1) Thanks [@scholtz](https://github.com/scholtz)! - The built-in connect dialog now shows a language switcher — small circular flag icons (from [circle-flags](https://github.com/HatScripts/circle-flags), a widely used MIT-licensed flag icon set), one per supported language, below the method selector. Clicking a flag re-renders the dialog's text in place immediately, without closing it or losing any in-progress connection.
  
  Also nudged the method selector down (~50px) from the header on desktop layouts so the two-column picker + content view has better visual balance instead of sitting flush against the title.

- [`50e44fe`](https://github.com/scholtz/biatec-wallet-use-wallet-client/commit/50e44fe1587d82a0a1fb0c11e29765fdfbd2b85b) Thanks [@scholtz](https://github.com/scholtz)! - Fix `ReferenceError: Cannot access 'attempt' before initialization` thrown synchronously by `connect()` whenever both transports were enabled: the built-in connect dialog invoked its `onSelectMethod` callback for its own initial default-method selection before the adapter had finished setting up that callback's closure. The dialog's initial selection is now purely visual — the adapter explicitly kicks off the default transport afterward, exactly like a real tab click does for the other method.
  
  BREAKING: removes `@walletconnect/modal` (deprecated upstream, with no non-deprecated replacement version — see https://docs.reown.com/appkit/upgrade/wcm) as a dependency. It only backed the optional `useWalletConnectModal` escape hatch, which is removed along with the `ModalOptions` type and the `enableExplorer` / `explorerRecommendedWalletIds` / `privacyPolicyUrl` / `termsOfServiceUrl` / `themeMode` / `themeVariables` options — the built-in connect dialog is the only WalletConnect pairing UI now (or your own, via `onDisplayUri`).

- [`69cc8b5`](https://github.com/scholtz/biatec-wallet-use-wallet-client/commit/69cc8b59382aea32496e3d5a2e6d3c36599745d7) Thanks [@scholtz-aures](https://github.com/scholtz-aures)! - Add the Liquid Auth transport: `biatecLiquid()` / `BiatecLiquidAdapter` pair with Biatec Wallet through a Liquid Auth service (passkey-authenticated linking) and a direct WebRTC data channel negotiated with public Google STUN servers, speaking ARC-0027 messages — ARC-0001 transaction signing plus an ARC-0060 `arc0060:sign_data` extension. Exports the wire-protocol helpers (`generateLiquidDeepLink`, `parseLiquidDeepLink`, `encodeLiquidMessage`, `decodeLiquidMessage`, …) and documents the protocol in `docs/LIQUID_AUTH_PROTOCOL.md`.

- [`d9bad4b`](https://github.com/scholtz/biatec-wallet-use-wallet-client/commit/d9bad4b4ee295a5af89628fab6eb516b97943df7) Thanks [@scholtz](https://github.com/scholtz)! - Redesigned the built-in connect dialog to be a single window, not two — a method selector (WalletConnect / Liquid Auth) on one side and the QR code / pairing link for whichever method is selected on the other, updating live as you switch methods (similar to Pera Wallet's connect modal). Also added brief per-method instructions ("Open Biatec Wallet, tap the scan icon…") and a "Don't have Biatec Wallet?" link, so the dialog is self-explanatory without extra documentation.
  
  Both bundled examples (`examples/react-ts`, `examples/vanilla-ts`) were simplified to demonstrate this default experience directly — they no longer set `onDisplayUri` or ship a second custom QR dialog, since the built-in one now covers that out of the box.

- [`d7f18e1`](https://github.com/scholtz/biatec-wallet-use-wallet-client/commit/d7f18e1743e725b3ab28b7627c391b80e8966899) Thanks [@scholtz](https://github.com/scholtz)! - BREAKING: merge the WalletConnect and Liquid Auth transports into a single `biatec()` wallet (id `biatec`). `biatecLiquid()`, `WALLET_ID_LIQUID`, `BiatecLiquidAdapter` and the standalone `BiatecLiquidOptions` are removed — Liquid Auth is now configured via the `liquid` option on `biatec({ ... })` (or `liquid: false` to disable it; it's enabled by default). When both transports are enabled, `connect()` shows a modern, dark/light-aware built-in dialog with a method selector (WalletConnect / Liquid Auth) next to a live QR code for whichever method is selected — WalletConnect is selected by default so its QR is visible immediately, and switching tabs connects the other transport on demand; pass `connect({ method: 'liquid' })` or `connect({ method: 'walletconnect' })` from your own UI to skip the selector. `onDisplayUri` now receives a second `info: { method, requestId?, origin? }` argument, and by default renders through the same built-in dialog instead of `@walletconnect/modal`'s wallet-explorer modal — pass `useWalletConnectModal: true` to keep that modal for the WalletConnect step. The `qrcode` package is now a direct dependency (lazy-loaded, only when the dialog opens) so the built-in dialog can render an actual scannable QR code.
  
  Migration: remove any `biatecLiquid({...})` entry from your `wallets` array and move those options under `biatec({ liquid: {...} })`; update `onDisplayUri` callbacks to accept the new second argument.

### Patch Changes

- [`b983072`](https://github.com/scholtz/biatec-wallet-use-wallet-client/commit/b983072d96949b1a58b001f2a8d9b672584b0231) Thanks [@scholtz](https://github.com/scholtz)! - The built-in connect dialog now also respects an explicit `data-theme="dark"` / `data-theme="light"` attribute on `<html>` (in addition to the system's `prefers-color-scheme`), so a host page with its own light/dark toggle always gets a matching dialog instead of one that only follows the OS setting.
  
  Both bundled examples (`examples/react-ts`, `examples/vanilla-ts`) now ship a light/dark toggle button that sets this attribute and persists the choice, demonstrating the pattern end to end.

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-09-10

### Added

- `biatec()` factory and `BiatecWalletAdapter` for `@txnlab/use-wallet` v5.
- WalletConnect v2 transport (`@walletconnect/sign-client`) with the WalletConnect modal
  or a custom `onDisplayUri` callback for self-rendered QR codes.
- ARC-0001 transaction signing via `algo_signTxn`, including `signers: []` handling for
  transactions the connected accounts do not own.
- ARC-0060 arbitrary data signing via `algo_signData` (`canSignData = true`), with
  ARC-0060 error codes (4001 rejected, 4200 unsupported, 4300 invalid).
- Multi-chain sessions: the active network is requested as required, every configured
  `caipChainId` plus `options.chains` as optional, so switching networks needs no reconnect.
- `BIATEC_CAIP_CHAIN_IDS`, `BIATEC_EXTRA_NETWORKS` (Voi mainnet, Aramid mainnet) and
  `caipChainIdFromGenesisHash()` helpers.
