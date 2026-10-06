/**
 * Biatec Direct transport: a relay-free, same-browser connection where the dApp opens Biatec
 * Wallet in a popup and exchanges ARC-0027 messages with it over `window.postMessage`.
 *
 * Security model (see docs/DIRECT_PROTOCOL.md, which is normative):
 *  - the wallet origin is pinned (`BIATEC_WALLET_URL`, or an explicit, warned-about
 *    `direct.walletUrl` override that must be https or localhost);
 *  - every inbound message must satisfy `event.origin === WALLET_ORIGIN && event.source ===
 *    popup`, and every outbound message uses `WALLET_ORIGIN` as its explicit targetOrigin
 *    (never `"*"`);
 *  - one request per popup, each with a fresh uuid; everything the wallet returns is validated
 *    field by field, returned accounts must be valid addresses and returned signed
 *    transactions must be the transactions that were sent;
 *  - the popup is opened synchronously (before any `await`) so browsers count it as user-gesture
 *    initiated; a `null` handle becomes {@link PopupBlockedError};
 *  - the popup's `closed` flag is polled so closing it rejects instead of hanging, and every
 *    wait is bounded by a timeout.
 */
import algosdk from 'algosdk'
import {
  SignDataError,
  flattenTxnGroup,
  isSignedTxn,
  isTransactionArray,
  type StdSignDataResponse,
  type StdSignMetadata,
  type WalletAccount,
  type WalletState
} from '@txnlab/use-wallet/adapter'
import {
  BIATEC_WALLET_URL,
  DIRECT_POPUP_HEIGHT,
  DIRECT_POPUP_WIDTH,
  DIRECT_ROUTE,
  DIRECT_WINDOW_NAME
} from '../adapter-constants'
import { DirectNetworkMismatchError, PopupBlockedError, SessionError } from '../errors'
import {
  LiquidErrorCode,
  LiquidProviderError,
  LiquidReference,
  buildRequest,
  toBase64Url,
  type EnableParams,
  type EnableResult,
  type LiquidPeerMetadata,
  type LiquidRequestMessage,
  type LiquidStdSigData,
  type LiquidWalletTransaction,
  type SignDataParams,
  type SignTransactionsParams
} from '../liquid/protocol'
import { getWindowMetadata } from '../window-metadata'
import {
  LIMITS,
  decodeBase64Field,
  invalid,
  isRecord,
  parseEnableResult,
  sanitizeErrorData,
  parseReady,
  parseResponseEnvelope,
  parseSignDataResult,
  parseSignTransactionsResult,
  genesisHashesEqual,
  type DirectReady
} from './direct-validation'
import { ConnectAbortedError, type BiatecAccountMetadata, type TransportContext } from './types'

export interface DirectTransportOptions {
  /**
   * Wallet base URL. **Development only** — defaults to `https://wallet.biatec.io`. Must be
   * `https:`, or `http:` on `localhost` / `127.0.0.1`. Overriding it logs a one-time
   * `console.warn`, because whoever controls this origin controls what you sign.
   */
  walletUrl?: string
  /**
   * `window.open` feature string. Defaults to a centered 480x720 popup. Must not contain
   * `noopener` / `noreferrer` (they sever the channel to the wallet).
   */
  popupFeatures?: string
  /** dApp metadata announced to the wallet in `enable`. Defaults are read from the page. */
  metadata?: Partial<LiquidPeerMetadata>
  /** ARC-0027 provider id carried in every message. Default: a random UUID per adapter instance. */
  providerId?: string
  /** Expose ARC-0060 `signData()`. Default `true`. */
  enableSignData?: boolean
  /**
   * How long to wait for the wallet popup to become ready and for the user to approve a
   * connection (the user may be unlocking the wallet first). Default 5 minutes.
   */
  connectTimeoutMs?: number
  /** How long a signing request waits for the user's answer in the wallet. Default 5 minutes. */
  requestTimeoutMs?: number
}

export interface DirectConnectHandlers {
  /** Closes the popup and rejects promptly if aborted (cancelled dialog, another method won). */
  signal?: AbortSignal
}

const DEFAULT_CONNECT_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000
/** How often `popup.closed` is polled. */
export const POPUP_POLL_INTERVAL_MS = 500

/** The slice of `WindowProxy` this transport uses (and tests fake). */
interface PopupHandle {
  closed: boolean
  postMessage(message: unknown, targetOrigin: string): void
  close(): void
  focus?: () => void
}

interface MessageLike {
  origin: string
  source: unknown
  data: unknown
}

interface HostWindow {
  open(url: string, name: string, features: string): PopupHandle | null
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  location: { origin: string }
  screenX?: number
  screenY?: number
  outerWidth?: number
  outerHeight?: number
}

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: Error): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  // Rejections are always consumed by whoever awaits; never surface as "unhandled".
  promise.catch(() => undefined)
  return { promise, resolve, reject }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function getHostWindow(): HostWindow {
  // `window` is absent in SSR/Node; `unknown` because it is only duck-typed (open) just below.
  const host = (globalThis as { window?: unknown }).window
  if (!host || typeof (host as HostWindow).open !== 'function') {
    throw new SessionError('The Biatec Direct connection method needs a browser window')
  }
  return host as HostWindow
}

/**
 * Validates and normalizes the wallet URL. Returns the pinned origin and the base the popup
 * route is appended to.
 */
/** Mirror of the wallet's `isLoopbackHost` (scholtz/wallet src/scripts/direct/protocol.ts). */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]'
  )
}

/**
 * Mirror of the wallet's `parseDappOrigin`: the wallet only talks to https origins and to http
 * on loopback, in canonical form, with no trailing dot in the hostname. Anything else would make
 * it refuse the popup, so fail early here with a clear message, before `window.open`.
 */
export function checkDappOrigin(origin: unknown): string {
  if (typeof origin !== 'string' || !origin || origin === 'null') {
    throw new SessionError(
      'Biatec Direct needs a page with a real origin (http(s)); this page has an opaque origin'
    )
  }
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    throw new SessionError(`Biatec Direct cannot use this page origin: ${origin}`)
  }
  const canonical =
    url.origin === origin &&
    !url.hostname.endsWith('.') &&
    (url.protocol === 'https:' || (url.protocol === 'http:' && isLoopbackHost(url.hostname)))
  if (!canonical) {
    throw new SessionError(
      `Biatec Wallet only accepts dApps served over https, or over http on localhost / 127.0.0.1 / [::1]; this page's origin is ${origin}`
    )
  }
  return origin
}

export function resolveWalletUrl(walletUrl: string): { origin: string; base: string } {
  let url: URL
  try {
    url = new URL(walletUrl)
  } catch {
    throw new Error(`Invalid direct.walletUrl: ${walletUrl}`)
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('direct.walletUrl must use https:, or http: only on localhost / 127.0.0.1')
  }
  if (url.username || url.password) {
    throw new Error('direct.walletUrl must not contain credentials')
  }
  return { origin: url.origin, base: url.origin + url.pathname.replace(/\/+$/, '') }
}

// ---------- ARC-0060 digest -------------------------------------------------- //

/** `sha256(data) || sha256(authenticatorData)` — what Biatec Wallet signs for ARC-0060. */
async function arc60Digest(dataBase64: string, authenticatorData: Uint8Array): Promise<Uint8Array> {
  const data = algosdk.base64ToBytes(dataBase64)
  const sha256 = async (bytes: Uint8Array) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
  const [dataHash, authHash] = await Promise.all([sha256(data), sha256(authenticatorData)])
  const digest = new Uint8Array(dataHash.length + authHash.length)
  digest.set(dataHash, 0)
  digest.set(authHash, dataHash.length)
  return digest
}

// ---------- One popup, one request ---------------------------------------- //

/**
 * The popup has one fixed window name per page (`biatec-wallet-direct`), so a second
 * `window.open` with it would navigate, i.e. steal, the first request's popup. Guard per host
 * window, at module level, so even two adapters/transports on the same page can never do that.
 */
const inFlight = new WeakMap<object, PopupSession>()

interface Exchange {
  requestId: string
  responseReference: string
  validate: (result: unknown) => unknown
}

/** Per signTransactions call: memoised chain lookups and rekeys made earlier in the group. */
interface VerifyState {
  lookups: Map<string, Promise<string | undefined>>
  groupAuth: Map<string, string | undefined>
}

class PopupSession {
  settled = false
  readonly ready = deferred<DirectReady>()
  private readonly response = deferred<unknown>()
  private exchange: Exchange | null = null
  private isReady = false
  private readyTimer: ReturnType<typeof setTimeout> | undefined
  private responseTimer: ReturnType<typeof setTimeout> | undefined
  private poll: ReturnType<typeof setInterval> | undefined
  private closedSeen = false
  private abortCleanup: (() => void) | undefined

  constructor(
    readonly host: HostWindow,
    readonly popup: PopupHandle,
    private readonly walletOrigin: string,
    private readonly connectTimeoutMs: number,
    private readonly onSettled: (session: PopupSession) => void,
    private readonly debug: (message: string, ...args: unknown[]) => void,
    signal: AbortSignal | undefined
  ) {
    host.addEventListener('message', this.onMessage)
    this.readyTimer = setTimeout(
      () =>
        this.fail(
          new LiquidProviderError(
            'Biatec Wallet did not respond — popup blocked or wallet origin unreachable',
            LiquidErrorCode.timedOut
          )
        ),
      connectTimeoutMs
    )
    // A wallet that was COOP-severed or closed by the user flips `closed`; the wallet closing
    // itself right after answering is covered by the one-tick grace in `pollClosed`.
    this.poll = setInterval(() => this.pollClosed(), POPUP_POLL_INTERVAL_MS)
    if (signal) {
      const onAbort = () => this.fail(new ConnectAbortedError())
      if (signal.aborted) queueMicrotask(onAbort)
      else {
        signal.addEventListener('abort', onAbort, { once: true })
        this.abortCleanup = () => signal.removeEventListener('abort', onAbort)
      }
    }
  }

  private pollClosed(): void {
    if (this.settled) return
    let closed: boolean
    try {
      closed = this.popup.closed
    } catch {
      closed = true
    }
    if (!closed) {
      this.closedSeen = false
      return
    }
    // Give a message that was posted just before the window closed itself one more tick to be
    // delivered before treating the close as a user cancellation.
    if (!this.closedSeen) {
      this.closedSeen = true
      return
    }
    this.fail(
      new LiquidProviderError(
        'Biatec Wallet window was closed before the request completed. If you did not close it, ' +
          'check that your page does not send Cross-Origin-Opener-Policy: same-origin.',
        LiquidErrorCode.cancelled
      )
    )
  }

  /** Whether `event` comes from the wallet popup. Order matters: cheapest, strictest first. */
  private isTrusted(event: MessageLike): boolean {
    return event.origin === this.walletOrigin && event.source === this.popup
  }

  private readonly onMessage = (event: MessageEvent): void => {
    if (this.settled) return
    try {
      // MessageEvent is structurally what MessageLike describes; the cast only narrows the DOM
      // type to the three fields used (lib.dom types `source` as MessageEventSource | null).
      const message = event as unknown as MessageLike
      if (!this.isTrusted(message)) {
        this.debug('Ignoring message from untrusted origin/source', message.origin)
        return
      }
      this.handleTrusted(message.data)
    } catch (error) {
      // Never throw out of a window event listener.
      this.fail(toError(error))
    }
  }

  private handleTrusted(data: unknown): void {
    if (!this.isReady) {
      const capabilities = parseReady(data)
      this.isReady = true
      clearTimeout(this.readyTimer)
      this.readyTimer = undefined
      this.ready.resolve(capabilities)
      return
    }
    // After the handshake only a response to *our* request matters. Anything else (a repeated
    // ready, a stray message, a response to another id) is ignored, never trusted.
    const exchange = this.exchange
    if (!exchange || !isRecord(data) || data.requestId !== exchange.requestId) {
      this.debug('Ignoring message that is not a response to the pending request')
      return
    }
    const parsed = parseResponseEnvelope(data, exchange.responseReference)
    if (parsed.error) {
      throw new LiquidProviderError(
        parsed.error.message || 'Biatec Wallet rejected the request',
        parsed.error.code,
        parsed.error.data
      )
    }
    const validated = exchange.validate(parsed.result)
    this.succeed(validated)
  }

  /**
   * Waits for the wallet's `ready`, sends exactly one request and resolves with the validated
   * result. `onReady` can veto based on the wallet's advertised capabilities.
   */
  async run<P, R>(
    request: LiquidRequestMessage<P>,
    responseReference: string,
    validate: (result: unknown) => R,
    responseTimeoutMs: number,
    onReady?: (capabilities: DirectReady) => void
  ): Promise<R> {
    const capabilities = await this.ready.promise
    if (this.settled)
      throw new LiquidProviderError('Request was cancelled', LiquidErrorCode.cancelled)
    onReady?.(capabilities)
    this.exchange = { requestId: request.id, responseReference, validate }
    this.responseTimer = setTimeout(
      () =>
        this.fail(
          new LiquidProviderError(
            `Wallet did not answer ${request.reference}`,
            LiquidErrorCode.timedOut
          )
        ),
      responseTimeoutMs
    )
    try {
      // Explicit targetOrigin, never "*": the payload only ever reaches the pinned wallet origin.
      this.popup.postMessage(request, this.walletOrigin)
    } catch (error) {
      throw new LiquidProviderError(
        `Failed to post the request to Biatec Wallet: ${toError(error).message}`,
        LiquidErrorCode.failedToPost
      )
    }
    return (await this.response.promise) as R
  }

  private teardown(): void {
    this.settled = true
    clearTimeout(this.readyTimer)
    clearTimeout(this.responseTimer)
    clearInterval(this.poll)
    this.abortCleanup?.()
    this.host.removeEventListener('message', this.onMessage)
    this.onSettled(this)
  }

  private succeed(result: unknown): void {
    if (this.settled) return
    this.teardown()
    this.response.resolve(result)
  }

  /** Closes the popup if it is still open. Idempotent and independent of `settled`. */
  closePopup(): void {
    try {
      if (!this.popup.closed) this.popup.close()
    } catch {
      /* ignore */
    }
  }

  /** Fails the session (if still pending) and always closes the popup, even when already settled. */
  abort(error: Error): void {
    this.fail(error)
    this.closePopup()
  }

  /** Rejects everything pending, stops all timers/listeners and closes the popup. Idempotent. */
  fail(error: Error): void {
    if (this.settled) return
    this.teardown()
    try {
      if (!this.popup.closed) this.popup.close()
    } catch {
      /* ignore */
    }
    this.ready.reject(error)
    this.response.reject(error)
  }
}

// ---------- The transport ------------------------------------------------- //

export class DirectTransport {
  private session: PopupSession | null = null

  private readonly walletOrigin: string
  private readonly walletBase: string
  private readonly popupFeatures: string | undefined
  private readonly dappMetadata: LiquidPeerMetadata
  private readonly providerId: string
  private readonly enableSignData: boolean
  private readonly connectTimeoutMs: number
  private readonly requestTimeoutMs: number

  constructor(
    private readonly ctx: TransportContext,
    options: DirectTransportOptions
  ) {
    const resolved = resolveWalletUrl(options.walletUrl ?? BIATEC_WALLET_URL)
    this.walletOrigin = resolved.origin
    this.walletBase = resolved.base
    if (resolved.origin !== new URL(BIATEC_WALLET_URL).origin) {
      console.warn(
        `[biatec-wallet-use-wallet-client] Biatec Direct is using a non-default wallet origin ` +
          `(${resolved.origin}). Only do this for local wallet development: the origin you ` +
          `configure decides what you sign.`
      )
    }
    if (options.popupFeatures !== undefined) {
      if (/no(opener|referrer)/i.test(options.popupFeatures)) {
        throw new Error(
          'direct.popupFeatures must not contain noopener/noreferrer: they sever the channel to the wallet'
        )
      }
      this.popupFeatures = options.popupFeatures
    }
    const base = getWindowMetadata()
    this.dappMetadata = {
      name: options.metadata?.name ?? base.name ?? '',
      description: options.metadata?.description ?? base.description ?? '',
      url: options.metadata?.url ?? base.url ?? '',
      icons: [...(options.metadata?.icons ?? base.icons ?? [])]
    }
    this.providerId = options.providerId ?? crypto.randomUUID()
    this.enableSignData = options.enableSignData ?? true
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  }

  /** The pinned origin of the wallet this transport talks to. */
  public get origin(): string {
    return this.walletOrigin
  }

  /** Whether a popup request is currently in flight. */
  public get isBusy(): boolean {
    return this.session !== null
  }

  // ---------- Popup handling ---------------------------------------------- //

  private features(host: HostWindow): string {
    if (this.popupFeatures !== undefined) return this.popupFeatures
    const num = (value: number | undefined, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) ? value : fallback
    const left = Math.max(
      0,
      Math.round(
        num(host.screenX, 0) + (num(host.outerWidth, DIRECT_POPUP_WIDTH) - DIRECT_POPUP_WIDTH) / 2
      )
    )
    const top = Math.max(
      0,
      Math.round(
        num(host.screenY, 0) +
          (num(host.outerHeight, DIRECT_POPUP_HEIGHT) - DIRECT_POPUP_HEIGHT) / 2
      )
    )
    return `popup,width=${DIRECT_POPUP_WIDTH},height=${DIRECT_POPUP_HEIGHT},left=${left},top=${top}`
  }

  /**
   * Opens the popup and starts a session. **Synchronous on purpose**: it must be reachable from
   * the user's click handler without crossing an `await`, or browsers block the popup.
   */
  private beginSession(connectTimeoutMs: number, signal?: AbortSignal): PopupSession {
    const host = getHostWindow()
    const busy = inFlight.get(host)
    if (this.session || (busy && !busy.settled)) {
      throw new LiquidProviderError(
        'Another Biatec Wallet request is already in progress on this page',
        LiquidErrorCode.invalidInput
      )
    }
    const dappOrigin = checkDappOrigin(host.location.origin)
    const url = `${this.walletBase}${DIRECT_ROUTE}?origin=${encodeURIComponent(dappOrigin)}`
    // A UNIQUE window name per session: a fixed name would let this load navigate a popup left
    // open by an earlier page load, which the wallet already treats as consumed (single-use).
    const windowName = `${DIRECT_WINDOW_NAME}-${crypto.randomUUID()}`
    const popup = host.open(url, windowName, this.features(host))
    if (!popup) throw new PopupBlockedError()
    const session = new PopupSession(
      host,
      popup,
      this.walletOrigin,
      connectTimeoutMs,
      (settled) => {
        if (this.session === settled) this.session = null
        if (inFlight.get(host) === settled) inFlight.delete(host)
      },
      (message, ...args) => this.ctx.logger.debug(message, ...args),
      signal
    )
    this.session = session
    inFlight.set(host, session)
    return session
  }

  /** Brings the popup of an in-flight request to the front (e.g. the dialog's button). */
  public focusPopup = (): void => {
    try {
      this.session?.popup.focus?.()
    } catch {
      /* ignore */
    }
  }

  /** Cancels the in-flight request, if any, closing its popup. */
  public cancelPending = (): void => {
    this.session?.fail(new ConnectAbortedError())
  }

  private genesisHash(): string {
    const genesisHash = this.ctx.getActiveNetworkConfig().genesisHash
    if (!genesisHash) {
      throw new SessionError('The active network has no genesisHash; Biatec Direct needs one')
    }
    return genesisHash
  }

  /** Early network check against what the wallet advertised in `ready`. */
  private checkNetwork(genesisHash: string): (capabilities: DirectReady) => void {
    return (capabilities) => {
      if (
        capabilities.genesisHashes.length > 0 &&
        !capabilities.genesisHashes.some((hash) => genesisHashesEqual(hash, genesisHash))
      ) {
        throw new LiquidProviderError(
          'Biatec Wallet is not on the requested network',
          LiquidErrorCode.networkNotSupported,
          sanitizeErrorData({ genesisHashes: capabilities.genesisHashes })
        )
      }
    }
  }

  /** Turns wallet error codes into the errors consumers are told to expect. */
  private translate(error: unknown, genesisHash: string): Error {
    if (error instanceof LiquidProviderError) {
      if (error.code === LiquidErrorCode.networkNotSupported) {
        // Only valid, bounded hashes ever reach callers (see sanitizeErrorData).
        const hashes = sanitizeErrorData(error.data)?.genesisHashes ?? []
        return new DirectNetworkMismatchError(
          `Biatec Wallet is on a different network (requested genesis hash ${genesisHash}). Switch network in the wallet or in your dApp.`,
          genesisHash,
          hashes
        )
      }
      if (error.code === LiquidErrorCode.unauthorizedSigner) {
        return new LiquidProviderError(
          `${error.message} — this site is not connected in Biatec Wallet (or the account is not approved for it); reconnect.`,
          error.code,
          error.data
        )
      }
    }
    return toError(error)
  }

  // ---------- Session lifecycle ------------------------------------------- //

  public connect = async (handlers: DirectConnectHandlers = {}): Promise<WalletAccount[]> => {
    this.ctx.logger.info('Connecting via Biatec Direct...')
    if (handlers.signal?.aborted) throw new ConnectAbortedError()
    const genesisHash = this.genesisHash()
    // No `await` may precede this call: it opens the popup from the user's gesture.
    const session = this.beginSession(this.connectTimeoutMs, handlers.signal)
    try {
      const params: EnableParams = {
        providerId: this.providerId,
        genesisHash,
        metadata: this.dappMetadata
      }
      const result: EnableResult = await session.run(
        buildRequest(LiquidReference.enableRequest, params),
        LiquidReference.enableResponse,
        (raw) => parseEnableResult(raw, genesisHash),
        this.connectTimeoutMs,
        this.checkNetwork(genesisHash)
      )
      // Aborted while the response was being processed: never write accounts for a lost attempt.
      if (handlers.signal?.aborted) throw new ConnectAbortedError()
      const accounts = this.storeAccounts(result, genesisHash)
      this.ctx.logger.info('Connected via Biatec Direct', { origin: this.walletOrigin })
      return accounts
    } catch (error) {
      session.abort(toError(error))
      this.ctx.logger.error('Error connecting:', toError(error).message)
      throw this.translate(error, genesisHash)
    }
  }

  public disconnect = async (): Promise<void> => {
    this.ctx.logger.info('Disconnecting...')
    // v1 does not open a popup just to say goodbye: the wallet keeps the site's session until
    // the user removes it there. We only stop everything on our side.
    this.session?.fail(new LiquidProviderError('Session closed', LiquidErrorCode.cancelled))
  }

  /** Returns `false` (after disconnecting) when the persisted session cannot be trusted. */
  public resume = async (
    metadata: Partial<BiatecAccountMetadata> | undefined
  ): Promise<boolean> => {
    const persistedOrigin =
      metadata && metadata.method === 'direct' ? metadata.walletOrigin : undefined
    if (persistedOrigin !== this.walletOrigin) {
      this.ctx.logger.warn(
        'Persisted Biatec Direct session belongs to a different wallet origin; disconnecting',
        persistedOrigin
      )
      this.ctx.onDisconnect()
      return false
    }
    // A session was granted for one network; if the dApp is now on another, it is stale.
    const active = this.ctx.getActiveNetworkConfig().genesisHash
    const persistedGenesis = metadata && metadata.method === 'direct' ? metadata.genesisHash : ''
    if (!genesisHashesEqual(persistedGenesis, active)) {
      this.ctx.logger.warn(
        'Persisted Biatec Direct session was granted for another network; disconnecting'
      )
      this.ctx.onDisconnect()
      return false
    }
    // Nothing to re-pair: a popup is opened per request.
    this.ctx.logger.info('Biatec Direct session restored')
    return true
  }

  // ---------- Transaction signing (ARC-0001 over ARC-0027) ---------------- //

  public signTransactions = async <T extends algosdk.Transaction[] | Uint8Array[]>(
    txnGroup: T | T[],
    indexesToSign?: number[]
  ): Promise<(Uint8Array | null)[]> => {
    const genesisHash = this.genesisHash()
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
      const canSign = !isSigned && this.ctx.getAddresses().includes(txn.sender.toString())
      const entry: LiquidWalletTransaction = { txn: toBase64Url(txn.toByte()) }
      if (!(isIndexMatch && canSign)) entry.signers = []
      return entry
    })

    if (txnsToSign.every((entry) => entry.signers?.length === 0)) {
      return txnsToSign.map(() => null)
    }

    // No `await` may precede this call: it opens the popup from the user's gesture.
    const session = this.beginSession(this.connectTimeoutMs)
    try {
      const params: SignTransactionsParams = {
        providerId: this.providerId,
        genesisHash,
        txns: txnsToSign
      }
      this.ctx.logger.debug('Sending sign_transactions request...', txnsToSign)
      const stxns = await session.run(
        buildRequest(LiquidReference.signTransactionsRequest, params),
        LiquidReference.signTransactionsResponse,
        (raw) => parseSignTransactionsResult(raw, txnsToSign.length),
        this.requestTimeoutMs,
        this.checkNetwork(genesisHash)
      )

      // Everything below is re-validation of untrusted wallet output; it runs after the
      // session settled, so any throw here simply rejects the call.
      const results: (Uint8Array | null)[] = []
      const state: VerifyState = { lookups: new Map(), groupAuth: new Map() }
      for (let index = 0; index < txnsToSign.length; index++) {
        const entry = txnsToSign[index]
        const value = stxns[index]
        if (entry.signers && entry.signers.length === 0) {
          results.push(null)
          this.applyRekey(state, decoded[index].txn)
          continue
        }
        if (value === null) {
          // A hole where we asked for a signature would surface later as a confusing algod
          // group error; it is a rejection of this request.
          throw new LiquidProviderError(
            `Biatec Wallet did not sign the transaction at position ${index}`,
            LiquidErrorCode.cancelled
          )
        }
        results.push(
          await this.verifySigned(
            state,
            decodeBase64Field(value, `stxns[${index}]`, LIMITS.MAX_STXN_CHARS),
            decoded[index].txn,
            index
          )
        )
        this.applyRekey(state, decoded[index].txn)
      }
      return results
    } catch (error) {
      // Also closes the popup when the wallet answer fails local validation (already settled).
      session.abort(toError(error))
      this.ctx.logger.error('Error signing transactions:', toError(error).message)
      throw this.translate(error, genesisHash)
    }
  }

  /** Whether `signature` is a valid ed25519 signature of `message` by the key of `address`. */
  private verifyEd25519(message: Uint8Array, signature: Uint8Array, address: string): boolean {
    if (signature.length !== 64) return false
    // algosdk has no public raw-ed25519 verify (`verifyBytes` prepends the "MX" tag, which is
    // wrong for transactions). `verifyMultisig` verifies sub-signatures over the raw message, so
    // a 1-of-1 multisig wrapper around the same key is an exact raw verification.
    const publicKey = algosdk.Address.fromString(address).publicKey
    const derived = algosdk.multisigAddress({ version: 1, threshold: 1, addrs: [address] })
    const wrapper = { v: 1, thr: 1, subsig: [{ pk: publicKey, s: signature }] }
    return algosdk.verifyMultisig(
      message,
      // algosdk's EncodedMultisig type is internal (not exported); the wrapper has exactly its
      // shape, so a precise type cannot be named here.
      wrapper as unknown as Parameters<typeof algosdk.verifyMultisig>[1],
      derived.publicKey
    )
  }

  /** Chain auth address of `sender`, looked up at most once per sender per signing call. */
  private chainAuthAddr(state: VerifyState, sender: string): Promise<string | undefined> {
    const known = state.lookups.get(sender)
    if (known) return known
    const lookup = (async () => {
      if (!this.ctx.getAuthAddr) return undefined
      try {
        return await this.ctx.getAuthAddr(sender)
      } catch (error) {
        throw new LiquidProviderError(
          `Could not confirm the signer of a rekeyed account (network error: ${toError(error).message}); the wallet's answer was not accepted`,
          LiquidErrorCode.failedToPost
        )
      }
    })()
    state.lookups.set(sender, lookup)
    return lookup
  }

  /**
   * Checks that bytes returned by the wallet are really the transaction we asked it to sign:
   * a 64-byte raw signature (attached locally) or a signed transaction whose unsigned part has
   * the same txID. ed25519 signatures are verified cryptographically against the sender or, for
   * a rekeyed sender, its auth address: first any rekey made by an EARLIER transaction of the
   * same group (applied in order), else the chain (one memoised lookup per sender, only when
   * the signature does not verify for the sender and the wallet did not claim the sender itself
   * signed). The wallet's own `sgnr` claim is never trusted by itself. msig/lsig/pqsig get
   * structural checks only.
   */
  private async verifySigned(
    state: VerifyState,
    bytes: Uint8Array,
    original: algosdk.Transaction,
    index: number
  ): Promise<Uint8Array> {
    const sender = original.sender.toString()
    const message = original.bytesToSign()
    const invalidSignature = () =>
      new LiquidProviderError(
        `Biatec Wallet returned an invalid signature at position ${index}`,
        LiquidErrorCode.invalidInput
      )

    /** The address `signature` verifies for: the sender, else its effective auth address. */
    const signerFor = async (signature: Uint8Array, claimed?: string): Promise<string> => {
      if (signature.length !== 64) {
        throw invalid(`stxns[${index}] has a signature of the wrong length`)
      }
      const claimsSender = !claimed || claimed === sender
      if (claimsSender && this.verifyEd25519(message, signature, sender)) return sender
      // The wallet says the sender itself signed and that did not verify: nothing to look up.
      if (claimed === sender) throw invalidSignature()
      const authAddr = state.groupAuth.has(sender)
        ? state.groupAuth.get(sender)
        : await this.chainAuthAddr(state, sender)
      if (authAddr && (!claimed || claimed === authAddr)) {
        if (this.verifyEd25519(message, signature, authAddr)) return authAddr
      }
      throw invalidSignature()
    }

    if (bytes.length === 64) {
      // Android reference wallets return the raw ed25519 signature instead of the signed txn.
      const signer = await signerFor(bytes)
      return original.attachSignature(signer, bytes)
    }
    let signed: algosdk.SignedTransaction
    try {
      signed = algosdk.decodeSignedTransaction(bytes)
    } catch {
      throw invalid(`stxns[${index}] is not a decodable signed transaction`)
    }
    if (signed.txn.txID() !== original.txID()) {
      throw new LiquidProviderError(
        `Biatec Wallet returned a signed transaction at position ${index} that does not match the transaction that was sent`,
        LiquidErrorCode.invalidInput
      )
    }
    if (signed.sig) {
      await signerFor(signed.sig, signed.sgnr?.toString())
    } else if (!signed.msig && !signed.lsig && !signed.pqsig) {
      throw invalid(`stxns[${index}] carries no signature`)
    }
    return bytes
  }

  /** A transaction's `rekeyTo` changes who must sign that sender's LATER transactions. */
  private applyRekey(state: VerifyState, txn: algosdk.Transaction): void {
    if (!txn.rekeyTo) return
    const sender = txn.sender.toString()
    const target = txn.rekeyTo.toString()
    // Rekeying to itself restores the sender's own key as the (implicit) signer.
    state.groupAuth.set(sender, target === sender ? undefined : target)
  }

  // ---------- Data signing (ARC-0060) ------------------------------------- //

  public signData = async (
    data: string,
    metadata: StdSignMetadata
  ): Promise<StdSignDataResponse> => {
    let session: PopupSession | undefined
    try {
      if (!this.enableSignData) {
        throw new SignDataError('Method not supported: signData (disabled by options)', 4200)
      }
      const genesisHash = this.genesisHash()
      // Open the popup first: `createStdSignData` is async and would burn the user gesture.
      session = this.beginSession(this.connectTimeoutMs)
      const stdSignData = await this.ctx.createStdSignData(data)
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

      const params: SignDataParams = { providerId: this.providerId, genesisHash, items: [item] }
      const signatures = await session.run(
        buildRequest(LiquidReference.signDataRequest, params),
        LiquidReference.signDataResponse,
        (raw) => parseSignDataResult(raw, 1),
        this.requestTimeoutMs,
        this.checkNetwork(genesisHash)
      )
      const signature = signatures[0]
      if (signature === null) throw new SignDataError('Wallet returned no signature', 4001)
      const signatureBytes = decodeBase64Field(
        signature,
        'signatures[0]',
        LIMITS.MAX_SIGNATURE_CHARS
      )
      // ARC-0060 (Biatec Wallet): ed25519 over sha256(data) || sha256(authenticatorData), by the
      // item's signer key. Deterministic, so it is verified locally before being returned.
      if (signatureBytes.length !== 64) throw invalid('signatures[0] must be exactly 64 bytes')
      const digest = await arc60Digest(stdSignData.data, stdSignData.authenticatorData)
      const signerAddress = algosdk.encodeAddress(stdSignData.signer)
      if (!this.verifyEd25519(digest, signatureBytes, signerAddress)) {
        throw new LiquidProviderError(
          'Biatec Wallet returned an invalid data signature',
          LiquidErrorCode.invalidInput
        )
      }
      return { ...stdSignData, signature: signatureBytes }
    } catch (error) {
      session?.abort(toError(error))
      // A blocked popup is not a signing failure: surface it unchanged (like signTransactions)
      // so callers can ask the user to allow popups and click again.
      if (error instanceof PopupBlockedError) throw error
      if (error instanceof SignDataError) {
        this.ctx.logger.error('Error signing data:', error.message)
        throw error
      }
      const code =
        error instanceof LiquidProviderError && [4001, 4100, 4200, 4300].includes(error.code)
          ? error.code
          : error instanceof LiquidProviderError &&
              (error.code === LiquidErrorCode.methodNotSupported ||
                error.code === LiquidErrorCode.networkNotSupported)
            ? 4200
            : 4300
      this.ctx.logger.error('Error signing data:', toError(error).message)
      throw new SignDataError(toError(error).message || 'Unknown error signing data', code, error)
    }
  }

  // ---------- Internals --------------------------------------------------- //

  private storeAccounts(result: EnableResult, genesisHash: string): WalletAccount[] {
    const accounts: WalletAccount[] = result.accounts.map((account, i) => ({
      name: account.name ?? `${this.ctx.getMetadataName()} Account ${i + 1}`,
      address: account.address,
      metadata: {
        method: 'direct',
        walletOrigin: this.walletOrigin,
        genesisHash
      } satisfies BiatecAccountMetadata
    }))
    const walletState = this.ctx.store.getWalletState()
    if (!walletState) {
      const newState: WalletState = { accounts, activeAccount: accounts[0] }
      this.ctx.store.addWallet(newState)
    } else {
      this.ctx.store.setAccounts(accounts)
    }
    return accounts
  }
}
