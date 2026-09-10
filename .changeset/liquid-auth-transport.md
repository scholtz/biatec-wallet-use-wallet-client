---
'biatec-wallet-use-wallet-client': minor
---

Add the Liquid Auth transport: `biatecLiquid()` / `BiatecLiquidAdapter` pair with Biatec Wallet through a Liquid Auth service (passkey-authenticated linking) and a direct WebRTC data channel negotiated with public Google STUN servers, speaking ARC-0027 messages — ARC-0001 transaction signing plus an ARC-0060 `arc0060:sign_data` extension. Exports the wire-protocol helpers (`generateLiquidDeepLink`, `parseLiquidDeepLink`, `encodeLiquidMessage`, `decodeLiquidMessage`, …) and documents the protocol in `docs/LIQUID_AUTH_PROTOCOL.md`.
