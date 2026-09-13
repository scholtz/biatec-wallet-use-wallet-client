/**
 * Biatec Wallet adapter for @txnlab/use-wallet v5 — **Liquid Auth transport**.
 *
 * Pairs with Biatec Wallet through a Liquid Auth signaling service (passkey-authenticated
 * linking, then a direct WebRTC data channel negotiated with public Google STUN servers) and
 * speaks the ARC-0027 message envelope over that channel: ARC-0001 transaction signing plus
 * the ARC-0060 data-signing extension. See docs/LIQUID_AUTH_PROTOCOL.md.
 */
import algosdk from 'algosdk'
import {
  BaseWallet,
  SignDataError,
  flattenTxnGroup,
  isSignedTxn,
  isTransactionArray,
  type AdapterConstructorParams,
  type StdSignDataResponse,
  type StdSignMetadata,
  type WalletAccount,
  type WalletMetadata,
  type WalletState
} from '@txnlab/use-wallet/adapter'
import { ICON } from '../icon'
import { getWindowMetadata } from '../window-metadata'
import { openLiquidPairingDialog } from './dialog'
import {
  DEFAULT_ICE_SERVERS,
  DEFAULT_LIQUID_ORIGIN,
  LiquidErrorCode,
  LiquidProviderError,
  LiquidReference,
  buildRequest,
  decodeLiquidMessage,
  encodeLiquidMessage,
  fromBase64Url,
  generateLiquidDeepLink,
  isLiquidResponse,
  toBase64Url,
  type HelloParams,
  type HelloResult,
  type LiquidPeerMetadata,
  type LiquidResponseMessage,
  type LiquidStdSigData,
  type LiquidWalletTransaction,
  type SignDataParams,
  type SignDataResult,
  type SignTransactionsParams,
  type SignTransactionsResult
} from './protocol'
import { LiquidSignalClient, withTimeout, type LiquidPeerSession } from './signaling'

export const WALLET_ID_LIQUID = 'biatec-liquid' as const

/** Account metadata persisted by use-wallet so a session can be resumed after a reload. */
export interface LiquidAccountMetadata {
  requestId: string
  origin: string
}

export interface BiatecLiquidOptions {
  /** Liquid Auth service the wallet authenticates against. Default: Biatec's hosted service. */
  origin?: string
  /** ICE servers for the WebRTC connection. Default: public Google STUN servers. */
  iceServers?: RTCIceServer[]
  /**
   * Receive the `liquid://` pairing link to render your own QR code. When omitted a minimal
   * built-in dialog shows the link with a copy button (no QR).
   */
  onDisplayUri?: (uri: string, info: { requestId: string; origin: string }) => void | Promise<void>
  /** dApp metadata announced to the wallet in the hello handshake. Defaults are read from the page. */
  metadata?: Partial<LiquidPeerMetadata>
  /** ARC-0027 provider id carried in every message. Default: a random UUID per adapter instance. */
  providerId?: string
  /** Expose ARC-0060 `signData()`. Default `true`. */
  enableSignData?: boolean
  /** How long `connect()` waits for the wallet to pair. Default 5 minutes. */
  connectTimeoutMs?: number
  /** How long a lazy reconnect (after a page reload) waits for the wallet. Default 30 seconds. */
  reconnectTimeoutMs?: number
  /** How long a signing request waits for the user's answer in the wallet. Default 5 minutes. */
  requestTimeoutMs?: number
}

interface PendingRequest {
  resolve: (response: LiquidResponseMessage) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const DEFAULT_CONNECT_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_RECONNECT_TIMEOUT_MS = 30 * 1000
const DEFAULT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const HELLO_TIMEOUT_MS = 10 * 1000

export class BiatecLiquidAdapter extends BaseWallet<BiatecLiquidOptions> {
  private signal: LiquidSignalClient | null = null
  private session: LiquidPeerSession | null = null
  private requestId: string | null = null
  private peerInfo: HelloResult | null = null
  private readonly pending = new Map<string, PendingRequest>()

  private readonly origin: string
  private readonly iceServers: RTCIceServer[]
  private readonly onDisplayUri: BiatecLiquidOptions['onDisplayUri']
  private readonly dappMetadata: LiquidPeerMetadata
  private readonly providerId: string
  private readonly enableSignData: boolean
  private readonly connectTimeoutMs: number
  private readonly reconnectTimeoutMs: number
  private readonly requestTimeoutMs: number

  constructor(params: AdapterConstructorParams<BiatecLiquidOptions>) {
    super(params)
    const options = this.options ?? {}
    this.origin = (options.origin ?? DEFAULT_LIQUID_ORIGIN).replace(/\/+$/, '')
    this.iceServers = options.iceServers ?? DEFAULT_ICE_SERVERS
    this.onDisplayUri = options.onDisplayUri
    this.dappMetadata = { ...getWindowMetadata(), ...options.metadata }
    this.providerId = options.providerId ?? crypto.randomUUID()
    this.enableSignData = options.enableSignData ?? true
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
    this.reconnectTimeoutMs = options.reconnectTimeoutMs ?? DEFAULT_RECONNECT_TIMEOUT_MS
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.canSignData = this.enableSignData
  }

  static defaultMetadata: WalletMetadata = {
    name: 'Biatec Wallet (Liquid Auth)',
    icon: ICON
  }

  /** Metadata the wallet announced in the hello handshake, if any. */
  public get walletInfo(): HelloResult | null {
    return this.peerInfo
  }

  public get isChannelOpen(): boolean {
    return this.session?.channel.readyState === 'open'
  }

  // ---------- Session lifecycle ------------------------------------- //

  public connect = async (): Promise<WalletAccount[]> => {
    this.logger.info('Connecting via Liquid Auth...')
    this.teardownSession()
    const requestId = crypto.randomUUID()
    const uri = generateLiquidDeepLink(this.origin, requestId)
    const signal = new LiquidSignalClient({
      origin: this.origin,
      iceServers: this.iceServers,
      log: (message, ...args) => this.logger.debug(message, ...args)
    })
    this.signal = signal

    let cancel: (() => void) | undefined
    const cancelled = new Promise<never>((_, reject) => {
      cancel = () => reject(new LiquidProviderError('Pairing cancelled', LiquidErrorCode.cancelled))
    })
    const pairing = signal.pair(requestId, this.connectTimeoutMs)
    pairing.catch(() => undefined) // surfaced through the race below

    let dialog: { close(): void } | undefined
    try {
      if (this.onDisplayUri) {
        await this.onDisplayUri(uri, { requestId, origin: this.origin })
      } else {
        dialog = openLiquidPairingDialog(uri, () => cancel?.())
      }
      const session = await Promise.race([pairing, cancelled])
      this.attachSession(session, requestId)
      const accounts = this.storeAccounts(session.wallet, requestId)
      await this.hello()
      this.logger.info('Connected via Liquid Auth', { wallet: session.wallet, requestId })
      return accounts
    } catch (error: any) {
      this.logger.error('Error connecting:', error?.message ?? error)
      this.teardownSession()
      throw error
    } finally {
      dialog?.close()
    }
  }

  public disconnect = async (): Promise<void> => {
    this.logger.info('Disconnecting...')
    this.onDisconnect()
    this.teardownSession()
    this.requestId = null
    this.peerInfo = null
  }

  public resumeSession = async (): Promise<void> => {
    const walletState = this.store.getWalletState()
    if (!walletState) {
      this.logger.info('No session to resume')
      return
    }
    const metadata = this.readAccountMetadata(walletState)
    if (!metadata) {
      this.logger.warn('Persisted Liquid Auth session has no requestId, disconnecting')
      this.onDisconnect()
      return
    }
    // WebRTC cannot survive a reload; remember the pairing and reconnect lazily on first use.
    this.requestId = metadata.requestId
    this.logger.info('Liquid Auth session restored (lazy reconnect)', metadata)
  }

  // ---------- Transaction signing (ARC-0001 over ARC-0027) --------- //

  public signTransactions = async <T extends algosdk.Transaction[] | Uint8Array[]>(
    txnGroup: T | T[],
    indexesToSign?: number[]
  ): Promise<(Uint8Array | null)[]> => {
    try {
      const decoded = isTransactionArray(txnGroup)
        ? flattenTxnGroup(txnGroup).map((txn) => ({ txn, isSigned: false }))
        : flattenTxnGroup(txnGroup as Uint8Array[]).map((bytes) => {
            const isSigned = isSignedTxn(algosdk.msgpackRawDecode(bytes))
            const txn = isSigned
              ? algosdk.decodeSignedTransaction(bytes).txn
              : algosdk.decodeUnsignedTransaction(bytes)
            return { txn, isSigned }
          })

      const txnsToSign: LiquidWalletTransaction[] = decoded.map(({ txn, isSigned }, index) => {
        const isIndexMatch = !indexesToSign || indexesToSign.includes(index)
        const canSign = !isSigned && this.addresses.includes(txn.sender.toString())
        const entry: LiquidWalletTransaction = { txn: toBase64Url(txn.toByte()) }
        if (!(isIndexMatch && canSign)) entry.signers = []
        return entry
      })

      this.logger.debug('Sending sign_transactions request...', txnsToSign)
      const result = await this.request<SignTransactionsParams, SignTransactionsResult>(
        LiquidReference.signTransactionsRequest,
        { providerId: this.providerId, txns: txnsToSign }
      )
      if (!result || !Array.isArray(result.stxns)) {
        throw new LiquidProviderError(
          'Wallet returned a malformed sign_transactions result',
          LiquidErrorCode.invalidInput
        )
      }

      return txnsToSign.map((entry, index) => {
        if (entry.signers && entry.signers.length === 0) return null
        const value = result.stxns[index]
        if (typeof value !== 'string' || value.length === 0) return null
        const bytes = fromBase64Url(value)
        // Android reference wallets return the raw 64-byte signature instead of the signed txn.
        if (bytes.length === 64) {
          return decoded[index].txn.attachSignature(decoded[index].txn.sender, bytes)
        }
        return bytes
      })
    } catch (error: any) {
      this.logger.error('Error signing transactions:', error?.message ?? error)
      throw error
    }
  }

  // ---------- Data signing (ARC-0060) ------------------------------- //

  public signData = async (
    data: string,
    metadata: StdSignMetadata
  ): Promise<StdSignDataResponse> => {
    try {
      if (!this.enableSignData) {
        throw new SignDataError('Method not supported: signData (disabled by options)', 4200)
      }
      const stdSignData = await this.createStdSignData(data)
      const item: LiquidStdSigData = {
        data: stdSignData.data,
        signer: toBase64Url(stdSignData.signer),
        domain: stdSignData.domain,
        authenticatorData: toBase64Url(stdSignData.authenticatorData),
        scope: metadata.scope,
        encoding: metadata.encoding
      }
      if (stdSignData.requestId) item.requestId = stdSignData.requestId
      if (stdSignData.hdPath) item.hdPath = stdSignData.hdPath

      const result = await this.request<SignDataParams, SignDataResult>(
        LiquidReference.signDataRequest,
        { providerId: this.providerId, items: [item] }
      )
      const signature = result?.signatures?.[0]
      if (typeof signature !== 'string' || signature.length === 0) {
        throw new SignDataError('Wallet returned no signature', 4001)
      }
      return { ...stdSignData, signature: fromBase64Url(signature) }
    } catch (error: any) {
      if (error instanceof SignDataError) {
        this.logger.error('Error signing data:', error.message)
        throw error
      }
      const code =
        error instanceof LiquidProviderError && [4001, 4100, 4200, 4300].includes(error.code)
          ? error.code
          : error instanceof LiquidProviderError &&
              error.code === LiquidErrorCode.methodNotSupported
            ? 4200
            : 4300
      this.logger.error('Error signing data:', error?.message ?? error)
      throw new SignDataError(error?.message ?? 'Unknown error signing data', code, error)
    }
  }

  // ---------- Internals --------------------------------------------- //

  private attachSession(session: LiquidPeerSession, requestId: string): void {
    this.session = session
    this.requestId = requestId
    session.channel.onmessage = (event: MessageEvent) => {
      void this.handleMessage(String(event.data))
    }
    const onGone = () => {
      if (this.session === session) {
        this.logger.warn('Liquid Auth data channel closed')
        this.session = null
        this.rejectAllPending(
          new LiquidProviderError('Data channel closed', LiquidErrorCode.unknown)
        )
      }
    }
    session.channel.onclose = onGone
    session.peerConnection.onconnectionstatechange = () => {
      const state = session.peerConnection.connectionState
      if (state === 'failed' || state === 'closed' || state === 'disconnected') onGone()
    }
  }

  private storeAccounts(address: string, requestId: string): WalletAccount[] {
    const accounts: WalletAccount[] = [
      {
        name: `${this.metadata.name} Account 1`,
        address,
        metadata: { requestId, origin: this.origin } satisfies LiquidAccountMetadata
      }
    ]
    const walletState = this.store.getWalletState()
    if (!walletState) {
      const newState: WalletState = { accounts, activeAccount: accounts[0] }
      this.store.addWallet(newState)
    } else {
      this.store.setAccounts(accounts)
    }
    return accounts
  }

  private readAccountMetadata(walletState: WalletState): LiquidAccountMetadata | null {
    const metadata = (walletState.activeAccount ?? walletState.accounts[0])?.metadata as
      | Partial<LiquidAccountMetadata>
      | undefined
    if (metadata && typeof metadata.requestId === 'string' && metadata.requestId) {
      return { requestId: metadata.requestId, origin: metadata.origin ?? this.origin }
    }
    return null
  }

  private async hello(): Promise<void> {
    try {
      const result = await this.request<HelloParams, HelloResult>(
        LiquidReference.helloRequest,
        { providerId: this.providerId, metadata: this.dappMetadata },
        HELLO_TIMEOUT_MS
      )
      this.peerInfo = result
      this.logger.debug('Wallet hello', result)
    } catch (error: any) {
      // Peers that only implement the ARC-0027 subset (no hello) are still fine.
      this.logger.warn('Hello handshake not answered:', error?.message ?? error)
    }
  }

  private async ensureSession(): Promise<LiquidPeerSession> {
    if (this.session && this.session.channel.readyState === 'open') return this.session
    if (!this.requestId) {
      throw new LiquidProviderError('No Liquid Auth session; call connect() first', 4100)
    }
    this.logger.info('Reconnecting Liquid Auth session...', this.requestId)
    this.teardownSession()
    const signal = new LiquidSignalClient({
      origin: this.origin,
      iceServers: this.iceServers,
      log: (message, ...args) => this.logger.debug(message, ...args)
    })
    this.signal = signal
    try {
      const session = await signal.pair(this.requestId, this.reconnectTimeoutMs)
      this.attachSession(session, this.requestId)
      if (!this.addresses.includes(session.wallet)) {
        this.storeAccounts(session.wallet, this.requestId)
      }
      await this.hello()
      return session
    } catch (error: any) {
      this.teardownSession()
      throw new LiquidProviderError(
        `Biatec Wallet is not reachable (${error?.message ?? error}). Open Biatec Wallet to resume the Liquid Auth session, or reconnect.`,
        LiquidErrorCode.timedOut,
        error
      )
    }
  }

  private async request<P, R>(
    reference: string,
    params: P,
    timeoutMs = this.requestTimeoutMs
  ): Promise<R> {
    const session = await this.ensureSession()
    const message = buildRequest(reference, params)
    const wire = await encodeLiquidMessage(message)
    const response = await withTimeout(
      new Promise<LiquidResponseMessage>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(message.id)
          reject(
            new LiquidProviderError(`Wallet did not answer ${reference}`, LiquidErrorCode.timedOut)
          )
        }, timeoutMs)
        this.pending.set(message.id, { resolve, reject, timer })
        try {
          session.channel.send(wire)
        } catch (error) {
          clearTimeout(timer)
          this.pending.delete(message.id)
          reject(error as Error)
        }
      }),
      timeoutMs + 1000,
      reference
    )
    if (response.error) {
      throw new LiquidProviderError(
        response.error.message || `Wallet rejected ${reference}`,
        response.error.code ?? LiquidErrorCode.unknown,
        response.error.data
      )
    }
    return response.result as R
  }

  private async handleMessage(payload: string): Promise<void> {
    try {
      const message = await decodeLiquidMessage(payload)
      if (!isLiquidResponse(message)) {
        this.logger.debug('Ignoring unsolicited request from wallet', message.reference)
        return
      }
      const pending = this.pending.get(message.requestId)
      if (!pending) {
        this.logger.debug('Ignoring response for unknown request', message.requestId)
        return
      }
      clearTimeout(pending.timer)
      this.pending.delete(message.requestId)
      pending.resolve(message)
    } catch (error: any) {
      this.logger.warn('Dropping undecodable message from wallet:', error?.message ?? error)
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  private teardownSession(): void {
    const session = this.session
    this.session = null
    if (session) {
      session.channel.onclose = null
      session.peerConnection.onconnectionstatechange = null
      try {
        session.channel.close()
      } catch {
        /* ignore */
      }
      try {
        session.peerConnection.close()
      } catch {
        /* ignore */
      }
    }
    this.signal?.close()
    this.signal = null
    this.rejectAllPending(new LiquidProviderError('Session closed', LiquidErrorCode.unknown))
  }
}
