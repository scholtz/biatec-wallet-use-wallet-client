# API reference

Everything importable from `biatec-wallet-use-wallet-client`. For a narrative walkthrough see
[GETTING_STARTED.md](GETTING_STARTED.md); for internals see [ARCHITECTURE.md](ARCHITECTURE.md).

```ts
import {
  biatec,
  biatecLiquid,
  BiatecWalletAdapter,
  BiatecLiquidAdapter,
  BiatecFactoryOptions,
  BiatecWalletOptions,
  ModalOptions,
  SignClientOptions,
  SignTxnsResponse,
  SignDataResponse,
  WireStdSigData,
  SessionError,
  WALLET_ID,
  SIGN_TXN_METHOD,
  SIGN_DATA_METHOD,
  DEFAULT_RELAY_URL,
  BIATEC_WALLET_URL,
  BIATEC_ICON,
  BIATEC_CAIP_CHAIN_IDS,
  BIATEC_EXTRA_NETWORKS,
  BiatecNetworkId,
  caipChainIdFromGenesisHash
} from 'biatec-wallet-use-wallet-client'

// SignDataError and ScopeType are NOT re-exported by this package — they're generic
// use-wallet types shared by every adapter. Import them from the peer dependency instead:
import { ScopeType, SignDataError } from '@txnlab/use-wallet'
```

## `biatec(options)`

```ts
function biatec(options: BiatecFactoryOptions): WalletAdapterConfig
```

Factory that returns a `WalletAdapterConfig` for `@txnlab/use-wallet`'s `WalletManager`. This is
the one function almost every consumer calls.

```ts
new WalletManager({ wallets: [biatec({ projectId: '...' })] })
```

### `BiatecFactoryOptions`

`BiatecWalletOptions` (below) plus:

| Field             | Type                                      | Default            | Notes                                                                                                      |
| ----------------- | ----------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `displayMetadata` | `Partial<{ name: string; icon: string }>` | Biatec name + logo | Overrides how the wallet appears in **your** wallet picker (`wallet.metadata`). Not sent to Biatec Wallet. |

## `BiatecWalletOptions`

Passed straight through to the adapter constructor.

| Field                                                                                                                    | Type                                                             | Default                                  | Required | Notes                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `projectId`                                                                                                              | `string`                                                         | —                                        | **yes**  | WalletConnect Cloud project id from <https://cloud.reown.com>. Throws synchronously in the constructor if missing.                                                             |
| `relayUrl`                                                                                                               | `string`                                                         | `'wss://relay.walletconnect.com'`        | no       | Override only for a self-hosted relay.                                                                                                                                         |
| `metadata`                                                                                                               | `SignClientTypes.Metadata` (`{ name, description, url, icons }`) | auto-detected from `document`/`location` | no       | The **dApp** metadata shown to the user inside Biatec Wallet. Unrelated to `displayMetadata`.                                                                                  |
| `onDisplayUri`                                                                                                           | `(uri: string) => void \| Promise<void>`                         | —                                        | no       | Receive the WalletConnect pairing URI to render your own QR/deep link instead of the built-in modal. See [GETTING_STARTED.md § Custom QR UI](GETTING_STARTED.md#custom-qr-ui). |
| `enableSignData`                                                                                                         | `boolean`                                                        | `true`                                   | no       | Set `false` to omit `algo_signData` from the requested session methods and make `signData()` throw.                                                                            |
| `chains`                                                                                                                 | `string[]`                                                       | `[]`                                     | no       | Extra CAIP-2 ids requested as optional chains, beyond every network already configured on the `WalletManager`.                                                                 |
| `enableExplorer`, `explorerRecommendedWalletIds`, `privacyPolicyUrl`, `termsOfServiceUrl`, `themeMode`, `themeVariables` | see `@walletconnect/modal`'s `WalletConnectModalConfig`          | —                                        | no       | Passed to the WalletConnect modal. Ignored when `onDisplayUri` is set (no modal is created).                                                                                   |

## `BiatecWalletAdapter`

```ts
class BiatecWalletAdapter extends BaseWallet<BiatecWalletOptions>
```

The `BaseWallet` subclass registered by `biatec()`. You normally interact with it through
`WalletManager.getWallet('biatec')` or a framework hook (`useWallet()` in React), not directly —
but its extra members are useful for advanced cases:

| Member                                                                  | Type                                                                    | Description                                                                                                                                |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `activeChainId`                                                         | `get(): string`                                                         | CAIP-2 id of the currently active network, or `''` if that network has no `caipChainId` configured.                                        |
| `supportedChainIds`                                                     | `get(): string[]`                                                       | Every CAIP-2 id this adapter will request (active network first, then every network on the manager, then `options.chains`), de-duplicated. |
| `sessionSupportsSignData`                                               | `get(): boolean`                                                        | Whether the **live** WalletConnect session actually advertises `algo_signData` (older wallet versions may not).                            |
| `connect(args?)`                                                        | `(args?: Record<string, any>) => Promise<WalletAccount[]>`              | Opens a WalletConnect session. `args` is accepted for `BaseWallet` interface compatibility but unused.                                     |
| `disconnect()`                                                          | `() => Promise<void>`                                                   | Ends the WalletConnect session and clears stored accounts.                                                                                 |
| `resumeSession()`                                                       | `() => Promise<void>`                                                   | Restores a previously persisted session on page load. Called automatically by `WalletManager.resumeSessions()` / the framework providers.  |
| `signTransactions(txnGroup, indexesToSign?)`                            | see below                                                               | ARC-0001 transaction signing.                                                                                                              |
| `transactionSigner(txnGroup, indexesToSign)`                            | `(txns: algosdk.Transaction[], idx: number[]) => Promise<Uint8Array[]>` | Inherited from `BaseWallet`; wraps `signTransactions` in the shape `algosdk.AtomicTransactionComposer` expects.                            |
| `signData(data, metadata)`                                              | see below                                                               | ARC-0060 arbitrary data signing.                                                                                                           |
| `canSignData`                                                           | `boolean`                                                               | `true` unless constructed with `enableSignData: false`.                                                                                    |
| `metadata`                                                              | `WalletMetadata`                                                        | `{ name, icon }` shown in wallet pickers.                                                                                                  |
| `accounts`, `activeAccount`, `activeAddress`, `isConnected`, `isActive` | —                                                                       | Standard `BaseWallet` getters; see the [use-wallet docs](https://txnlab.gitbook.io/use-wallet).                                            |

### `signTransactions`

```ts
signTransactions<T extends algosdk.Transaction[] | Uint8Array[]>(
  txnGroup: T | T[],
  indexesToSign?: number[]
): Promise<(Uint8Array | null)[]>
```

- Accepts either `algosdk.Transaction[]` or already-encoded `Uint8Array[]`, and either a flat group
  or an array of groups (flattened automatically, matching `@txnlab/use-wallet`'s contract).
- For each transaction: if its sender is **not** one of `wallet.accounts` (a transaction another
  party must sign), it is sent with ARC-0001 `signers: []` so Biatec Wallet skips it, and the
  result for that position is `null`.
- If `indexesToSign` is given, only those positions are eligible for signing regardless of sender;
  every other position is sent with `signers: []`.
- Throws `SessionError` if called before `connect()`/`resumeSession()` has established a session.

### `signData`

```ts
signData(data: string, metadata: StdSignMetadata): Promise<StdSignDataResponse>
```

- `data` is a **base64** string of the bytes to sign. `metadata` is
  `{ scope: ScopeType.AUTH, encoding: 'base64' }` (ARC-0060 currently defines only the `AUTH`
  scope; import `ScopeType` from `@txnlab/use-wallet`).
- Internally builds the ARC-0060 `StdSignData` payload via `BaseWallet.createStdSignData()`
  (resolves the signer's public key — following a rekey's auth address when present — and sets
  `domain = location.host`, `authenticatorData = SHA-256(domain)`), sends it to Biatec Wallet, and
  returns `{ ...request, signature: Uint8Array }`.
- Throws `SignDataError` (from `@txnlab/use-wallet/adapter`) with an ARC-0060 error code:

  | Code   | When                                                                                                                                  |
  | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
  | `4001` | User rejected in Biatec Wallet, or the wallet returned no signature.                                                                  |
  | `4200` | `enableSignData: false` was set, or the live session doesn't advertise `algo_signData` (reconnect to pick up a newer wallet version). |
  | `4300` | Any other failure — relay error, malformed response, etc.                                                                             |

  Throws `SessionError` if called before a session exists.

## `biatecLiquid(options?)`

```ts
function biatecLiquid(options?: BiatecLiquidFactoryOptions): WalletAdapterConfig
```

Factory for the **Liquid Auth** transport (wallet id `biatec-liquid`, display name
"Biatec Wallet (Liquid Auth)"). Registers `BiatecLiquidAdapter`. Can be used next to `biatec()`.
Protocol details: [LIQUID_AUTH_PROTOCOL.md](LIQUID_AUTH_PROTOCOL.md).

### `BiatecLiquidOptions`

| Field                            | Type                                                                  | Default                                                  | Notes                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `origin`                         | `string`                                                              | `'https://liquid.biatec.io'`                             | Liquid Auth service the wallet authenticates against. Must be hosted under the wallet's domain (WebAuthn RP ID). |
| `iceServers`                     | `RTCIceServer[]`                                                      | public Google STUN (`stun.l.google.com:19302` … `stun4`) | ICE servers for the WebRTC connection. Add a TURN server for restrictive NATs.                                   |
| `onDisplayUri`                   | `(uri: string, info: { requestId; origin }) => void \| Promise<void>` | built-in copy-link dialog                                | Receive the `liquid://<host>/?requestId=…` link to render a QR code.                                             |
| `metadata`                       | `Partial<{ name; description; url; icons }>`                          | detected from the document                               | dApp metadata sent in the `biatec:hello` handshake and shown by the wallet.                                      |
| `providerId`                     | `string`                                                              | random UUID                                              | ARC-0027 `providerId` carried in every message.                                                                  |
| `enableSignData`                 | `boolean`                                                             | `true`                                                   | Expose `signData()` (ARC-0060 over `arc0060:sign_data`).                                                         |
| `connectTimeoutMs`               | `number`                                                              | `300000`                                                 | How long `connect()` waits for the wallet to pair.                                                               |
| `reconnectTimeoutMs`             | `number`                                                              | `30000`                                                  | How long a lazy reconnect (after a reload) waits for the wallet before failing with `4002`.                      |
| `requestTimeoutMs`               | `number`                                                              | `300000`                                                 | How long a signing request waits for the user's answer.                                                          |
| `displayMetadata` (factory only) | `Partial<{ name; icon }>`                                             | Biatec name + logo                                       | Wallet-picker appearance.                                                                                        |

### `BiatecLiquidAdapter`

Same `BaseWallet` surface as `BiatecWalletAdapter` (`connect`, `disconnect`, `resumeSession`,
`signTransactions`, `transactionSigner`, `signData`, `canSignData`, …) plus:

| Member          | Type                         | Description                                                                                                                                              |
| --------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `walletInfo`    | `get(): HelloResult \| null` | What the wallet announced in the hello handshake (address, name, version, methods).                                                                      |
| `isChannelOpen` | `get(): boolean`             | Whether the WebRTC data channel is currently open. `isConnected` can be `true` while this is `false` after a reload — the first request re-pairs lazily. |

Accounts carry `metadata: { requestId, origin }` (`LiquidAccountMetadata`) so the pairing can be
resumed. Errors from the wallet surface as `LiquidProviderError` (`code` = ARC-0027 code:
`4001` rejected, `4002` timed out, `4003` unsupported, `4200` invalid input); `signData()` maps
them to `SignDataError` like the WalletConnect adapter.

### Protocol helpers

Everything in `src/liquid/protocol.ts` is exported for custom integrations and for keeping the
wallet in sync: `generateLiquidDeepLink`, `parseLiquidDeepLink`, `encodeLiquidMessage`,
`decodeLiquidMessage`, `buildRequest`, `buildResponse`, `buildErrorResponse`,
`isLiquidResponse`, `toBase64Url`, `fromBase64Url`, the `LiquidReference` / `LiquidErrorCode`
maps, `DEFAULT_LIQUID_ORIGIN`, `DEFAULT_ICE_SERVERS`, `LIQUID_DATA_CHANNEL`, `LIQUID_SCHEME`,
`LiquidProviderError`, and the message types (`SignTransactionsParams/Result`,
`SignDataParams/Result`, `HelloParams/Result`, `LiquidStdSigData`, …). `LiquidSignalClient`
(the answer-role signaling client) is exported too.

## Constants

| Export              | Value                             | Use                                                                                           |
| ------------------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| `WALLET_ID`         | `'biatec'`                        | The wallet key registered in `WalletManager`. Use it with `manager.getWallet(WALLET_ID)`.     |
| `SIGN_TXN_METHOD`   | `'algo_signTxn'`                  | The WalletConnect JSON-RPC method for ARC-0001 signing.                                       |
| `SIGN_DATA_METHOD`  | `'algo_signData'`                 | The WalletConnect JSON-RPC method for ARC-0060 signing.                                       |
| `DEFAULT_RELAY_URL` | `'wss://relay.walletconnect.com'` | Default WalletConnect relay.                                                                  |
| `BIATEC_WALLET_URL` | `'https://wallet.biatec.io'`      | The wallet's web app, for "don't have Biatec Wallet?" links.                                  |
| `BIATEC_ICON`       | data URI                          | The Biatec logo as an SVG data URI, same value as `BiatecWalletAdapter.defaultMetadata.icon`. |

## Networks

### `BIATEC_CAIP_CHAIN_IDS`

```ts
const BIATEC_CAIP_CHAIN_IDS: {
  mainnet: string
  testnet: string
  betanet: string
  fnet: string
  voimain: string
  aramidmain: string
}
```

CAIP-2 chain ids (`algorand:<32-char genesis hash prefix>`) for every AVM chain Biatec Wallet
approves sessions for. The first four match `@txnlab/use-wallet`'s built-in `DEFAULT_NETWORK_CONFIG`
exactly; `voimain` and `aramidmain` are Biatec-Wallet-specific additions.

### `BIATEC_EXTRA_NETWORKS`

```ts
const BIATEC_EXTRA_NETWORKS: {
  voimain: NetworkConfig
  aramidmain: NetworkConfig
}
```

Ready-to-use `@txnlab/use-wallet` `NetworkConfig` entries (algod endpoint + genesis hash/id +
`caipChainId`) for Voi mainnet and Aramid mainnet, which `@txnlab/use-wallet` does not ship by
default. Register with `NetworkConfigBuilder`:

```ts
import { NetworkConfigBuilder, WalletManager } from '@txnlab/use-wallet'
import { biatec, BIATEC_EXTRA_NETWORKS } from 'biatec-wallet-use-wallet-client'

const networks = new NetworkConfigBuilder()
  .addNetwork('voimain', BIATEC_EXTRA_NETWORKS.voimain)
  .addNetwork('aramidmain', BIATEC_EXTRA_NETWORKS.aramidmain)
  .build()

const manager = new WalletManager({ wallets: [biatec({ projectId })], networks })
```

Algod endpoints point at public Nodely / Biatec-hosted nodes — free tier, rate-limited. Override
`algod` per network for production traffic.

### `caipChainIdFromGenesisHash(genesisHashB64)`

```ts
function caipChainIdFromGenesisHash(genesisHashB64: string): string
```

Converts a base64 genesis hash (as returned by `algod.GetTransactionParams()`'s `genesis-hash`, or
found in `NetworkConfig.genesisHash`) into its `algorand:...` CAIP-2 id. Use it to add a chain the
adapter doesn't know about yet to `options.chains`.

## Errors

| Class           | Exported from                                                                                                                 | When                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `SessionError`  | `biatec-wallet-use-wallet-client`                                                                                             | `signTransactions()` or `signData()` called before a session exists (i.e. before `connect()`/`resumeSession()` succeeded). |
| `SignDataError` | `@txnlab/use-wallet` (generic, shared by every adapter — see [`signData`](#signdata) above for the codes this adapter throws) | `signData()` fails: user rejection, unsupported, or other error.                                                           |

```ts
class SessionError extends Error {}
class SignDataError extends Error {
  code: number
  data?: any
}
```
