/**
 * Minimal Liquid Auth signaling client for the **dApp (answer) role**.
 *
 * Talks to a Liquid Auth service (github.com/algorandfoundation/liquid-auth) over socket.io:
 *
 * 1. `link { requestId }` — joins the requestId room and resolves (via the server's ack) once a
 *    wallet has authenticated against that requestId with a passkey + Liquid extension.
 * 2. `offer-description` / `offer-candidate` arrive from the wallet; we answer with
 *    `answer-description` / `answer-candidate`. The wallet opens the data channel.
 *
 * Only the events the dApp needs are implemented; the official `@algorandfoundation/liquid-client`
 * was not used because it pulls in `node-canvas` and a GitHub-only QR dependency.
 */
import type { Socket } from 'socket.io-client'
import { DEFAULT_ICE_SERVERS } from './protocol'

export interface LinkMessage {
  requestId: string
  wallet: string
  credId?: string
}

export interface LiquidPeerSession {
  wallet: string
  credId?: string
  peerConnection: RTCPeerConnection
  channel: RTCDataChannel
}

export interface LiquidSignalClientOptions {
  origin: string
  iceServers?: RTCIceServer[]
  /** Called for diagnostics; defaults to no-op. */
  log?: (message: string, ...args: unknown[]) => void
}

export class LiquidSignalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LiquidSignalError'
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new LiquidSignalError(`Timed out after ${ms} ms waiting for ${what}`)),
      ms
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

// Memoized so the dynamic import only ever resolves once per process — cheaper on every
// (re)connect attempt, and gives test suites that mock this specifier a single, deterministic
// point where the mock must be in place, instead of one per `LiquidSignalClient` instance.
let socketIoModule: Promise<typeof import('socket.io-client')> | null = null
function loadSocketIo(): Promise<typeof import('socket.io-client')> {
  return (socketIoModule ??= import('socket.io-client'))
}

export class LiquidSignalClient {
  private socket: Socket | null = null
  private readonly origin: string
  private readonly iceServers: RTCIceServer[]
  private readonly log: NonNullable<LiquidSignalClientOptions['log']>

  constructor(options: LiquidSignalClientOptions) {
    this.origin = options.origin.replace(/\/+$/, '')
    this.iceServers = options.iceServers ?? DEFAULT_ICE_SERVERS
    this.log = options.log ?? (() => undefined)
  }

  async connect(): Promise<Socket> {
    if (this.socket) return this.socket
    const { io } = await loadSocketIo()
    // websocket-only: the dApp is cross-site to the service, so no cookie survives between
    // polling requests; a single upgrade request keeps one express session for the socket.
    const socket = io(this.origin, {
      transports: ['websocket'],
      withCredentials: true,
      autoConnect: true
    })
    this.socket = socket
    await new Promise<void>((resolve, reject) => {
      if (socket.connected) return resolve()
      const onError = (error: Error) => {
        socket.off('connect', onConnect)
        reject(new LiquidSignalError(`Cannot reach Liquid Auth service: ${error.message}`))
      }
      const onConnect = () => {
        socket.off('connect_error', onError)
        resolve()
      }
      socket.once('connect', onConnect)
      socket.once('connect_error', onError)
    })
    this.log('signaling socket connected', socket.id)
    return socket
  }

  /** Resolves once a wallet has authenticated for `requestId` (server ack of `link`). */
  async link(requestId: string): Promise<LinkMessage> {
    const socket = await this.connect()
    return new Promise<LinkMessage>((resolve) => {
      socket.emit('link', { requestId }, (ack: { data?: LinkMessage } | LinkMessage) => {
        const data = ack && 'data' in ack && ack.data ? ack.data : (ack as LinkMessage)
        this.log('link acknowledged', data)
        resolve(data)
      })
    })
  }

  /**
   * Answer the wallet's WebRTC offer for `requestId` and resolve with the opened data channel.
   * Must be called after (or concurrently with) `link()` so the socket is in the requestId room.
   */
  async answer(
    requestId: string
  ): Promise<{ peerConnection: RTCPeerConnection; channel: RTCDataChannel }> {
    const socket = await this.connect()
    const peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10
    })
    const pendingCandidates: RTCIceCandidateInit[] = []

    const channelPromise = new Promise<RTCDataChannel>((resolve) => {
      peerConnection.ondatachannel = (event) => {
        const channel = event.channel
        if (channel.readyState === 'open') resolve(channel)
        else channel.addEventListener('open', () => resolve(channel), { once: true })
      }
    })

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) socket.emit('answer-candidate', event.candidate.toJSON())
    }

    const onOfferCandidate = async (candidate: RTCIceCandidateInit) => {
      if (peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch((error) => {
          this.log('addIceCandidate failed', error)
        })
      } else {
        pendingCandidates.push(candidate)
      }
    }
    socket.on('offer-candidate', onOfferCandidate)

    const onOfferDescription = async (sdp: string) => {
      this.log('offer received for', requestId)
      await peerConnection.setRemoteDescription({ type: 'offer', sdp })
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)
      for (const candidate of pendingCandidates.splice(0)) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch((error) => {
          this.log('addIceCandidate failed', error)
        })
      }
      socket.emit('answer-description', answer.sdp)
    }
    socket.once('offer-description', onOfferDescription)

    const cleanup = () => {
      socket.off('offer-candidate', onOfferCandidate)
      socket.off('offer-description', onOfferDescription)
    }

    try {
      const channel = await channelPromise
      cleanup()
      return { peerConnection, channel }
    } catch (error) {
      cleanup()
      peerConnection.close()
      throw error
    }
  }

  /**
   * Full pairing: wait for the wallet to link, then answer its offer.
   * Both phases run concurrently so an early offer is never missed.
   */
  async pair(requestId: string, timeoutMs: number): Promise<LiquidPeerSession> {
    const linked = this.link(requestId)
    const answered = this.answer(requestId)
    const [link, peer] = await withTimeout(
      Promise.all([linked, answered]),
      timeoutMs,
      'Biatec Wallet to connect'
    )
    const session: LiquidPeerSession = {
      wallet: link.wallet,
      peerConnection: peer.peerConnection,
      channel: peer.channel
    }
    if (link.credId) session.credId = link.credId
    return session
  }

  close(): void {
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }
  }
}
