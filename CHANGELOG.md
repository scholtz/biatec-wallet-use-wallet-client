# Changelog

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
