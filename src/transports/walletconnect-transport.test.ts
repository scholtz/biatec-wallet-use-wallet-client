import algosdk from 'algosdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestHarness } from '@txnlab/use-wallet/testing'
import type { State } from '@txnlab/use-wallet/testing'
import { ScopeType, SignDataError, byteArrayToBase64 } from '@txnlab/use-wallet/adapter'
import type { SessionTypes } from '@walletconnect/types'
import {
  BiatecWalletAdapter,
  SIGN_DATA_METHOD,
  SIGN_TXN_METHOD,
  SessionError,
  WALLET_ID,
  type BiatecWalletOptions
} from '../adapter'
import { BIATEC_CAIP_CHAIN_IDS } from '../networks'

// ---------- Mocks -------------------------------------------------- //

const mocks = vi.hoisted(() => {
  const signClient = {
    connect: vi.fn(),
    request: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    session: {
      length: 0,
      keys: [] as string[],
      get: vi.fn()
    }
  }
  const modal = {
    openModal: vi.fn(),
    closeModal: vi.fn(),
    subscribeModal: vi.fn()
  }
  return {
    signClient,
    modal,
    signClientInit: vi.fn(async () => signClient),
    modalCtor: vi.fn(() => modal)
  }
})

vi.mock('@walletconnect/sign-client', () => ({
  SignClient: { init: mocks.signClientInit }
}))

vi.mock('@walletconnect/modal', () => ({
  WalletConnectModal: mocks.modalCtor
}))

// ---------- Fixtures ----------------------------------------------- //

const account1 = algosdk.generateAccount()
const account2 = algosdk.generateAccount()
const stranger = algosdk.generateAccount()

const ADDR1 = account1.addr.toString()
const ADDR2 = account2.addr.toString()
const STRANGER = stranger.addr.toString()

const TESTNET = BIATEC_CAIP_CHAIN_IDS.testnet
const MAINNET = BIATEC_CAIP_CHAIN_IDS.mainnet

function makeSession(
  overrides: Partial<SessionTypes.Namespace> = {},
  topic = 'topic-1'
): SessionTypes.Struct {
  return {
    topic,
    namespaces: {
      algorand: {
        accounts: [`${TESTNET}:${ADDR1}`, `${MAINNET}:${ADDR1}`, `${TESTNET}:${ADDR2}`],
        methods: [SIGN_TXN_METHOD, SIGN_DATA_METHOD],
        chains: [TESTNET, MAINNET],
        events: [],
        ...overrides
      }
    }
  } as unknown as SessionTypes.Struct
}

const mockAlgodClient = {
  accountInformation: () => ({ do: async () => ({ authAddr: undefined }) })
} as unknown as algosdk.Algodv2

function createAdapter(options: Partial<BiatecWalletOptions> = {}, state?: Partial<State>) {
  const { store, accessor } = createTestHarness(WALLET_ID, state)
  const adapter = new BiatecWalletAdapter({
    id: WALLET_ID,
    metadata: BiatecWalletAdapter.defaultMetadata,
    store: accessor,
    subscribe: (callback) => {
      const subscription = store.subscribe(() => callback(store.state))
      return () => subscription.unsubscribe()
    },
    getAlgodClient: () => mockAlgodClient,
    options: { projectId: 'test-project-id', ...options }
  })
  return { adapter, store }
}

function makePayment(sender: string, receiver: string): algosdk.Transaction {
  return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender,
    receiver,
    amount: 1000,
    suggestedParams: {
      fee: 1000,
      minFee: 1000,
      flatFee: true,
      firstValid: 1,
      lastValid: 1000,
      genesisID: 'testnet-v1.0',
      genesisHash: algosdk.base64ToBytes('SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=')
    }
  })
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/** Drive the adapter through a full WalletConnect connect so `session` is populated. */
async function connectAdapter(options: Partial<BiatecWalletOptions> = {}, session = makeSession()) {
  mocks.signClient.connect.mockResolvedValue({
    uri: 'wc:abc@2?relay-protocol=irn&symKey=123',
    approval: async () => session
  })
  const ctx = createAdapter({ onDisplayUri: () => undefined, ...options })
  await ctx.adapter.connect({ method: 'walletconnect' })
  return ctx
}

// ---------- Tests -------------------------------------------------- //

beforeEach(() => {
  vi.clearAllMocks()
  mocks.signClient.session.length = 0
  mocks.signClient.session.keys = []
  vi.stubGlobal('location', { host: 'dapp.example' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BiatecWalletAdapter — WalletConnect transport', () => {
  describe('constructor', () => {
    it('throws when projectId is missing', () => {
      const { accessor, store } = createTestHarness(WALLET_ID)
      expect(
        () =>
          new BiatecWalletAdapter({
            id: WALLET_ID,
            metadata: BiatecWalletAdapter.defaultMetadata,
            store: accessor,
            subscribe: (cb) => {
              const subscription = store.subscribe(() => cb(store.state))
              return () => subscription.unsubscribe()
            },
            getAlgodClient: () => mockAlgodClient,
            options: {} as BiatecWalletOptions
          })
      ).toThrow('Missing required option: projectId')
    })

    it('enables signData by default and honours enableSignData: false', () => {
      expect(createAdapter().adapter.canSignData).toBe(true)
      expect(createAdapter({ enableSignData: false }).adapter.canSignData).toBe(false)
    })

    it('exposes Biatec metadata', () => {
      expect(BiatecWalletAdapter.defaultMetadata.name).toBe('Biatec Wallet')
      expect(
        BiatecWalletAdapter.defaultMetadata.icon.startsWith('data:image/svg+xml;base64,')
      ).toBe(true)
    })
  })

  describe('chains', () => {
    it('reports the active chain first followed by every configured chain', () => {
      const { adapter } = createAdapter({ chains: ['algorand:custom'] })
      const ids = adapter.supportedChainIds
      expect(ids[0]).toBe(adapter.activeChainId)
      expect(ids).toContain(MAINNET)
      expect(ids).toContain(TESTNET)
      expect(ids).toContain('algorand:custom')
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe('connect', () => {
    it('requests the active chain as required, all chains + signData as optional', async () => {
      const { adapter } = await connectAdapter()

      expect(mocks.signClient.connect).toHaveBeenCalledTimes(1)
      const params = mocks.signClient.connect.mock.calls[0][0]
      expect(params.requiredNamespaces.algorand).toEqual({
        chains: [adapter.activeChainId],
        methods: [SIGN_TXN_METHOD],
        events: []
      })
      expect(params.optionalNamespaces.algorand.methods).toEqual([
        SIGN_TXN_METHOD,
        SIGN_DATA_METHOD
      ])
      expect(params.optionalNamespaces.algorand.chains).toEqual(adapter.supportedChainIds)
    })

    it('omits algo_signData from the optional methods when disabled', async () => {
      await connectAdapter({ enableSignData: false })
      const params = mocks.signClient.connect.mock.calls[0][0]
      expect(params.optionalNamespaces.algorand.methods).toEqual([SIGN_TXN_METHOD])
    })

    it('stores de-duplicated accounts and marks the first one active', async () => {
      const { adapter, store } = await connectAdapter()

      expect(adapter.accounts.map((a) => a.address)).toEqual([ADDR1, ADDR2])
      expect(adapter.accounts[0].name).toBe('Biatec Wallet Account 1')
      expect(adapter.activeAddress).toBe(ADDR1)
      expect(store.state.wallets[WALLET_ID]?.activeAccount?.address).toBe(ADDR1)
      expect(adapter.isConnected).toBe(true)
    })

    it('opens and closes the WalletConnect modal when useWalletConnectModal is set', async () => {
      const session = makeSession()
      mocks.signClient.connect.mockResolvedValue({
        uri: 'wc:uri',
        approval: async () => session
      })
      const { adapter } = createAdapter({ useWalletConnectModal: true, themeMode: 'dark' })

      await adapter.connect({ method: 'walletconnect' })

      expect(mocks.modalCtor).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        themeMode: 'dark'
      })
      expect(mocks.modal.openModal).toHaveBeenCalledWith({ uri: 'wc:uri' })
      expect(mocks.modal.closeModal).toHaveBeenCalled()
    })

    it('hands the URI to onDisplayUri instead of the modal', async () => {
      const onDisplayUri = vi.fn()
      await connectAdapter({ onDisplayUri })

      expect(onDisplayUri).toHaveBeenCalledWith('wc:abc@2?relay-protocol=irn&symKey=123', {
        method: 'walletconnect'
      })
      expect(mocks.modalCtor).not.toHaveBeenCalled()
    })

    it('throws when the client returns no URI', async () => {
      mocks.signClient.connect.mockResolvedValue({ uri: undefined, approval: async () => null })
      const { adapter } = createAdapter({ onDisplayUri: () => undefined })
      await expect(adapter.connect({ method: 'walletconnect' })).rejects.toThrow('No URI found')
    })

    it('throws when the session has no accounts', async () => {
      mocks.signClient.connect.mockResolvedValue({
        uri: 'wc:uri',
        approval: async () => makeSession({ accounts: [] })
      })
      const { adapter } = createAdapter({ onDisplayUri: () => undefined })
      await expect(adapter.connect({ method: 'walletconnect' })).rejects.toThrow(
        'No accounts found!'
      )
    })

    it('removes the wallet when the wallet deletes the session', async () => {
      const { adapter } = await connectAdapter()
      const deleteHandler = mocks.signClient.on.mock.calls.find(
        ([event]) => event === 'session_delete'
      )?.[1]
      expect(deleteHandler).toBeTypeOf('function')

      deleteHandler()

      expect(adapter.isConnected).toBe(false)
    })
  })

  describe('resumeSession', () => {
    it('does nothing when there is no persisted wallet state', async () => {
      const { adapter } = createAdapter()
      await adapter.resumeSession()
      expect(mocks.signClientInit).not.toHaveBeenCalled()
    })

    it('restores the last WalletConnect session and syncs accounts', async () => {
      const session = makeSession()
      mocks.signClient.session.length = 1
      mocks.signClient.session.keys = ['topic-1']
      mocks.signClient.session.get.mockReturnValue(session)

      const { adapter } = createAdapter(
        {},
        {
          wallets: {
            [WALLET_ID]: {
              accounts: [
                { name: 'stale', address: STRANGER, metadata: { method: 'walletconnect' } }
              ],
              activeAccount: {
                name: 'stale',
                address: STRANGER,
                metadata: { method: 'walletconnect' }
              }
            }
          }
        }
      )

      await adapter.resumeSession()

      expect(adapter.accounts.map((a) => a.address)).toEqual([ADDR1, ADDR2])
      expect(adapter.sessionSupportsSignData).toBe(true)
    })

    it('disconnects when the relay has no session to restore', async () => {
      const { adapter } = createAdapter(
        {},
        {
          wallets: {
            [WALLET_ID]: {
              accounts: [{ name: 'a', address: ADDR1, metadata: { method: 'walletconnect' } }],
              activeAccount: { name: 'a', address: ADDR1, metadata: { method: 'walletconnect' } }
            }
          }
        }
      )

      await adapter.resumeSession()

      expect(adapter.isConnected).toBe(false)
    })
  })

  describe('disconnect', () => {
    it('tears down the session and clears the store', async () => {
      const { adapter } = await connectAdapter()

      await adapter.disconnect()

      expect(mocks.signClient.disconnect).toHaveBeenCalledWith({
        topic: 'topic-1',
        reason: { message: 'User disconnected.', code: 6000 }
      })
      expect(adapter.isConnected).toBe(false)
    })
  })

  describe('signTransactions', () => {
    it('throws a SessionError before connecting', async () => {
      const { adapter } = createAdapter()
      await expect(adapter.signTransactions([makePayment(ADDR1, ADDR2)])).rejects.toBeInstanceOf(
        SessionError
      )
    })

    it('sends algo_signTxn with signers: [] for foreign senders and maps results', async () => {
      const { adapter } = await connectAdapter()
      const own = makePayment(ADDR1, STRANGER)
      const foreign = makePayment(STRANGER, ADDR1)
      const signedBytes = new Uint8Array([1, 2, 3])
      mocks.signClient.request.mockResolvedValue([byteArrayToBase64(signedBytes)])

      const result = await adapter.signTransactions([own, foreign])

      const call = mocks.signClient.request.mock.calls[0][0]
      expect(call.topic).toBe('topic-1')
      expect(call.chainId).toBe(adapter.activeChainId)
      expect(call.request.method).toBe(SIGN_TXN_METHOD)
      expect(call.request.params).toEqual([
        [
          { txn: byteArrayToBase64(own.toByte()) },
          { txn: byteArrayToBase64(foreign.toByte()), signers: [] }
        ]
      ])
      expect(result).toEqual([signedBytes, null])
    })

    it('respects indexesToSign and accepts encoded transactions', async () => {
      const { adapter } = await connectAdapter()
      const first = makePayment(ADDR1, STRANGER)
      const second = makePayment(ADDR2, STRANGER)
      mocks.signClient.request.mockResolvedValue([[9, 9, 9]])

      const result = await adapter.signTransactions(
        [algosdk.encodeUnsignedTransaction(first), algosdk.encodeUnsignedTransaction(second)],
        [1]
      )

      const [params] = mocks.signClient.request.mock.calls[0][0].request.params
      expect(params[0]).toEqual({ txn: byteArrayToBase64(first.toByte()), signers: [] })
      expect(params[1]).toEqual({ txn: byteArrayToBase64(second.toByte()) })
      expect(result).toEqual([null, new Uint8Array([9, 9, 9])])
    })
  })

  describe('signData (ARC-0060)', () => {
    const metadata = { scope: ScopeType.AUTH, encoding: 'base64' }
    const data = byteArrayToBase64(new TextEncoder().encode('hello biatec'))

    it('sends a base64 StdSigData item bound to the dApp domain and returns the signature', async () => {
      const { adapter } = await connectAdapter()
      const signature = new Uint8Array(64).fill(7)
      mocks.signClient.request.mockResolvedValue([{ signature: byteArrayToBase64(signature) }])

      const result = await adapter.signData(data, metadata)

      const call = mocks.signClient.request.mock.calls[0][0]
      expect(call.request.method).toBe(SIGN_DATA_METHOD)
      const [[item]] = call.request.params
      expect(item).toEqual({
        data,
        signer: byteArrayToBase64(account1.addr.publicKey),
        domain: 'dapp.example',
        authenticatorData: byteArrayToBase64(await sha256('dapp.example')),
        scope: ScopeType.AUTH,
        encoding: 'base64'
      })
      expect(result.signature).toEqual(signature)
      expect(result.domain).toBe('dapp.example')
      expect(result.signer).toEqual(account1.addr.publicKey)
    })

    it('maps a null wallet result to ARC-0060 code 4001', async () => {
      const { adapter } = await connectAdapter()
      mocks.signClient.request.mockResolvedValue([null])

      const error = await adapter.signData(data, metadata).catch((e) => e)
      expect(error).toBeInstanceOf(SignDataError)
      expect(error.code).toBe(4001)
    })

    it('maps a WalletConnect user rejection (5000) to 4001 and other errors to 4300', async () => {
      const { adapter } = await connectAdapter()

      mocks.signClient.request.mockRejectedValueOnce({ code: 5000, message: 'User rejected.' })
      let error = await adapter.signData(data, metadata).catch((e) => e)
      expect(error.code).toBe(4001)

      mocks.signClient.request.mockRejectedValueOnce(new Error('relay down'))
      error = await adapter.signData(data, metadata).catch((e) => e)
      expect(error).toBeInstanceOf(SignDataError)
      expect(error.code).toBe(4300)
    })

    it('rejects with 4200 when the session does not advertise algo_signData', async () => {
      const { adapter } = await connectAdapter({}, makeSession({ methods: [SIGN_TXN_METHOD] }))
      const error = await adapter.signData(data, metadata).catch((e) => e)
      expect(error).toBeInstanceOf(SignDataError)
      expect(error.code).toBe(4200)
      expect(mocks.signClient.request).not.toHaveBeenCalled()
    })

    it('rejects with 4200 when disabled through options', async () => {
      const { adapter } = await connectAdapter({ enableSignData: false })
      const error = await adapter.signData(data, metadata).catch((e) => e)
      expect(error.code).toBe(4200)
    })

    it('throws a SessionError before connecting', async () => {
      const { adapter } = createAdapter()
      await expect(adapter.signData(data, metadata)).rejects.toBeInstanceOf(SessionError)
    })
  })
})
