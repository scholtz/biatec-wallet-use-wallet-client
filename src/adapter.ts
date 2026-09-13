/**
 * Biatec Wallet adapter for @txnlab/use-wallet v5.
 *
 * A single wallet (id `biatec`) that supports two transports to the same physical wallet
 * (https://wallet.biatec.io): WalletConnect v2 (ARC-0001 `algo_signTxn` / ARC-0060
 * `algo_signData` JSON-RPC) and Liquid Auth (passkey-linked WebRTC carrying the same two
 * operations over an ARC-0027 envelope). When both are available, `connect()` shows a
 * built-in dialog (method selector + live QR/link) defaulting to WalletConnect; pass
 * `connect({ method: 'liquid' })` or `connect({ method: 'walletconnect' })` to skip it.
 * See docs/ARCHITECTURE.md.
 */
import type algosdk from 'algosdk'
import {
  BaseWallet,
  type AdapterConstructorParams,
  type StdSignDataResponse,
  type StdSignMetadata,
  type WalletAccount,
  type WalletMetadata
} from '@txnlab/use-wallet/adapter'
import { BIATEC_WALLET_URL } from './adapter-constants'
import { openConnectDialog, type ConnectDialogController } from './connect-dialog'
import { SessionError } from './errors'
import { ICON } from './icon'
import type { HelloResult } from './liquid/protocol'
import { LiquidTransport, type LiquidTransportOptions } from './transports/liquid-transport'
import type {
  BiatecAccountMetadata,
  BiatecDisplayUriInfo,
  BiatecMethod,
  TransportContext
} from './transports/types'
import {
  WalletConnectTransport,
  type WalletConnectTransportOptions
} from './transports/walletconnect-transport'

export { SessionError } from './errors'
export { WALLET_ID, BIATEC_WALLET_URL } from './adapter-constants'
export {
  DEFAULT_RELAY_URL,
  SIGN_DATA_METHOD,
  SIGN_TXN_METHOD,
  type SignDataResponse,
  type SignTxnsResponse,
  type WireStdSigData
} from './transports/walletconnect-transport'
export type { LiquidTransportOptions as BiatecLiquidTransportOptions } from './transports/liquid-transport'
export type { BiatecAccountMetadata, BiatecDisplayUriInfo, BiatecMethod } from './transports/types'

export interface BiatecWalletOptions extends WalletConnectTransportOptions {
  /**
   * Called with the pairing/session URI instead of showing the built-in dialog's content. Use
   * it to render your own QR code / deep link UI. `connect()` resolves once the wallet approves
   * the connection, so you can close your UI then. `info.method` tells you which transport
   * produced the URI. The built-in method picker still appears when both transports are enabled
   * and no `method` was given to `connect()` — this option only replaces the content step, not
   * the picker.
   */
  onDisplayUri?: (uri: string, info: BiatecDisplayUriInfo) => void | Promise<void>
  /**
   * Liquid Auth (passkey-linked WebRTC) transport configuration. Enabled by default with
   * Biatec's hosted signaling service; pass `false` to disable it entirely, in which case
   * `connect()` always uses WalletConnect and skips the method picker.
   */
  liquid?: LiquidTransportOptions | false
}

export interface ConnectArgs {
  /** Skip the built-in method picker and connect with this transport directly. */
  method?: BiatecMethod
}

export class BiatecWalletAdapter extends BaseWallet<BiatecWalletOptions> {
  private readonly walletConnect: WalletConnectTransport
  private readonly liquid: LiquidTransport | null
  private readonly userOnDisplayUri: BiatecWalletOptions['onDisplayUri']
  private activeMethod: BiatecMethod | null = null

  constructor(params: AdapterConstructorParams<BiatecWalletOptions>) {
    super(params)

    if (!this.options?.projectId) {
      this.logger.error('Missing required option: projectId')
      throw new Error('Missing required option: projectId')
    }

    const { onDisplayUri, liquid, enableSignData = true, ...walletConnectOptions } = this.options

    this.userOnDisplayUri = onDisplayUri
    this.canSignData = enableSignData

    const ctx = this.buildTransportContext()
    this.walletConnect = new WalletConnectTransport(ctx, {
      ...walletConnectOptions,
      enableSignData
    })
    this.liquid =
      liquid === false ? null : new LiquidTransport(ctx, { enableSignData, ...(liquid ?? {}) })
  }

  static defaultMetadata: WalletMetadata = {
    name: 'Biatec Wallet',
    icon: ICON
  }

  private buildTransportContext(): TransportContext {
    return {
      logger: this.logger,
      store: this.store,
      getMetadataName: () => this.metadata.name,
      getAddresses: () => this.addresses,
      getActiveNetworkConfig: () => this.activeNetworkConfig,
      getActiveNetwork: () => this.activeNetwork,
      createStdSignData: this.createStdSignData,
      onDisconnect: this.onDisconnect
    }
  }

  // ---------- WalletConnect-specific accessors ----------------------- //

  /** CAIP-2 chain id of the currently active network (WalletConnect transport). */
  public get activeChainId(): string {
    return this.walletConnect.activeChainId
  }

  /** Every CAIP-2 chain id the WalletConnect transport would request (active chain first). */
  public get supportedChainIds(): string[] {
    return this.walletConnect.supportedChainIds
  }

  /** Whether the live WalletConnect session advertises `algo_signData`. */
  public get sessionSupportsSignData(): boolean {
    return this.walletConnect.sessionSupportsSignData
  }

  // ---------- Liquid Auth-specific accessors -------------------------- //

  /** Metadata the wallet announced in the Liquid Auth hello handshake, if any. */
  public get walletInfo(): HelloResult | null {
    return this.liquid?.walletInfo ?? null
  }

  /** Whether the Liquid Auth WebRTC data channel is currently open. */
  public get isChannelOpen(): boolean {
    return this.liquid?.isChannelOpen ?? false
  }

  // ---------- Transport dispatch helpers ------------------------------ //

  private getTransport(method: BiatecMethod): WalletConnectTransport | LiquidTransport {
    return method === 'liquid' && this.liquid ? this.liquid : this.walletConnect
  }

  private makeOnDisplayUri(
    method: BiatecMethod,
    dialog?: ConnectDialogController
  ): (uri: string, extra?: { requestId: string; origin: string }) => void | Promise<void> {
    return (uri, extra) => {
      dialog?.setState(method, { status: 'ready', uri })
      if (!this.userOnDisplayUri) return undefined
      const info: BiatecDisplayUriInfo =
        method === 'liquid'
          ? { method, requestId: extra?.requestId ?? '', origin: extra?.origin ?? '' }
          : { method }
      return this.userOnDisplayUri(uri, info)
    }
  }

  private startTransport(
    method: BiatecMethod,
    onDisplayUri: (
      uri: string,
      extra?: { requestId: string; origin: string }
    ) => void | Promise<void>,
    signal?: AbortSignal
  ): Promise<WalletAccount[]> {
    return method === 'liquid' && this.liquid
      ? this.liquid.connect({ onDisplayUri, ...(signal ? { signal } : {}) })
      : this.walletConnect.connect({ onDisplayUri, ...(signal ? { signal } : {}) })
  }

  // ---------- Public: session lifecycle ------------------------------ //

  public connect = async (args?: ConnectArgs): Promise<WalletAccount[]> => {
    if (args?.method) {
      return this.connectWithDialog([args.method], args.method)
    }
    const availableMethods: BiatecMethod[] = this.liquid
      ? ['walletconnect', 'liquid']
      : ['walletconnect']
    return this.connectWithDialog(availableMethods, 'walletconnect')
  }

  private connectWithDialog(
    methods: BiatecMethod[],
    defaultMethod: BiatecMethod
  ): Promise<WalletAccount[]> {
    const showContent = !this.userOnDisplayUri

    // Nothing to pick and nothing for the built-in dialog to show — the consumer already knows
    // which method they want and renders their own UI for it.
    if (methods.length === 1 && !showContent) {
      return this.startTransport(defaultMethod, this.makeOnDisplayUri(defaultMethod)).then(
        (accounts) => {
          this.activeMethod = defaultMethod === 'liquid' && this.liquid ? 'liquid' : 'walletconnect'
          return accounts
        }
      )
    }

    return new Promise((resolve, reject) => {
      let settled = false
      const started = new Set<BiatecMethod>()
      const failed = new Set<BiatecMethod>()
      const controller = new AbortController()

      const dialog = openConnectDialog({
        methods,
        defaultMethod,
        showContent,
        onSelectMethod: (method) => attempt(method),
        onCancel: () => {
          if (settled) return
          settled = true
          controller.abort()
          reject(new SessionError('Connection cancelled'))
        }
      })

      const attempt = (method: BiatecMethod): void => {
        if (settled || started.has(method)) return
        started.add(method)
        if (showContent) dialog.setState(method, { status: 'connecting' })

        this.startTransport(method, this.makeOnDisplayUri(method, dialog), controller.signal)
          .then((accounts) => {
            if (settled) {
              void this.getTransport(method)
                .disconnect()
                .catch(() => undefined)
              return
            }
            settled = true
            this.activeMethod = method === 'liquid' && this.liquid ? 'liquid' : 'walletconnect'
            dialog.close()
            resolve(accounts)
          })
          .catch((error: unknown) => {
            if (settled) return
            failed.add(method)
            const message = error instanceof Error ? error.message : String(error)
            if (showContent) dialog.setState(method, { status: 'error', error: message })
            if (failed.size === methods.length) {
              settled = true
              dialog.close()
              reject(error)
            }
          })
      }

      attempt(defaultMethod)
    })
  }

  public disconnect = async (): Promise<void> => {
    this.onDisconnect()
    if (this.activeMethod === 'liquid' && this.liquid) {
      await this.liquid.disconnect()
    } else {
      await this.walletConnect.disconnect()
    }
    this.activeMethod = null
  }

  public resumeSession = async (): Promise<void> => {
    const walletState = this.store.getWalletState()
    if (!walletState) {
      this.logger.info('No session to resume')
      return
    }

    const metadata = (walletState.activeAccount ?? walletState.accounts[0])?.metadata as
      | Partial<BiatecAccountMetadata>
      | undefined

    if (metadata?.method === 'liquid') {
      if (!this.liquid) {
        this.logger.warn('Persisted session used Liquid Auth, but it is disabled; disconnecting')
        this.onDisconnect()
        return
      }
      if (typeof metadata.requestId !== 'string' || !metadata.requestId) {
        this.logger.warn('Persisted Liquid Auth session has no requestId, disconnecting')
        this.onDisconnect()
        return
      }
      this.activeMethod = 'liquid'
      await this.liquid.resume({
        requestId: metadata.requestId,
        origin: metadata.origin ?? BIATEC_WALLET_URL
      })
      return
    }

    this.activeMethod = 'walletconnect'
    await this.walletConnect.resume()
  }

  // ---------- Public: transaction signing (ARC-0001) ------------------ //

  public signTransactions = async <T extends algosdk.Transaction[] | Uint8Array[]>(
    txnGroup: T | T[],
    indexesToSign?: number[]
  ): Promise<(Uint8Array | null)[]> => {
    if (this.activeMethod === 'liquid' && this.liquid) {
      return this.liquid.signTransactions(txnGroup, indexesToSign)
    }
    return this.walletConnect.signTransactions(txnGroup, indexesToSign)
  }

  // ---------- Public: data signing (ARC-0060) -------------------------- //

  public signData = async (
    data: string,
    metadata: StdSignMetadata
  ): Promise<StdSignDataResponse> => {
    if (this.activeMethod === 'liquid' && this.liquid) {
      return this.liquid.signData(data, metadata)
    }
    return this.walletConnect.signData(data, metadata)
  }
}
