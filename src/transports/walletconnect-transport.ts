/**
 * WalletConnect v2 transport for the unified Biatec Wallet adapter. Biatec Wallet
 * (https://wallet.biatec.io) approves sessions for every AVM chain it knows (Algorand
 * mainnet/testnet/betanet/fnet, Voi mainnet, Aramid mainnet) and exposes the JSON-RPC methods
 * `algo_signTxn` (ARC-0001) and `algo_signData` (ARC-0060).
 *
 * The transaction-signing path is adapted from @txnlab/use-wallet-walletconnect
 * (MIT, Copyright (c) TxnLab, Inc.).
 */
import algosdk from 'algosdk'
import {
  SignDataError,
  base64ToByteArray,
  byteArrayToBase64,
  compareAccounts,
  flattenTxnGroup,
  formatJsonRpcRequest,
  isSignedTxn,
  isTransactionArray,
  type StdSignDataResponse,
  type StdSignMetadata,
  type WalletAccount,
  type WalletState,
  type WalletTransaction
} from '@txnlab/use-wallet/adapter'
import type { WalletConnectModal, WalletConnectModalConfig } from '@walletconnect/modal'
import type SignClient from '@walletconnect/sign-client'
import type { SessionTypes, SignClientTypes } from '@walletconnect/types'
import { getWindowMetadata } from '../window-metadata'
import { SessionError } from '../errors'
import { raceAbort, type BiatecAccountMetadata, type TransportContext } from './types'

export const SIGN_TXN_METHOD = 'algo_signTxn' as const
export const SIGN_DATA_METHOD = 'algo_signData' as const
export const DEFAULT_RELAY_URL = 'wss://relay.walletconnect.com'

/** Session events Biatec Wallet declares when approving a session. */
const SESSION_EVENTS = ['chainChanged', 'accountsChanged']

export type ModalOptions = Pick<
  WalletConnectModalConfig,
  | 'enableExplorer'
  | 'explorerRecommendedWalletIds'
  | 'privacyPolicyUrl'
  | 'termsOfServiceUrl'
  | 'themeMode'
  | 'themeVariables'
>

export interface WalletConnectTransportOptions extends ModalOptions {
  /** WalletConnect Cloud project id (https://cloud.reown.com). Required. */
  projectId: string
  /** Relay URL. Defaults to the public WalletConnect relay. */
  relayUrl?: string
  /**
   * dApp metadata shown to the user inside Biatec Wallet.
   * Merged over metadata auto-detected from the current document.
   */
  metadata?: SignClientTypes.Metadata
  /**
   * Request the ARC-0060 `algo_signData` method as an optional namespace method
   * and enable `signData()` on the adapter. Defaults to `true`.
   */
  enableSignData?: boolean
  /**
   * Extra CAIP-2 chain ids to request as *optional* chains, in addition to every
   * `caipChainId` found in the WalletManager network configuration.
   * The active network's chain is always requested as *required*.
   */
  chains?: string[]
  /**
   * Use `@walletconnect/modal`'s wallet-explorer modal as the pairing UI instead of the
   * built-in Biatec dialog. Only applies when no `onDisplayUri` is given. Default `false`.
   */
  useWalletConnectModal?: boolean
}

export type SignTxnsResponse = Array<Uint8Array | number[] | string | null | undefined>

/** One ARC-0060 `StdSigData` item as sent over WalletConnect (all bytes base64). */
export interface WireStdSigData {
  data: string
  signer: string
  domain: string
  authenticatorData: string
  scope: number
  encoding: string
  requestId?: string
  hdPath?: string
}

export type SignDataResponse = Array<{ signature: string } | null | undefined>

export interface WalletConnectConnectHandlers {
  /** Reports the pairing URI (unless `useWalletConnectModal` is set, which shows its own UI). */
  onDisplayUri: (uri: string) => void | Promise<void>
  /** Rejects the pending connect() promptly if aborted (e.g. the user cancelled the dialog). */
  signal?: AbortSignal
}

export class WalletConnectTransport {
  private client: SignClient | null = null
  private modal: WalletConnectModal | null = null
  private session: SessionTypes.Struct | null = null

  private readonly clientOptions: {
    projectId: string
    relayUrl: string
    metadata: SignClientTypes.Metadata
  }
  private readonly modalOptions: ModalOptions
  private readonly useWalletConnectModal: boolean
  private readonly enableSignData: boolean
  private readonly extraChains: string[]

  constructor(
    private readonly ctx: TransportContext,
    options: WalletConnectTransportOptions
  ) {
    const {
      projectId,
      relayUrl = DEFAULT_RELAY_URL,
      metadata,
      enableSignData = true,
      chains = [],
      useWalletConnectModal = false,
      ...modalOptions
    } = options

    this.clientOptions = {
      projectId,
      relayUrl,
      metadata: { ...getWindowMetadata(), ...metadata }
    }
    this.modalOptions = modalOptions
    this.useWalletConnectModal = useWalletConnectModal
    this.enableSignData = enableSignData
    this.extraChains = chains
  }

  // ---------- Chains ------------------------------------------------ //

  /** CAIP-2 chain id of the currently active network. */
  public get activeChainId(): string {
    const network = this.ctx.getActiveNetworkConfig()
    if (!network?.caipChainId) {
      this.ctx.logger.warn(`No CAIP-2 chain ID found for network: ${this.ctx.getActiveNetwork()}`)
      return ''
    }
    return network.caipChainId
  }

  /**
   * Every CAIP-2 chain id known to the WalletManager plus `options.chains`,
   * de-duplicated, active chain first.
   */
  public get supportedChainIds(): string[] {
    const configured = Object.values(this.ctx.store.getState().networkConfig)
      .map((config) => config.caipChainId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
    const active = this.activeChainId
    return [...new Set([active, ...configured, ...this.extraChains].filter(Boolean))]
  }

  /** Whether the live session advertises `algo_signData`. */
  public get sessionSupportsSignData(): boolean {
    return this.session?.namespaces.algorand?.methods.includes(SIGN_DATA_METHOD) ?? false
  }

  // ---------- WalletConnect plumbing -------------------------------- //

  private async initializeClient(): Promise<SignClient> {
    this.ctx.logger.info('Initializing WalletConnect client...')
    const { SignClient } = await import('@walletconnect/sign-client')
    const client = await SignClient.init(this.clientOptions)

    client.on('session_event', (args) => {
      this.ctx.logger.info('EVENT: session_event', args)
    })

    client.on('session_update', ({ topic, params }) => {
      this.ctx.logger.info('EVENT: session_update', { topic, params })
      const session = client.session.get(topic)
      this.onSessionConnected({ ...session, namespaces: params.namespaces })
    })

    client.on('session_delete', () => {
      this.ctx.logger.info('EVENT: session_delete')
      this.session = null
      this.ctx.onDisconnect()
    })

    this.client = client
    this.ctx.logger.info('WalletConnect client initialized')
    return client
  }

  private async initializeModal(): Promise<WalletConnectModal> {
    this.ctx.logger.info('Initializing WalletConnect modal...')
    const { WalletConnectModal } = await import('@walletconnect/modal')
    const modal = new WalletConnectModal({
      projectId: this.clientOptions.projectId,
      ...this.modalOptions
    })
    modal.subscribeModal((state) => this.ctx.logger.info(`Modal ${state.open ? 'open' : 'closed'}`))
    this.modal = modal
    return modal
  }

  private getClient(): Promise<SignClient> {
    return this.client ? Promise.resolve(this.client) : this.initializeClient()
  }

  private onSessionConnected(session: SessionTypes.Struct): WalletAccount[] {
    const caipAccounts = session.namespaces.algorand?.accounts ?? []

    if (!caipAccounts.length) {
      this.ctx.logger.error('No accounts found!')
      throw new Error('No accounts found!')
    }

    // Same address can appear once per approved chain — collapse to unique addresses.
    const addresses = [...new Set(caipAccounts.map((account) => account.split(':').pop()!))]
    const metadata: BiatecAccountMetadata = { method: 'walletconnect' }

    const walletAccounts: WalletAccount[] = addresses.map((address, idx) => ({
      name: `${this.ctx.getMetadataName()} Account ${idx + 1}`,
      address,
      metadata
    }))

    const walletState = this.ctx.store.getWalletState()

    if (!walletState) {
      const newWalletState: WalletState = {
        accounts: walletAccounts,
        activeAccount: walletAccounts[0]
      }
      this.ctx.store.addWallet(newWalletState)
      this.ctx.logger.info('Connected', newWalletState)
    } else if (!compareAccounts(walletAccounts, walletState.accounts)) {
      this.ctx.logger.warn('Session accounts mismatch, updating accounts', {
        prev: walletState.accounts,
        current: walletAccounts
      })
      this.ctx.store.setAccounts(walletAccounts)
    }

    this.session = session
    return walletAccounts
  }

  // ---------- Public: session lifecycle ----------------------------- //

  public connect = async (handlers: WalletConnectConnectHandlers): Promise<WalletAccount[]> => {
    this.ctx.logger.info('Connecting via WalletConnect...')
    try {
      const activeChainId = this.activeChainId
      if (!activeChainId) {
        throw new Error(
          `Network "${this.ctx.getActiveNetwork()}" has no caipChainId; add one to its NetworkConfig`
        )
      }

      const client = await this.getClient()

      const methods = this.enableSignData ? [SIGN_TXN_METHOD, SIGN_DATA_METHOD] : [SIGN_TXN_METHOD]

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          algorand: {
            chains: [activeChainId],
            methods: [SIGN_TXN_METHOD],
            events: []
          }
        },
        optionalNamespaces: {
          algorand: {
            chains: this.supportedChainIds,
            methods,
            events: SESSION_EVENTS
          }
        }
      })

      if (!uri) {
        this.ctx.logger.error('No URI found')
        throw new Error('No URI found')
      }

      if (this.useWalletConnectModal) {
        const modal = this.modal ?? (await this.initializeModal())
        await modal.openModal({ uri })
      } else {
        await handlers.onDisplayUri(uri)
      }

      const session = await raceAbort(approval(), handlers.signal)
      const walletAccounts = this.onSessionConnected(session)
      this.ctx.logger.info('Connected successfully')
      return walletAccounts
    } catch (error: any) {
      this.ctx.logger.error('Error connecting:', error?.message ?? error)
      throw error
    } finally {
      this.modal?.closeModal()
    }
  }

  public disconnect = async (): Promise<void> => {
    this.ctx.logger.info('Disconnecting...')
    try {
      if (this.client && this.session) {
        const topic = this.session.topic
        this.session = null
        await this.client.disconnect({
          topic,
          reason: { message: 'User disconnected.', code: 6000 }
        })
      }
      this.ctx.logger.info('Disconnected')
    } catch (error: any) {
      this.ctx.logger.error('Error disconnecting:', error?.message ?? error)
      throw error
    }
  }

  public resume = async (): Promise<void> => {
    try {
      this.ctx.logger.info('Resuming session...')
      const client = await this.getClient()

      if (client.session.length) {
        const lastKey = client.session.keys[client.session.keys.length - 1]
        this.onSessionConnected(client.session.get(lastKey))
        this.ctx.logger.info('Session resumed successfully')
      } else {
        this.ctx.logger.warn('No WalletConnect session found in storage, disconnecting')
        this.ctx.onDisconnect()
      }
    } catch (error: any) {
      this.ctx.logger.error('Error resuming session:', error?.message ?? error)
      this.ctx.onDisconnect()
      throw error
    }
  }

  // ---------- Public: transaction signing (ARC-0001) ---------------- //

  private processTxns(
    txnGroup: algosdk.Transaction[],
    indexesToSign?: number[]
  ): WalletTransaction[] {
    return txnGroup.map((txn, index) => {
      const isIndexMatch = !indexesToSign || indexesToSign.includes(index)
      const canSignTxn = this.ctx.getAddresses().includes(txn.sender.toString())
      const txnString = byteArrayToBase64(txn.toByte())
      return isIndexMatch && canSignTxn ? { txn: txnString } : { txn: txnString, signers: [] }
    })
  }

  private processEncodedTxns(
    txnGroup: Uint8Array[],
    indexesToSign?: number[]
  ): WalletTransaction[] {
    return txnGroup.map((txnBuffer, index) => {
      const isSigned = isSignedTxn(algosdk.msgpackRawDecode(txnBuffer))
      const txn = isSigned
        ? algosdk.decodeSignedTransaction(txnBuffer).txn
        : algosdk.decodeUnsignedTransaction(txnBuffer)

      const isIndexMatch = !indexesToSign || indexesToSign.includes(index)
      const canSignTxn = !isSigned && this.ctx.getAddresses().includes(txn.sender.toString())
      const txnString = byteArrayToBase64(txn.toByte())
      return isIndexMatch && canSignTxn ? { txn: txnString } : { txn: txnString, signers: [] }
    })
  }

  public signTransactions = async <T extends algosdk.Transaction[] | Uint8Array[]>(
    txnGroup: T | T[],
    indexesToSign?: number[]
  ): Promise<(Uint8Array | null)[]> => {
    try {
      if (!this.session) {
        this.ctx.logger.error('No session found!')
        throw new SessionError('No session found!')
      }

      this.ctx.logger.debug('Signing transactions...', { txnGroup, indexesToSign })

      const txnsToSign: WalletTransaction[] = isTransactionArray(txnGroup)
        ? this.processTxns(flattenTxnGroup(txnGroup), indexesToSign)
        : this.processEncodedTxns(flattenTxnGroup(txnGroup as Uint8Array[]), indexesToSign)

      const client = await this.getClient()
      const request = formatJsonRpcRequest(SIGN_TXN_METHOD, [txnsToSign])

      this.ctx.logger.debug('Sending transactions to wallet...', txnsToSign)

      const signTxnsResult = await client.request<SignTxnsResponse>({
        chainId: this.activeChainId,
        topic: this.session.topic,
        request
      })

      this.ctx.logger.debug('Received signed transactions from wallet', signTxnsResult)

      const signedTxns = signTxnsResult.reduce<Uint8Array[]>((acc, value) => {
        if (value) {
          if (typeof value === 'string') acc.push(base64ToByteArray(value))
          else if (value instanceof Uint8Array) acc.push(value)
          else if (Array.isArray(value)) acc.push(new Uint8Array(value))
          else this.ctx.logger.warn('Unexpected type in signTxnsResult', value)
        }
        return acc
      }, [])

      // ARC-0001: null for transactions the wallet was asked not to sign.
      const result = txnsToSign.map<Uint8Array | null>((txn) => {
        if (txn.signers && txn.signers.length === 0) return null
        return signedTxns.shift() ?? null
      })

      this.ctx.logger.debug('Transactions signed successfully', result)
      return result
    } catch (error: any) {
      this.ctx.logger.error('Error signing transactions:', error?.message ?? error)
      throw error
    }
  }

  // ---------- Public: data signing (ARC-0060) ----------------------- //

  public signData = async (
    data: string,
    metadata: StdSignMetadata
  ): Promise<StdSignDataResponse> => {
    try {
      if (!this.enableSignData) {
        throw new SignDataError('Method not supported: signData (disabled by options)', 4200)
      }
      if (!this.session) {
        throw new SessionError('No session found!')
      }
      if (!this.sessionSupportsSignData) {
        throw new SignDataError('Connected wallet session does not support algo_signData', 4200)
      }

      this.ctx.logger.debug('Signing data...', { data, metadata })

      const stdSignData = await this.ctx.createStdSignData(data)

      const item: WireStdSigData = {
        data: stdSignData.data,
        signer: byteArrayToBase64(stdSignData.signer),
        domain: stdSignData.domain,
        authenticatorData: byteArrayToBase64(stdSignData.authenticatorData),
        scope: metadata.scope,
        encoding: metadata.encoding
      }
      if (stdSignData.requestId) item.requestId = stdSignData.requestId
      if (stdSignData.hdPath) item.hdPath = stdSignData.hdPath

      const client = await this.getClient()
      const request = formatJsonRpcRequest(SIGN_DATA_METHOD, [[item]])

      const response = await client.request<SignDataResponse>({
        chainId: this.activeChainId,
        topic: this.session.topic,
        request
      })

      const signature = response?.[0]?.signature
      if (!signature) {
        throw new SignDataError('Wallet returned no signature', 4001)
      }

      const result: StdSignDataResponse = {
        ...stdSignData,
        signature: base64ToByteArray(signature)
      }

      this.ctx.logger.debug('Data signed successfully', result)
      return result
    } catch (error: any) {
      if (error instanceof SignDataError || error instanceof SessionError) {
        this.ctx.logger.error('Error signing data:', error.message)
        throw error
      }
      // WalletConnect JSON-RPC error 5000 = user rejected.
      const code = error?.code === 5000 ? 4001 : 4300
      this.ctx.logger.error('Error signing data:', error?.message ?? error)
      throw new SignDataError(error?.message ?? 'Unknown error signing data', code, error)
    }
  }
}
