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
 * WalletConnect v2, Liquid Auth (passkey-linked WebRTC) or Direct (the wallet in a popup, no
 * relay) — all enabled by default, and `connect()` shows a built-in picker when several are
 * available.
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
 * Disable Liquid Auth and Direct, and always connect over WalletConnect:
 * ```ts
 * biatec({ projectId: '<walletconnect-project-id>', liquid: false, direct: false })
 * ```
 *
 * Direct only — no relay, no signaling server, no projectId:
 * ```ts
 * biatec({ walletconnect: false, liquid: false })
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
  PopupBlockedError,
  DirectNetworkMismatchError,
  WALLET_ID,
  SIGN_TXN_METHOD,
  SIGN_DATA_METHOD,
  DEFAULT_RELAY_URL,
  BIATEC_WALLET_URL
} from './adapter'
export type {
  BiatecWalletOptions,
  BiatecLiquidTransportOptions,
  BiatecDirectTransportOptions,
  BiatecAccountMetadata,
  BiatecDisplayUriInfo,
  BiatecMethod,
  ConnectArgs,
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

// ---------- Connect dialog localization ------------------------------ //
// The languages Biatec Wallet itself ships (see SUPPORTED_LOCALES) — useful if you want to
// build a language switcher of your own and pass its value as `biatec({ locale })`.

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, resolveLocale } from './i18n'
export type { BiatecLocale, BiatecTranslation } from './i18n'

// ---------- Biatec Direct (popup) protocol constants ------------------- //

export {
  DIRECT_PROTOCOL_VERSION,
  DIRECT_READY_REFERENCE,
  DIRECT_ROUTE,
  DIRECT_WINDOW_NAME
} from './adapter-constants'

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
  EnableAccount,
  EnableParams,
  EnableResult,
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
