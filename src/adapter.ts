/**
 * Biatec Wallet adapter for @txnlab/use-wallet v5.
 *
 * A single wallet (id `biatec`) that supports three transports to the same physical wallet
 * (https://wallet.biatec.io): WalletConnect v2 (ARC-0001 `algo_signTxn` / ARC-0060
 * `algo_signData` JSON-RPC), Liquid Auth (passkey-linked WebRTC carrying the same two
 * operations over an ARC-0027 envelope) and Direct (the wallet in a popup, ARC-0027 over
 * `postMessage`, no relay). When several are available, `connect()` shows a built-in dialog
 * (method selector + live QR/link or "Open Biatec Wallet" button) listing Direct first and
 * pre-selecting it (WalletConnect when you pass your own `onDisplayUri`);
 * pass `connect({ method })` to skip the picker. See docs/ARCHITECTURE.md.
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
import {
  openConnectDialog,
  type ConnectDialogController,
  type ConnectErrorKind
} from './connect-dialog'
import { DirectNetworkMismatchError, PopupBlockedError, SessionError } from './errors'
import { LiquidErrorCode, LiquidProviderError } from './liquid/protocol'
import { ICON } from './icon'
import type { HelloResult } from './liquid/protocol'
import { DirectTransport, type DirectTransportOptions } from './transports/direct-transport'
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

export { DirectNetworkMismatchError, PopupBlockedError, SessionError } from './errors'
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
export type { DirectTransportOptions as BiatecDirectTransportOptions } from './transports/direct-transport'
export type { BiatecAccountMetadata, BiatecDisplayUriInfo, BiatecMethod } from './transports/types'

export interface BiatecWalletOptions extends Omit<WalletConnectTransportOptions, 'projectId'> {
  /**
   * WalletConnect Cloud project id (https://cloud.reown.com). OPTIONAL: when it is omitted (or
   * empty / whitespace) the WalletConnect transport is simply not enabled and the dApp offers
   * Biatec Direct and Liquid Auth only — no relay, no Cloud account. Add one if your users need
   * to connect a wallet on ANOTHER device for key types Liquid Auth does not support
   * (post-quantum, Ledger, multisig): WalletConnect is currently the only remote-device method
   * for those.
   */
  projectId?: string
  /**
   * Pass `false` to disable the WalletConnect transport even though a `projectId` is given.
   * Without a `projectId` WalletConnect is already off, so this is only needed to switch it off
   * explicitly — e.g. `biatec({ walletconnect: false, liquid: false })` ships a dApp that talks
   * to the wallet purely through the Direct popup, with no relay and no signaling server.
   */
  walletconnect?: false
  /**
   * Biatec Direct (popup + postMessage) transport configuration. Enabled by default and needs
   * no `projectId` (it works with every account type the wallet can sign for itself, but only
   * when the wallet runs in the same browser as the dApp); pass `false` to disable it. Direct must be started from a user gesture (a click handler): the
   * wallet opens in a popup, which browsers block otherwise.
   */
  direct?: DirectTransportOptions | false
  /**
   * The method pre-selected in the connect dialog. Must be an enabled method (`'walletconnect'`
   * is only enabled when a `projectId` is given). When omitted it
   * is `'direct'` if enabled and the built-in dialog shows content (no `onDisplayUri`);
   * otherwise `'walletconnect'` if enabled, else `'liquid'`, else `'direct'`. A default of
   * `'direct'` that was only chosen implicitly never opens the popup by itself: the dialog shows
   * the "Open Biatec Wallet" button. Pass `defaultMethod: 'direct'` explicitly to keep opening
   * the popup immediately inside the `connect()` click.
   */
  defaultMethod?: BiatecMethod
  /**
   * Called with the pairing/session URI instead of showing the built-in dialog's content. Use
   * it to render your own QR code / deep link UI. `connect()` resolves once the wallet approves
   * the connection, so you can close your UI then. `info.method` tells you which transport
   * produced the URI. The built-in method picker still appears when more than one method is enabled
   * and no `method` was given to `connect()` — this option only replaces the content step, not
   * the picker.
   */
  onDisplayUri?: (uri: string, info: BiatecDisplayUriInfo) => void | Promise<void>
  /**
   * Liquid Auth (passkey-linked WebRTC) transport configuration. Enabled by default with
   * Biatec's hosted signaling service and needs no `projectId`; it reaches a wallet on another
   * device but only for plain and HD accounts (not Ledger, post-quantum or multisig). Pass
   * `false` to disable it entirely. The method picker is skipped only when exactly ONE method
   * is enabled, so to keep the old "always WalletConnect" behaviour also pass `projectId`,
   * `direct: false` and `liquid: false`.
   */
  liquid?: LiquidTransportOptions | false
  /**
   * BCP-47 language tag (e.g. `'sk'`, `'de-DE'`) to force the built-in dialog's language.
   * Defaults to the browser's own language, falling back to English when it isn't one of the
   * languages Biatec Wallet ships (see `SUPPORTED_LOCALES` exported from this package). Has no
   * effect when `onDisplayUri` replaces the dialog's content entirely.
   */
  locale?: string
}

export interface ConnectArgs {
  /** Skip the built-in method picker and connect with this transport directly. */
  method?: BiatecMethod
}

/** Maps a failed connect attempt to the localized copy the dialog shows (raw text is only logged). */
export function classifyConnectError(error: unknown): ConnectErrorKind | undefined {
  if (error instanceof PopupBlockedError) return 'popupBlocked'
  if (error instanceof DirectNetworkMismatchError) return 'wrongNetwork'
  if (error instanceof LiquidProviderError) {
    if (error.code === LiquidErrorCode.networkNotSupported) return 'wrongNetwork'
    if (error.code === LiquidErrorCode.timedOut) return 'timedOut'
    if (error.code === LiquidErrorCode.cancelled) {
      return /closed/i.test(error.message) ? 'walletClosed' : 'userRejected'
    }
  }
  // WalletConnect rejections are plain `{ code, message }` objects (5000 = user rejected, 4001
  // = EIP-1193 style rejection) or Errors whose message says so.
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code: unknown }).code
      : undefined
  const text =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown } | null)?.message ?? '')
  if (code === 5000 || code === 4001 || /user rejected|rejected/i.test(text)) return 'userRejected'
  return undefined
}

/** What the three transports have in common once connected. */
type SigningTransport = Pick<WalletConnectTransport, 'signTransactions' | 'signData' | 'disconnect'>

export class BiatecWalletAdapter extends BaseWallet<BiatecWalletOptions> {
  private readonly walletConnect: WalletConnectTransport | null
  private readonly liquid: LiquidTransport | null
  private readonly direct: DirectTransport | null
  private readonly userOnDisplayUri: BiatecWalletOptions['onDisplayUri']
  private readonly locale: string | undefined
  private readonly enabledMethods: BiatecMethod[]
  private readonly defaultMethod: BiatecMethod
  /** False when `direct` is the default only implicitly: its popup must not open on connect(). */
  private readonly defaultAutoStart: boolean
  private activeMethod: BiatecMethod | null = null

  constructor(params: AdapterConstructorParams<BiatecWalletOptions>) {
    super(params)

    const {
      onDisplayUri,
      liquid,
      direct,
      walletconnect,
      defaultMethod,
      locale,
      projectId,
      enableSignData = true,
      ...walletConnectOptions
    } = this.options ?? {}

    const trimmedProjectId = typeof projectId === 'string' ? projectId.trim() : ''
    const walletConnectEnabled = walletconnect !== false && trimmedProjectId !== ''
    if (
      walletconnect !== false &&
      trimmedProjectId === '' &&
      (walletConnectOptions.relayUrl !== undefined || walletConnectOptions.chains !== undefined)
    ) {
      this.logger.warn(
        'WalletConnect options were given without a projectId: WalletConnect stays disabled ' +
          '(only Direct and Liquid Auth are offered). Pass projectId to enable it.'
      )
    }

    this.userOnDisplayUri = onDisplayUri
    this.locale = locale
    this.canSignData = enableSignData

    const ctx = this.buildTransportContext()
    this.walletConnect = walletConnectEnabled
      ? new WalletConnectTransport(ctx, {
          ...walletConnectOptions,
          projectId: trimmedProjectId,
          enableSignData
        })
      : null
    this.liquid =
      liquid === false ? null : new LiquidTransport(ctx, { enableSignData, ...(liquid ?? {}) })
    this.direct =
      direct === false ? null : new DirectTransport(ctx, { enableSignData, ...(direct ?? {}) })

    const enabled: BiatecMethod[] = []
    if (this.direct) enabled.push('direct')
    if (this.walletConnect) enabled.push('walletconnect')
    if (this.liquid) enabled.push('liquid')
    this.enabledMethods = enabled
    if (enabled.length === 0) {
      this.logger.error('No connection method enabled')
      throw new Error(
        'At least one connection method (direct, liquid, walletconnect) must be enabled. ' +
          'WalletConnect is only enabled when you pass a projectId ' +
          '(biatec({ projectId }), free at https://cloud.reown.com); Direct and Liquid Auth ' +
          'need none but are switched off by direct: false / liquid: false.'
      )
    }
    if (defaultMethod && !enabled.includes(defaultMethod)) {
      this.logger.error(`defaultMethod "${defaultMethod}" is not enabled`)
      const hint =
        defaultMethod === 'walletconnect'
          ? ' (WalletConnect needs a projectId: biatec({ projectId }), and walletconnect must not be false)'
          : ''
      throw new Error(`defaultMethod "${defaultMethod}" is not an enabled connection method${hint}`)
    }
    if (defaultMethod) {
      this.defaultMethod = defaultMethod
      this.defaultAutoStart = true
    } else {
      const preferDirect = enabled.includes('direct') && !onDisplayUri
      this.defaultMethod = preferDirect
        ? 'direct'
        : (enabled.find((method) => method !== 'direct') ?? 'direct')
      // An implicitly chosen Direct default waits for the "Open Biatec Wallet" click.
      this.defaultAutoStart = this.defaultMethod !== 'direct'
    }
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
      onDisconnect: this.onDisconnect,
      getAuthAddr: async (address) => {
        const info = await this.getAlgodClient()
          .accountInformation(address)
          // `authAddr` is still returned; skip the (possibly huge) asset/app lists.
          .exclude('all')
          .do()
        return info.authAddr?.toString()
      }
    }
  }

  // ---------- WalletConnect-specific accessors ----------------------- //

  /** CAIP-2 chain id of the currently active network (WalletConnect transport). */
  public get activeChainId(): string {
    return this.walletConnect?.activeChainId ?? ''
  }

  /** Every CAIP-2 chain id the WalletConnect transport would request (active chain first). */
  public get supportedChainIds(): string[] {
    return this.walletConnect?.supportedChainIds ?? []
  }

  /** Whether the live WalletConnect session advertises `algo_signData`. */
  public get sessionSupportsSignData(): boolean {
    return this.walletConnect?.sessionSupportsSignData ?? false
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

  // ---------- Direct-specific accessors -------------------------------- //

  /** The pinned origin of the wallet the Direct (popup) transport talks to; `null` if disabled. */
  public get directWalletOrigin(): string | null {
    return this.direct?.origin ?? null
  }

  // ---------- Transport dispatch helpers ------------------------------ //

  private getTransport(method: BiatecMethod): SigningTransport {
    const transport =
      method === 'liquid' ? this.liquid : method === 'direct' ? this.direct : this.walletConnect
    if (!transport) throw new SessionError(`Connection method "${method}" is not enabled`)
    return transport
  }

  /** The transport of the live session; WalletConnect for legacy/untagged sessions. */
  private activeTransport(): SigningTransport {
    return this.getTransport(this.activeMethod ?? 'walletconnect')
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

  /**
   * Starts `method`'s connect(). Deliberately not `async` and with no `await` before the
   * transport call, so for `direct` the popup is opened synchronously within whatever user
   * gesture led here.
   */
  private startTransport(
    method: BiatecMethod,
    onDisplayUri: (
      uri: string,
      extra?: { requestId: string; origin: string }
    ) => void | Promise<void>,
    signal?: AbortSignal
  ): Promise<WalletAccount[]> {
    const abort = signal ? { signal } : {}
    if (method === 'direct') {
      if (!this.direct) return Promise.reject(new SessionError('Direct is not enabled'))
      return this.direct.connect(abort)
    }
    if (method === 'liquid') {
      if (!this.liquid) return Promise.reject(new SessionError('Liquid Auth is not enabled'))
      return this.liquid.connect({ onDisplayUri, ...abort })
    }
    if (!this.walletConnect) {
      return Promise.reject(new SessionError('WalletConnect is not enabled'))
    }
    return this.walletConnect.connect({ onDisplayUri, ...abort })
  }

  // ---------- Public: session lifecycle ------------------------------ //

  public connect = async (args?: ConnectArgs): Promise<WalletAccount[]> => {
    if (args?.method) {
      if (!this.enabledMethods.includes(args.method)) {
        throw new SessionError(`Connection method "${args.method}" is not enabled`)
      }
      return this.connectWithDialog([args.method], args.method, true)
    }
    return this.connectWithDialog(this.enabledMethods, this.defaultMethod, this.defaultAutoStart)
  }

  private connectWithDialog(
    methods: BiatecMethod[],
    defaultMethod: BiatecMethod,
    autoStart: boolean
  ): Promise<WalletAccount[]> {
    const showContent = !this.userOnDisplayUri

    // Nothing to pick and nothing for the built-in dialog to show — the consumer already knows
    // which method they want and renders their own UI for it.
    if (methods.length === 1 && !showContent) {
      return this.startTransport(defaultMethod, this.makeOnDisplayUri(defaultMethod)).then(
        (accounts) => {
          this.activeMethod = defaultMethod
          return accounts
        }
      )
    }

    return new Promise((resolve, reject) => {
      let settled = false
      const started = new Set<BiatecMethod>()
      const failed = new Set<BiatecMethod>()
      /** Methods the user explicitly picked in the dialog (as opposed to the pre-selected default). */
      const picked = new Set<BiatecMethod>()
      const controller = new AbortController()

      // Everything from here to `attempt(defaultMethod)` below is synchronous (no `await`), so
      // when `defaultMethod` is `direct` its popup opens inside the caller's user gesture.
      const dialog = openConnectDialog({
        methods,
        defaultMethod,
        showContent,
        ...(this.locale ? { locale: this.locale } : {}),
        // For `direct` with dialog content this is the "Open Biatec Wallet" button's click
        // handler, so `attempt` -> `window.open` runs synchronously inside that click.
        onSelectMethod: (method) => {
          picked.add(method)
          attempt(method)
        },
        onCancel: () => {
          if (settled) return
          settled = true
          controller.abort()
          reject(new SessionError('Connection cancelled'))
        }
      })

      const attempt = (method: BiatecMethod): void => {
        if (settled) return
        if (method === 'direct') {
          // The popup can be (re)opened by the user repeatedly: refocus a live one, otherwise
          // start over after a blocked/closed attempt.
          if (this.direct?.isBusy) {
            this.direct.focusPopup()
            return
          }
          failed.delete(method)
        } else if (started.has(method)) {
          return
        }
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
            this.activeMethod = method
            dialog.close()
            // Abort every losing attempt (WalletConnect/Liquid pairings still pending, a Direct
            // popup still open); a loser that completes late can no longer write accounts.
            controller.abort()
            resolve(accounts)
          })
          .catch((error: unknown) => {
            if (settled) return
            const message = error instanceof Error ? error.message : String(error)
            const errorKind = classifyConnectError(error)
            this.logger.warn(`Connection method "${method}" failed: ${message}`)
            if (showContent && error instanceof PopupBlockedError) {
              // Not a failure of the method: the dialog stays open so the user can click again.
              dialog.setState(method, {
                status: 'popup-blocked',
                error: message,
                errorKind: 'popupBlocked'
              })
              return
            }
            // Picker-only mode (consumer renders its own UI): the dialog closed when the user
            // picked Direct, so there is nothing left to retry from — the user's chosen method
            // failed, report it now instead of waiting for the other pairings to expire.
            if (!showContent && method === 'direct' && picked.has(method)) {
              settled = true
              controller.abort()
              dialog.close()
              reject(error)
              return
            }
            failed.add(method)
            if (showContent) {
              dialog.setState(method, {
                status: 'error',
                error: message,
                ...(errorKind ? { errorKind } : {})
              })
            }
            if (failed.size === methods.length) {
              settled = true
              dialog.close()
              reject(error)
            }
          })
      }

      // An implicit Direct default only shows its idle state; the button click starts it.
      if (autoStart || !showContent) attempt(defaultMethod)
    })
  }

  public disconnect = async (): Promise<void> => {
    this.onDisconnect()
    // A Direct popup that is still open (e.g. connecting) must never outlive a disconnect.
    this.direct?.cancelPending()
    const method = this.activeMethod
    if (method === 'liquid' || method === 'direct') {
      await this.getTransport(method).disconnect()
    } else {
      await this.walletConnect?.disconnect()
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

    if (metadata?.method === 'direct') {
      if (!this.direct) {
        this.logger.warn('Persisted session used Biatec Direct, but it is disabled; disconnecting')
        this.onDisconnect()
        return
      }
      if (await this.direct.resume(metadata)) this.activeMethod = 'direct'
      return
    }

    if (!this.walletConnect) {
      this.logger.warn('Persisted session used WalletConnect, but it is disabled; disconnecting')
      this.onDisconnect()
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
    return this.activeTransport().signTransactions(txnGroup, indexesToSign)
  }

  // ---------- Public: data signing (ARC-0060) -------------------------- //

  public signData = async (
    data: string,
    metadata: StdSignMetadata
  ): Promise<StdSignDataResponse> => {
    return this.activeTransport().signData(data, metadata)
  }
}
