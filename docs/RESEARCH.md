# Research: building a use-wallet v5 adapter for Biatec Wallet

Compiled 2026-09-10 from the upstream sources listed at the end.

## 1. @txnlab/use-wallet v5 architecture

- **Monorepo, one npm package per wallet.** v5 (latest `5.0.0`) split the old single package into
  `@txnlab/use-wallet` (core) plus `packages/wallets/<name>` adapters (`-pera`, `-defly`,
  `-walletconnect`, `-kibisis`, `-lute`, `-kmd`, `-mnemonic`, `-web3auth`, …) and framework
  bindings (`-react`, `-vue`, `-solid`, `-svelte`). Consumers install only the adapters they use.
- **Factory functions replace the `WalletId` enum.** A wallet is registered with
  `wallets: [pera(), walletConnect({ projectId })]`. Each adapter exports
  `WALLET_ID = '<id>' as const` and a factory returning a `WalletAdapterConfig`:

  ```ts
  { id, metadata: { name, icon }, Adapter, options?, capabilities? }
  ```

  `capabilities.supportedNetworks` / `excludedNetworks` filter the wallet from `availableWallets`.

- **`@txnlab/use-wallet/adapter` is the entry point for adapter authors.** It exports
  `BaseWallet`, the `AdapterConstructorParams` / `AdapterStoreAccessor` interfaces, all shared
  types (`WalletAccount`, `WalletState`, `WalletTransaction`, `StdSignData…`), utilities
  (`compareAccounts`, `flattenTxnGroup`, `isTransactionArray`, `isSignedTxn`,
  `base64ToByteArray`, `byteArrayToBase64`, `formatJsonRpcRequest`), `SignDataError`,
  `SignTxnsError`, `ScopeType`, and the `custom()` adapter.
- **`BaseWallet<TOptions>` contract** (`packages/core/src/wallets/base.ts`):
  - abstract `connect(args?)`, `disconnect()`, `resumeSession()`, `signTransactions(txnGroup, indexesToSign?)`
  - optional `signData(data, metadata)` with `canSignData` flag, `withPrivateKey` with `canUsePrivateKey`
  - constructor receives `{ id, metadata, store, subscribe, getAlgodClient, options }`; the
    `store` is a scoped `AdapterStoreAccessor` pre-bound to the wallet key
    (`addWallet`, `removeWallet`, `setAccounts`, `setActiveAccount`, `setActive`, `getState`…)
  - helpers: `this.addresses`, `this.activeNetworkConfig` (has `caipChainId`), `this.logger`,
    `this.onDisconnect()`, `this.createStdSignData(data)` (ARC-0060 payload builder that resolves
    rekeyed auth addresses through algod and hashes `location.host`)
- **State** lives in a `@tanstack/store`; persisted under `localStorage['@txnlab/use-wallet:v5']`.
- **Testing helpers** at `@txnlab/use-wallet/testing`: `createTestHarness(walletKey)` returns a
  store + accessor so adapter tests need no WalletManager.
- **Two ways to add an unsupported wallet:**
  1. `custom({ provider })` — implement the `CustomProvider` interface
     (`connect`, `disconnect?`, `resumeSession?`, `signTransactions?`, `transactionSigner?`, `signData?`).
     Quick, but the wallet id is always `custom`, there is one slot, and no access to the
     store/logger/network config.
  2. **A proper adapter package extending `BaseWallet`** — what the official wallets do and what
     this repo implements. Stable id, own metadata, full store access, works with every framework
     binding unchanged.
- **Build/tooling used upstream:** pnpm workspaces, `tsdown` (ESM + d.ts + sourcemaps),
  `vitest`, ESLint 9 flat config with `typescript-eslint`, Prettier (no semi, single quotes,
  width 100), `publint`, semantic-release with conventional commits, Node ≥ 22.

## 2. The official WalletConnect adapter and the built-in "biatec" skin

`@txnlab/use-wallet-walletconnect` (`packages/wallets/walletconnect/src/adapter.ts`):

- lazily imports `@walletconnect/sign-client` and `@walletconnect/modal`;
- `connect()` calls `client.connect({ requiredNamespaces: { algorand: { chains: [activeCaipChainId], methods: ['algo_signTxn'], events: [] } } })`, opens the modal with the URI, awaits `approval()`;
- accounts come from `session.namespaces.algorand.accounts` (CAIP-10 strings, de-duplicated per address);
- `signTransactions()` builds ARC-0001 `WalletTransaction[]` (`{ txn: base64 }` for signable,
  `{ txn, signers: [] }` for the rest), sends `algo_signTxn` with `client.request({ chainId, topic, request })`,
  and returns `null` for unsigned positions;
- `resumeSession()` restores the last entry of `client.session`;
- it does **not** implement `signData`, and its `client`/`session` fields are `private`, so it
  cannot be subclassed to add ARC-0060 — hence this package re-implements the transport.
- v5 added **skins**: `walletConnect({ projectId, skin: 'biatec' })` yields wallet key
  `walletconnect:biatec` with the Biatec name/icon (`skins.ts` ships `biatec` and `voiwallet`).
  A skin is cosmetic only.

## 3. What Biatec Wallet supports over WalletConnect

From `scholtz/wallet` (`src/store/wc.ts`, `src/store/wcClient.ts`, `src/scripts/encoding/arc60.ts`):

- WalletConnect **v2** via `@reown/walletkit` (plus a legacy v1 path); the user pastes/scans the
  pairing URI inside the wallet. No `?uri=` deep link route exists today.
- `approveSession` approves **all** chains from
  `https://scholtz.github.io/AlgorandPublicData/genesis/genesis-list.json`
  (Algorand mainnet, testnet, betanet, fnet, Voi mainnet, Aramid mainnet, sandbox) with
  `methods: ['algo_signTxn', 'algo_signData']` and `events: ['chainChanged', 'accountsChanged']`.
  The active account (optionally all accounts) is exposed once per chain.
- `algo_signTxn` params: `[WalletTransaction[]]` per ARC-0001; result: array of base64 signed
  transactions (or `null`).
- `algo_signData` params: `[[StdSigData]]` where every byte field is **base64**:
  `{ data, signer, domain, authenticatorData, scope, encoding, requestId?, hdPath? }`.
  The wallet validates `authenticatorData[0..32] == SHA-256(domain)` and that `domain` equals the
  hostname of the session peer URL, then signs `SHA-256(data) || SHA-256(authenticatorData)` (AUTH scope).
  Result: `[{ signature: base64 } | null]`. User rejection is JSON-RPC error `5000`.
- CAIP-2 ids are `algorand:` + first 32 chars of the base64url genesis hash (matches
  `DEFAULT_NETWORK_CONFIG[*].caipChainId` in use-wallet).

## 4. Design decisions for this package

| Decision                                                                                                        | Reason                                                                                                 |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Standalone adapter extending `BaseWallet` (not `custom()`, not a subclass of the WC adapter)                    | Stable id `biatec`, ARC-0060 support, private fields upstream prevent subclassing.                     |
| Required namespace = active chain + `algo_signTxn`; optional = all configured chains + `algo_signData` + events | Old wallet versions still connect; new ones grant everything so `setActiveNetwork` needs no reconnect. |
| `onDisplayUri` hook                                                                                             | Lets dApps render their own QR (the WC modal explorer lists mobile wallets that are irrelevant here).  |
| `metadata` = dApp metadata, `displayMetadata` = picker name/icon                                                | Same naming as the upstream WC adapter, avoids the clash with `WalletFactoryOptions.metadata`.         |
| Extra `NetworkConfig`s for Voi/Aramid                                                                           | Endpoints from AlgorandPublicData `public-algod-providers.json`.                                       |
| WalletConnect SDK versions pinned exactly                                                                       | Same policy as upstream (`@walletconnect/modal 2.7.0`, `sign-client`/`types` 2.24.0).                  |

Future improvement: a `?uri=` route in Biatec Wallet would allow `onDisplayUri` to open
`https://wallet.biatec.io/...?uri=` directly instead of showing a QR.

## Sources

- use-wallet repo and AGENTS.md: <https://github.com/TxnLab/use-wallet>
- core adapter entry: <https://github.com/TxnLab/use-wallet/blob/main/packages/core/src/adapter.ts>
- `BaseWallet`: <https://github.com/TxnLab/use-wallet/blob/main/packages/core/src/wallets/base.ts>
- `custom()` adapter: <https://github.com/TxnLab/use-wallet/blob/main/packages/core/src/wallets/custom.ts>
- WalletConnect adapter + skins: <https://github.com/TxnLab/use-wallet/tree/main/packages/wallets/walletconnect/src>
- testing helpers: <https://github.com/TxnLab/use-wallet/blob/main/packages/core/src/testing.ts>
- docs: <https://txnlab.gitbook.io/use-wallet> (Custom Provider guide, WalletManager reference)
- Biatec Wallet source: <https://github.com/scholtz/wallet> (`src/store/wc.ts`, `src/scripts/encoding/arc60.ts`)
- Biatec Wallet app: <https://wallet.biatec.io>
- previous v3-style integration (`WalletId.BIATEC`) in the avm-wallet fork: <https://github.com/scholtz/avm-wallet>
- genesis list / algod providers: <https://github.com/scholtz/AlgorandPublicData>
- ARC-0001: <https://github.com/algorandfoundation/ARCs/blob/main/ARCs/arc-0001.md>
- ARC-0060: <https://github.com/algorandfoundation/ARCs/blob/main/ARCs/arc-0060.md>
- npm: <https://www.npmjs.com/package/@txnlab/use-wallet>, <https://www.npmjs.com/package/@txnlab/use-wallet-walletconnect>
