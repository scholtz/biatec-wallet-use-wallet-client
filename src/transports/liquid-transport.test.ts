import algosdk from 'algosdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestHarness } from '@txnlab/use-wallet/testing'
import type { State } from '@txnlab/use-wallet/testing'
import { ScopeType, SignDataError, byteArrayToBase64 } from '@txnlab/use-wallet/adapter'
import { BiatecWalletAdapter, WALLET_ID, type BiatecWalletOptions } from '../adapter'
import {
  LiquidProviderError,
  LiquidReference,
  decodeLiquidMessage,
  encodeLiquidMessage,
  fromBase64Url,
  toBase64Url,
  type LiquidRequestMessage
} from '../liquid/protocol'

// ---------- Fake socket.io + WebRTC ------------------------------------------- //

const mocks = vi.hoisted(() => {
  type Handler = (...args: any[]) => void
  const listeners = new Map<string, Handler[]>()
  const socket = {
    id: 'sock-1',
    connected: true,
    emitted: [] as { event: string; payload: unknown }[],
    on: vi.fn((event: string, handler: Handler) => {
      listeners.set(event, [...(listeners.get(event) ?? []), handler])
    }),
    once: vi.fn((event: string, handler: Handler) => {
      const wrapped: Handler = (...args) => {
        socket.off(event, wrapped)
        handler(...args)
      }
      listeners.set(event, [...(listeners.get(event) ?? []), wrapped])
    }),
    off: vi.fn((event: string, handler: Handler) => {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((h) => h !== handler)
      )
    }),
    emit: vi.fn((event: string, payload?: unknown, ack?: (data: unknown) => void) => {
      socket.emitted.push({ event, payload })
      if (event === 'link' && ack) {
        setTimeout(
          () =>
            ack({ data: { requestId: (payload as any).requestId, wallet: mocks.walletAddress } }),
          0
        )
      }
    }),
    listenerCount: (event: string) => (listeners.get(event) ?? []).length,
    removeAllListeners: vi.fn(() => listeners.clear()),
    disconnect: vi.fn(),
    trigger: (event: string, ...args: unknown[]) => {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(...args)
    },
    reset: () => {
      listeners.clear()
      socket.emitted.length = 0
    }
  }
  return { socket, io: vi.fn(() => socket), walletAddress: '' }
})

vi.mock('socket.io-client', () => ({ io: mocks.io }))

class FakeDataChannel {
  readyState: RTCDataChannelState = 'open'
  sent: string[] = []
  /** Index into `sent` up to which requests have been answered by the test. */
  answered = 0
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: (() => void) | null = null
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.readyState = 'closed'
    this.onclose?.()
  }
  addEventListener() {}
  /** Test helper: deliver a message from the "wallet". */
  receive(payload: string) {
    this.onmessage?.({ data: payload } as MessageEvent)
  }
  async lastRequest(): Promise<LiquidRequestMessage> {
    return (await decodeLiquidMessage(this.sent[this.sent.length - 1])) as LiquidRequestMessage
  }
}

let currentChannel: FakeDataChannel
let currentPeerConnection: FakePeerConnection

function resetFakes() {
  // Each test must observe only the channel/peer connection it creates itself.
  currentChannel = undefined as unknown as FakeDataChannel
  currentPeerConnection = undefined as unknown as FakePeerConnection
}

class FakePeerConnection {
  remoteDescription: RTCSessionDescriptionInit | null = null
  localDescription: RTCSessionDescriptionInit | null = null
  connectionState: RTCPeerConnectionState = 'new'
  ondatachannel: ((event: { channel: RTCDataChannel }) => void) | null = null
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  candidates: RTCIceCandidateInit[] = []
  constructor(public config: RTCConfiguration) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    currentPeerConnection = this
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description
  }
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'v=0 answer' }
  }
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description
    // The wallet opens the channel once the answer lands.
    currentChannel = new FakeDataChannel()
    this.connectionState = 'connected'
    this.ondatachannel?.({ channel: currentChannel as unknown as RTCDataChannel })
  }
  async addIceCandidate(candidate: RTCIceCandidateInit) {
    this.candidates.push(candidate)
  }
  close() {
    this.connectionState = 'closed'
  }
}

// ---------- Fixtures ----------------------------------------------- //

const account1 = algosdk.generateAccount()
const stranger = algosdk.generateAccount()
const ADDR1 = account1.addr.toString()
const STRANGER = stranger.addr.toString()

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
    options: {
      projectId: 'unused-in-these-tests',
      ...options,
      liquid: options.liquid === false ? false : { providerId: 'dapp-provider', ...options.liquid }
    }
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

/** Polls until `predicate` holds (the adapter lazily imports cbor-x, so timings vary). */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

/** Drives a full pairing: link ack, wallet offer, answer, channel open, hello answered. */
async function connectAdapter(options: Partial<BiatecWalletOptions> = {}) {
  const ctx = createAdapter(options)
  const connecting = ctx.adapter.connect({ method: 'liquid' })
  // Wait until the socket is connected, link acked and the offer listener is armed.
  await waitFor(() => mocks.socket.emitted.some((e) => e.event === 'link'))
  await waitFor(() => mocks.socket.listenerCount('offer-description') > 0)
  mocks.socket.trigger('offer-candidate', { candidate: 'c1', sdpMid: '0', sdpMLineIndex: 0 })
  mocks.socket.trigger('offer-description', 'v=0 offer')
  // Answer the hello handshake once it has been sent.
  await waitFor(() => Boolean(currentChannel?.sent.length))
  const hello = await currentChannel.lastRequest()
  expect(hello.reference).toBe(LiquidReference.helloRequest)
  currentChannel.answered = currentChannel.sent.length
  currentChannel.receive(
    await encodeLiquidMessage({
      id: 'w1',
      requestId: hello.id,
      reference: LiquidReference.helloResponse,
      result: { providerId: 'biatec', wallet: mocks.walletAddress, name: 'Biatec Wallet' }
    })
  )
  const accounts = await connecting
  return { ...ctx, accounts }
}

/** Waits for the adapter's next outgoing request and answers it. */
async function respondToLastRequest(reference: string, result?: unknown, error?: unknown) {
  await waitFor(() => Boolean(currentChannel))
  const before = currentChannel.answered
  await waitFor(() => currentChannel.sent.length > before)
  const request = await currentChannel.lastRequest()
  currentChannel.answered = currentChannel.sent.length
  const message: any = { id: 'w2', requestId: request.id, reference }
  if (error) message.error = error
  else message.result = result
  currentChannel.receive(await encodeLiquidMessage(message))
  return request
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.socket.reset()
  resetFakes()
  mocks.walletAddress = ADDR1
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection)
  vi.stubGlobal(
    'RTCIceCandidate',
    class {
      constructor(init: RTCIceCandidateInit) {
        Object.assign(this, init)
      }
    }
  )
  vi.stubGlobal('location', { host: 'dapp.example' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------- Tests -------------------------------------------------- //

describe('BiatecWalletAdapter — Liquid Auth transport', () => {
  describe('connect', () => {
    it('hands a liquid:// link to onDisplayUri, links, answers the offer and stores the wallet', async () => {
      const onDisplayUri = vi.fn()
      const { adapter, accounts } = await connectAdapter({ onDisplayUri })

      expect(onDisplayUri).toHaveBeenCalledTimes(1)
      const [uri, info] = onDisplayUri.mock.calls[0]
      expect(uri).toBe(`liquid://liquid.biatec.io/?requestId=${info.requestId}`)
      expect(info.origin).toBe('https://liquid.biatec.io')
      expect(info.method).toBe('liquid')

      expect(mocks.io).toHaveBeenCalledWith('https://liquid.biatec.io', {
        transports: ['websocket'],
        withCredentials: true,
        autoConnect: true
      })
      expect(mocks.socket.emitted.map((e) => e.event)).toEqual(
        expect.arrayContaining(['link', 'answer-description'])
      )
      expect(currentPeerConnection.remoteDescription).toEqual({ type: 'offer', sdp: 'v=0 offer' })
      expect(currentPeerConnection.candidates).toEqual([
        { candidate: 'c1', sdpMid: '0', sdpMLineIndex: 0 }
      ])
      expect(currentPeerConnection.config.iceServers?.[0].urls).toContain(
        'stun:stun.l.google.com:19302'
      )

      expect(accounts).toEqual([
        {
          name: 'Biatec Wallet Account 1',
          address: ADDR1,
          metadata: {
            method: 'liquid',
            requestId: info.requestId,
            origin: 'https://liquid.biatec.io'
          }
        }
      ])
      expect(adapter.activeAddress).toBe(ADDR1)
      expect(adapter.isConnected).toBe(true)
      expect(adapter.walletInfo?.name).toBe('Biatec Wallet')
      expect(adapter.isChannelOpen).toBe(true)
    })

    it('uses a custom origin and ICE servers', async () => {
      const iceServers = [{ urls: ['stun:stun.example:3478'] }]
      const onDisplayUri = vi.fn()
      await connectAdapter({
        onDisplayUri,
        liquid: { origin: 'https://liquid.example.com/', iceServers }
      })
      expect(onDisplayUri.mock.calls[0][0]).toMatch(
        /^liquid:\/\/liquid\.example\.com\/\?requestId=/
      )
      expect(mocks.io).toHaveBeenCalledWith('https://liquid.example.com', expect.anything())
      expect(currentPeerConnection.config.iceServers).toBe(iceServers)
    })

    it('times out when the wallet never pairs', async () => {
      const { adapter } = createAdapter({ liquid: { connectTimeoutMs: 20 } })
      await expect(adapter.connect({ method: 'liquid' })).rejects.toThrow(/Timed out/)
      expect(adapter.isConnected).toBe(false)
    })
  })

  describe('resumeSession', () => {
    it('does nothing without persisted state', async () => {
      const { adapter } = createAdapter()
      await adapter.resumeSession()
      expect(mocks.io).not.toHaveBeenCalled()
    })

    it('restores accounts and lazily re-pairs on the first signing request', async () => {
      const { adapter } = createAdapter(
        { liquid: { reconnectTimeoutMs: 500 } },
        {
          wallets: {
            [WALLET_ID]: {
              accounts: [
                {
                  name: 'a',
                  address: ADDR1,
                  metadata: {
                    method: 'liquid',
                    requestId: 'stored-request',
                    origin: 'https://liquid.biatec.io'
                  }
                }
              ],
              activeAccount: {
                name: 'a',
                address: ADDR1,
                metadata: {
                  method: 'liquid',
                  requestId: 'stored-request',
                  origin: 'https://liquid.biatec.io'
                }
              }
            }
          }
        }
      )
      await adapter.resumeSession()
      expect(adapter.isConnected).toBe(true)
      expect(mocks.io).not.toHaveBeenCalled()

      const signing = adapter.signTransactions([makePayment(ADDR1, STRANGER)])
      await waitFor(() => mocks.socket.emitted.some((e) => e.event === 'link'))
      expect(mocks.socket.emitted[0]).toEqual({
        event: 'link',
        payload: { requestId: 'stored-request' }
      })
      await waitFor(() => mocks.socket.listenerCount('offer-description') > 0)
      mocks.socket.trigger('offer-description', 'v=0 offer')
      // hello, then the actual request
      await respondToLastRequest(LiquidReference.helloResponse, { providerId: 'b', wallet: ADDR1 })
      const request = await respondToLastRequest(LiquidReference.signTransactionsResponse, {
        providerId: 'b',
        stxns: [toBase64Url(new Uint8Array([1, 2, 3]))]
      })
      expect(request.reference).toBe(LiquidReference.signTransactionsRequest)
      expect(await signing).toEqual([new Uint8Array([1, 2, 3])])
    })

    it('fails fast with a clear error when the wallet is not around to re-pair', async () => {
      const { adapter } = createAdapter(
        { liquid: { reconnectTimeoutMs: 20 } },
        {
          wallets: {
            [WALLET_ID]: {
              accounts: [
                {
                  name: 'a',
                  address: ADDR1,
                  metadata: { method: 'liquid', requestId: 'r', origin: 'x' }
                }
              ],
              activeAccount: {
                name: 'a',
                address: ADDR1,
                metadata: { method: 'liquid', requestId: 'r', origin: 'x' }
              }
            }
          }
        }
      )
      await adapter.resumeSession()
      const error = await adapter.signTransactions([makePayment(ADDR1, STRANGER)]).catch((e) => e)
      expect(error).toBeInstanceOf(LiquidProviderError)
      expect(error.code).toBe(4002)
      expect(error.message).toMatch(/Open Biatec Wallet/)
    })
  })

  describe('signTransactions', () => {
    it('sends ARC-0027 sign_transactions with signers: [] for foreign senders and maps results', async () => {
      const { adapter } = await connectAdapter()
      const own = makePayment(ADDR1, STRANGER)
      const foreign = makePayment(STRANGER, ADDR1)
      const signed = new Uint8Array([9, 9, 9, 9])

      const signing = adapter.signTransactions([own, foreign])
      const request = await respondToLastRequest(LiquidReference.signTransactionsResponse, {
        providerId: 'biatec',
        stxns: [toBase64Url(signed), null]
      })

      expect(request.reference).toBe(LiquidReference.signTransactionsRequest)
      expect(request.params).toEqual({
        providerId: 'dapp-provider',
        txns: [
          { txn: toBase64Url(own.toByte()) },
          { txn: toBase64Url(foreign.toByte()), signers: [] }
        ]
      })
      expect(await signing).toEqual([signed, null])
    })

    it('attaches raw 64-byte signatures returned by reference wallets', async () => {
      const { adapter } = await connectAdapter()
      const txn = makePayment(ADDR1, STRANGER)
      const signature = algosdk.signTransaction(txn, account1.sk)
      const rawSig = algosdk.decodeSignedTransaction(signature.blob).sig!

      const signing = adapter.signTransactions([txn])
      await respondToLastRequest(LiquidReference.signTransactionsResponse, {
        providerId: 'biatec',
        stxns: [toBase64Url(rawSig)]
      })
      const [result] = await signing
      expect(result).toEqual(signature.blob)
    })

    it('accepts standard base64 and honours indexesToSign', async () => {
      const { adapter } = await connectAdapter()
      const first = makePayment(ADDR1, STRANGER)
      const second = makePayment(ADDR1, STRANGER)
      const signing = adapter.signTransactions(
        [algosdk.encodeUnsignedTransaction(first), algosdk.encodeUnsignedTransaction(second)],
        [1]
      )
      const request = await respondToLastRequest(LiquidReference.signTransactionsResponse, {
        providerId: 'biatec',
        stxns: [null, byteArrayToBase64(new Uint8Array([7, 7, 7]))]
      })
      expect((request.params as any).txns[0].signers).toEqual([])
      expect((request.params as any).txns[1].signers).toBeUndefined()
      expect(await signing).toEqual([null, new Uint8Array([7, 7, 7])])
    })

    it('surfaces ARC-0027 errors from the wallet', async () => {
      const { adapter } = await connectAdapter()
      const signing = adapter.signTransactions([makePayment(ADDR1, STRANGER)])
      await respondToLastRequest(LiquidReference.signTransactionsResponse, undefined, {
        code: 4001,
        message: 'User rejected'
      })
      const error = await signing.catch((e) => e)
      expect(error).toBeInstanceOf(LiquidProviderError)
      expect(error.code).toBe(4001)
    })

    it('times out when the wallet never answers', async () => {
      const { adapter } = await connectAdapter({ liquid: { requestTimeoutMs: 20 } })
      const error = await adapter.signTransactions([makePayment(ADDR1, STRANGER)]).catch((e) => e)
      expect(error).toBeInstanceOf(LiquidProviderError)
      expect(error.code).toBe(4002)
    })
  })

  describe('signData (ARC-0060)', () => {
    const metadata = { scope: ScopeType.AUTH, encoding: 'base64' }
    const data = byteArrayToBase64(new TextEncoder().encode('hello'))

    it('sends a base64url StdSigData item and returns the signature', async () => {
      const { adapter } = await connectAdapter()
      const signature = new Uint8Array(64).fill(3)
      const signing = adapter.signData(data, metadata)
      const request = await respondToLastRequest(LiquidReference.signDataResponse, {
        providerId: 'biatec',
        signatures: [toBase64Url(signature)]
      })
      const item = (request.params as any).items[0]
      expect(request.reference).toBe(LiquidReference.signDataRequest)
      expect(fromBase64Url(item.signer)).toEqual(account1.addr.publicKey)
      expect(item.domain).toBe('dapp.example')
      expect(fromBase64Url(item.authenticatorData)).toHaveLength(32)
      expect(item.scope).toBe(ScopeType.AUTH)
      const result = await signing
      expect(result.signature).toEqual(signature)
    })

    it('maps wallet rejections to ARC-0060 4001 and null signatures to 4001', async () => {
      const { adapter } = await connectAdapter()
      let signing = adapter.signData(data, metadata)
      await respondToLastRequest(LiquidReference.signDataResponse, undefined, {
        code: 4001,
        message: 'nope'
      })
      let error = await signing.catch((e) => e)
      expect(error).toBeInstanceOf(SignDataError)
      expect(error.code).toBe(4001)

      signing = adapter.signData(data, metadata)
      await respondToLastRequest(LiquidReference.signDataResponse, {
        providerId: 'b',
        signatures: [null]
      })
      error = await signing.catch((e) => e)
      expect(error.code).toBe(4001)
    })

    it('rejects with 4200 when disabled', async () => {
      const { adapter } = await connectAdapter({ enableSignData: false })
      expect(adapter.canSignData).toBe(false)
      const error = await adapter.signData(data, metadata).catch((e) => e)
      expect(error.code).toBe(4200)
    })
  })

  describe('disconnect', () => {
    it('closes the channel, peer connection and socket and clears the store', async () => {
      const { adapter } = await connectAdapter()
      await adapter.disconnect()
      expect(currentChannel.readyState).toBe('closed')
      expect(currentPeerConnection.connectionState).toBe('closed')
      expect(mocks.socket.disconnect).toHaveBeenCalled()
      expect(adapter.isConnected).toBe(false)
    })

    it('rejects pending requests when the wallet closes the channel', async () => {
      const { adapter } = await connectAdapter()
      const signing = adapter.signTransactions([makePayment(ADDR1, STRANGER)])
      await waitFor(() => currentChannel.sent.length > currentChannel.answered)
      currentChannel.close()
      await expect(signing).rejects.toThrow('Data channel closed')
      expect(adapter.isChannelOpen).toBe(false)
      // The pairing stays known so the next request lazily re-pairs.
      expect(adapter.isConnected).toBe(true)
    })
  })
})
