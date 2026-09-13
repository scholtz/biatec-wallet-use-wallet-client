import type { WalletAdapterConfig, WalletMetadata } from '@txnlab/use-wallet/adapter'
import { BiatecWalletAdapter, WALLET_ID } from './adapter'
import type { BiatecWalletOptions } from './adapter'

export interface BiatecFactoryOptions extends BiatecWalletOptions {
  /**
   * Override the wallet's display name / icon shown by your dApp's wallet picker.
   *
   * Note: the `metadata` option is the dApp metadata sent to the wallet (name, description,
   * url, icons), mirroring `@txnlab/use-wallet-walletconnect`. Use `displayMetadata` for the
   * wallet-list appearance instead.
   */
  displayMetadata?: Partial<WalletMetadata>
}

/**
 * Factory for the Biatec Wallet adapter. A single wallet entry that supports connecting over
 * WalletConnect v2 or Liquid Auth (passkey-linked WebRTC) — both are enabled by default, and
 * `connect()` shows a built-in picker when both are available.
 *
 * @example
 * ```ts
 * import { WalletManager } from '@txnlab/use-wallet'
 * import { biatec } from 'biatec-wallet-use-wallet-client'
 *
 * const manager = new WalletManager({
 *   wallets: [biatec({ projectId: '<walletconnect-project-id>' })]
 * })
 * ```
 *
 * Disable Liquid Auth and always connect over WalletConnect:
 * ```ts
 * biatec({ projectId: '<walletconnect-project-id>', liquid: false })
 * ```
 */
export function biatec(options: BiatecFactoryOptions): WalletAdapterConfig {
  const { displayMetadata, ...adapterOptions } = options
  return {
    id: WALLET_ID,
    metadata: { ...BiatecWalletAdapter.defaultMetadata, ...displayMetadata },
    Adapter: BiatecWalletAdapter as unknown as WalletAdapterConfig['Adapter'],
    options: adapterOptions as unknown as Record<string, unknown>
  }
}

export {
  BiatecWalletAdapter,
  SessionError,
  WALLET_ID,
  SIGN_TXN_METHOD,
  SIGN_DATA_METHOD,
  DEFAULT_RELAY_URL,
  BIATEC_WALLET_URL
} from './adapter'
export type {
  BiatecWalletOptions,
  BiatecLiquidTransportOptions,
  BiatecAccountMetadata,
  BiatecDisplayUriInfo,
  BiatecMethod,
  ConnectArgs,
  ModalOptions,
  SignTxnsResponse,
  SignDataResponse,
  WireStdSigData
} from './adapter'
export { ICON as BIATEC_ICON } from './icon'
export {
  BIATEC_CAIP_CHAIN_IDS,
  BIATEC_EXTRA_NETWORKS,
  caipChainIdFromGenesisHash
} from './networks'
export type { BiatecNetworkId } from './networks'

// ---------- Liquid Auth transport-level utilities -------------------- //
// Useful for consumers building fully custom pairing UI; no adapter coupling.

export { LiquidSignalClient, LiquidSignalError } from './liquid/signaling'
export type { LinkMessage, LiquidPeerSession } from './liquid/signaling'
export {
  DEFAULT_ICE_SERVERS,
  DEFAULT_LIQUID_ORIGIN,
  LIQUID_DATA_CHANNEL,
  LIQUID_SCHEME,
  LiquidErrorCode,
  LiquidProviderError,
  LiquidReference,
  buildErrorResponse,
  buildRequest,
  buildResponse,
  decodeLiquidMessage,
  encodeLiquidMessage,
  fromBase64Url,
  generateLiquidDeepLink,
  isLiquidResponse,
  parseLiquidDeepLink,
  toBase64Url
} from './liquid/protocol'
export type {
  HelloParams,
  HelloResult,
  LiquidDeepLink,
  LiquidErrorPayload,
  LiquidMessage,
  LiquidPeerMetadata,
  LiquidRequestMessage,
  LiquidResponseMessage,
  LiquidStdSigData,
  LiquidWalletTransaction,
  SignDataParams,
  SignDataResult,
  SignTransactionsParams,
  SignTransactionsResult
} from './liquid/protocol'
