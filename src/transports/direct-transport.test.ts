import algosdk from 'algosdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestHarness } from '@txnlab/use-wallet/testing'
import type { State } from '@txnlab/use-wallet/testing'
import { ScopeType, SignDataError, byteArrayToBase64 } from '@txnlab/use-wallet/adapter'
import { BiatecWalletAdapter, WALLET_ID, type BiatecWalletOptions } from '../adapter'
import { DirectNetworkMismatchError, PopupBlockedError } from '../errors'
import {
  LiquidProviderError,
  LiquidReference,
  fromBase64Url,
  toBase64Url,
  type LiquidRequestMessage
} from '../liquid/protocol'
import { DirectTransport, POPUP_POLL_INTERVAL_MS, resolveWalletUrl } from './direct-transport'
import { decodeGenesisHash, genesisHashesEqual } from './direct-validation'

// ---------- Fake browser ---------------------------------------------------- //

const WALLET_ORIGIN = 'https://wallet.biatec.io'
const DAPP_ORIGIN = 'https://dapp.example'
const GENESIS_HASH = 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI='

class FakePopup {
  closed = false
  postMessage = vi.fn()
  close = vi.fn(() => {
    this.closed = true
  })
  focus = vi.fn()
}

interface FakeEvent {
  origin: string
  source: unknown
  data: unknown
}

class FakeWindow {
  popups: FakePopup[] = []
  listeners = new Set<(event: FakeEvent) => void>()
  blocked = false
  location = { origin: DAPP_ORIGIN }
  screenX?: number
  screenY?: number
  outerWidth?: number
  outerHeight?: number
  screen?: { availWidth?: number; availHeight?: number; availLeft?: number; availTop?: number }
  open = vi.fn((_url: string, _name: string, _features: string) => {
    if (this.blocked) return null
    const popup = new FakePopup()
    this.popups.push(popup)
    return popup
  })
  addEventListener(type: string, listener: (event: FakeEvent) => void) {
    if (type === 'message') this.listeners.add(listener)
  }
  removeEventListener(type: string, listener: (event: FakeEvent) => void) {
    if (type === 'message') this.listeners.delete(listener)
  }
  dispatch(event: FakeEvent) {
    for (const listener of [...this.listeners]) listener(event)
  }
}

let win: FakeWindow

/** The most recently opened popup. */
const popup = () => win.popups[win.popups.length - 1]

const flush = () => vi.advanceTimersByTimeAsync(0)

/** For async work backed by real I/O (WebCrypto) that fake timers cannot drive. */
const requestPosted = () => vi.waitFor(() => expect(popup().postMessage).toHaveBeenCalledTimes(1))

function fromWallet(
  data: unknown,
  {
    origin = WALLET_ORIGIN,
    source = popup() as unknown
  }: { origin?: string; source?: unknown } = {}
) {
  win.dispatch({ origin, source, data })
}

const readyMessage = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  reference: 'biatec:direct:ready',
  capabilities: { methods: ['enable', 'sign_transactions', 'sign_data'], genesisHashes: [] },
  ...overrides
})

/** The one request posted to the most recent popup so far. */
function sentRequest(): LiquidRequestMessage<any> {
  const calls = popup().postMessage.mock.calls
  expect(calls).toHaveLength(1)
  return calls[0][0]
}

function response(
  request: LiquidRequestMessage<any>,
  reference: string,
  result?: unknown,
  error?: { code: number; message: string; data?: unknown }
) {
  return {
    id: 'w-' + Math.random(),
    requestId: request.id,
    reference,
    ...(error ? { error } : { result })
  }
}

// ---------- Fixtures -------------------------------------------------------- //

const account1 = algosdk.generateAccount()
const account2 = algosdk.generateAccount()
const stranger = algosdk.generateAccount()
const ADDR1 = account1.addr.toString()
const ADDR2 = account2.addr.toString()
const STRANGER = stranger.addr.toString()

/** Chain rekey state for the tests: sender address -> auth address. */
const authAddrs: Record<string, string> = {}
/** Arguments of every `.exclude()` call made on an account lookup. */
const excluded: string[] = []
const mockAlgodClient = {
  accountInformation: (address: string) => {
    // BaseWallet calls `.do()` directly; Direct's rekey lookup goes through `.exclude('all')`.
    const query = {
      do: async () => ({ authAddr: authAddrs[address] }),
      exclude: (what: string) => (excluded.push(what), query)
    }
    return query
  }
  // Test double: only the one algod method the adapter calls is implemented.
} as unknown as algosdk.Algodv2

function createAdapter(
  {
    withWalletConnect,
    ...options
  }: Partial<BiatecWalletOptions> & { withWalletConnect?: boolean } = {},
  state?: Partial<State>
) {
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
      ...(withWalletConnect ? {} : { walletconnect: false as const }),
      liquid: false,
      onDisplayUri: () => undefined,
      ...options,
      direct: options.direct === false ? false : { providerId: 'dapp-provider', ...options.direct }
    }
  })
  return { adapter, store }
}

function makePayment(sender: string, receiver: string, amount = 1000): algosdk.Transaction {
  return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender,
    receiver,
    amount,
    suggestedParams: {
      fee: 1000,
      minFee: 1000,
      flatFee: true,
      firstValid: 1,
      lastValid: 1000,
      genesisID: 'testnet-v1.0',
      genesisHash: algosdk.base64ToBytes(GENESIS_HASH)
    }
  })
}

/**
 * What Biatec Wallet signs for ARC-0060: ed25519 over sha256(data) || sha256(authenticatorData)
 * with the account's key. Node's crypto signs raw ed25519 (algosdk's signBytes adds an "MX" tag).
 */
async function signArc60(
  account: algosdk.Account,
  item: { data: string; authenticatorData: string }
): Promise<Uint8Array> {
  const sha256 = async (bytes: Uint8Array) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
  const dataHash = await sha256(algosdk.base64ToBytes(item.data))
  const authHash = await sha256(fromBase64Url(item.authenticatorData))
  const digest = new Uint8Array([...dataHash, ...authHash])
  const { createPrivateKey, sign } = await import('node:crypto')
  const pkcs8 = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    Buffer.from(account.sk.slice(0, 32))
  ])
  const key = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
  return new Uint8Array(sign(null, digest, key))
}

/** Starts connect(), answers `ready` and returns the pending promise plus the sent request. */
async function startConnect(adapter: BiatecWalletAdapter) {
  const connecting = adapter.connect({ method: 'direct' })
  connecting.catch(() => undefined)
  fromWallet(readyMessage())
  await flush()
  return { connecting, request: sentRequest() }
}

const enableResult = (request: LiquidRequestMessage<any>, overrides = {}) => ({
  providerId: request.params.providerId,
  genesisHash: request.params.genesisHash,
  accounts: [{ address: ADDR1, name: 'Main' }, { address: ADDR2 }],
  ...overrides
})

async function connectAdapter(options: Partial<BiatecWalletOptions> = {}) {
  const ctx = createAdapter(options)
  const { connecting, request } = await startConnect(ctx.adapter)
  fromWallet(response(request, LiquidReference.enableResponse, enableResult(request)))
  const accounts = await connecting
  return { ...ctx, accounts }
}

/** Calls `run` (which opens a popup), answers ready and returns the posted request. */
async function readyAndRequest<T>(run: () => Promise<T>) {
  const promise = run()
  promise.catch(() => undefined)
  fromWallet(readyMessage())
  await flush()
  return { promise, request: sentRequest() }
}

beforeEach(() => {
  for (const key of Object.keys(authAddrs)) delete authAddrs[key]
  excluded.length = 0
  vi.useFakeTimers()
  win = new FakeWindow()
  vi.stubGlobal('window', win)
  vi.stubGlobal('location', { host: 'dapp.example', origin: DAPP_ORIGIN })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ---------- Tests ----------------------------------------------------------- //

describe('Direct transport — construction & options', () => {
  it('does not need a projectId when walletconnect is disabled', () => {
    expect(() => createAdapter()).not.toThrow()
  })

  it('does not throw without a projectId even when walletconnect is not disabled', () => {
    expect(() => createAdapter({ withWalletConnect: true })).not.toThrow()
  })

  it('throws when every connection method is disabled', () => {
    expect(() => createAdapter({ direct: false })).toThrow(/At least one connection method/)
  })

  it('exposes the pinned wallet origin', () => {
    expect(createAdapter().adapter.directWalletOrigin).toBe(WALLET_ORIGIN)
    expect(
      createAdapter({ withWalletConnect: true, projectId: 'p', direct: false }).adapter
        .directWalletOrigin
    ).toBeNull()
  })

  it('does not warn for the default wallet origin', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    createAdapter()
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns exactly once for a walletUrl override and pins that origin', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { adapter } = createAdapter({ direct: { walletUrl: 'http://localhost:8080' } })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toMatch(/non-default wallet origin/)
    expect(adapter.directWalletOrigin).toBe('http://localhost:8080')

    const connecting = adapter.connect({ method: 'direct' })
    connecting.catch(() => undefined)
    expect(win.open.mock.calls[0][0]).toBe(
      `http://localhost:8080/direct?origin=${encodeURIComponent(DAPP_ORIGIN)}`
    )
    // A message from the default origin is no longer trusted...
    fromWallet(readyMessage(), { origin: WALLET_ORIGIN })
    await flush()
    expect(popup().postMessage).not.toHaveBeenCalled()
    // ...the configured one is.
    fromWallet(readyMessage(), { origin: 'http://localhost:8080' })
    await flush()
    expect(popup().postMessage.mock.calls[0][1]).toBe('http://localhost:8080')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('validates walletUrl: https or localhost/127.0.0.1 http only', () => {
    expect(resolveWalletUrl('https://wallet.example.com/').origin).toBe(
      'https://wallet.example.com'
    )
    expect(resolveWalletUrl('http://127.0.0.1:8080').origin).toBe('http://127.0.0.1:8080')
    expect(resolveWalletUrl('http://localhost:8080').origin).toBe('http://localhost:8080')
    expect(() => resolveWalletUrl('http://wallet.example.com')).toThrow(/https/)
    expect(() => resolveWalletUrl('http://localhost.evil.com')).toThrow(/https/)
    expect(() => resolveWalletUrl('javascript:alert(1)')).toThrow()
    expect(() => resolveWalletUrl('https://user:pw@wallet.example.com')).toThrow(/credentials/)
    expect(() => resolveWalletUrl('not a url')).toThrow(/Invalid/)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(() => createAdapter({ direct: { walletUrl: 'http://evil.example' } })).toThrow(/https/)
  })

  it('rejects popupFeatures that sever the opener channel', () => {
    expect(() => createAdapter({ direct: { popupFeatures: 'popup,noopener' } })).toThrow(/noopener/)
    expect(() => createAdapter({ direct: { popupFeatures: 'NoReferrer' } })).toThrow(/noopener/)
    const { adapter } = createAdapter({ direct: { popupFeatures: 'popup,width=300' } })
    adapter.connect({ method: 'direct' }).catch(() => undefined)
    expect(win.open.mock.calls[0][2]).toBe('popup,width=300')
  })
})

/** Opens a popup with the given fake window geometry and returns the feature string. */
function popupFeaturesFor(
  geometry: Partial<FakeWindow>,
  direct: Partial<NonNullable<BiatecWalletOptions['direct']>> = {}
): string {
  Object.assign(win, geometry)
  const { adapter } = createAdapter({ direct })
  adapter.connect({ method: 'direct' }).catch(() => undefined)
  return win.open.mock.calls[0][2]
}

function parseFeatures(features: string) {
  const m = /^popup,width=(-?\d+),height=(-?\d+),left=(-?\d+),top=(-?\d+)$/.exec(features)
  if (!m) throw new Error(`unexpected features: ${features}`)
  return { width: +m[1], height: +m[2], left: +m[3], top: +m[4] }
}

describe('Direct transport - popup size and position', () => {
  it('uses the preferred 1100x860 on a big screen, centered over the opener', () => {
    const f = parseFeatures(
      popupFeaturesFor({
        screen: { availWidth: 1920, availHeight: 1080, availLeft: 0, availTop: 0 },
        screenX: 100,
        screenY: 50,
        outerWidth: 1400,
        outerHeight: 900
      })
    )
    expect(f).toEqual({ width: 1100, height: 860, left: 250, top: 70 })
  })

  it('shrinks the height (and caps width at 90%) on a small laptop screen', () => {
    const f = parseFeatures(
      popupFeaturesFor({
        screen: { availWidth: 1366, availHeight: 728 },
        screenX: 0,
        screenY: 0,
        outerWidth: 1366,
        outerHeight: 728
      })
    )
    expect(f).toEqual({ width: 1100, height: 655, left: 133, top: 37 })
  })

  it('never goes below 640x560 unless the screen itself is smaller', () => {
    const small = parseFeatures(popupFeaturesFor({ screen: { availWidth: 700, availHeight: 600 } }))
    expect(small).toMatchObject({ width: 640, height: 560 })
    expect(small.left).toBeGreaterThanOrEqual(0)
    expect(small.left + small.width).toBeLessThanOrEqual(700)
    expect(small.top + small.height).toBeLessThanOrEqual(600)
  })

  it('uses the whole screen when it is smaller than the minimum', () => {
    const f = parseFeatures(popupFeaturesFor({ screen: { availWidth: 500, availHeight: 400 } }))
    expect(f).toEqual({ width: 500, height: 400, left: 0, top: 0 })
  })

  it('keeps the popup inside a monitor left of the primary one', () => {
    const f = parseFeatures(
      popupFeaturesFor({
        screen: { availWidth: 1920, availHeight: 1040, availLeft: -1920, availTop: 0 },
        screenX: -2100,
        screenY: -30,
        outerWidth: 800,
        outerHeight: 600
      })
    )
    expect(f.left).toBe(-1920)
    expect(f.top).toBe(0)
    expect(f.left + f.width).toBeLessThanOrEqual(0)
  })

  it('keeps the popup inside a monitor right of and below the primary one', () => {
    const f = parseFeatures(
      popupFeaturesFor({
        screen: { availWidth: 1280, availHeight: 984, availLeft: 1920, availTop: 40 },
        screenX: 3100,
        screenY: 900,
        outerWidth: 600,
        outerHeight: 500
      })
    )
    expect(f.left + f.width).toBe(1920 + 1280)
    expect(f.top + f.height).toBe(40 + 984)
    expect(f.left).toBeGreaterThanOrEqual(1920)
  })

  it('falls back to 1100x860 centered on the host window without a screen object', () => {
    const f = parseFeatures(
      popupFeaturesFor({ screenX: 0, screenY: 0, outerWidth: 1500, outerHeight: 1000 })
    )
    expect(f).toEqual({ width: 1100, height: 860, left: 200, top: 70 })
  })

  it('without screen or window geometry the popup is placed at 0,0', () => {
    expect(parseFeatures(popupFeaturesFor({}))).toEqual({
      width: 1100,
      height: 860,
      left: 0,
      top: 0
    })
  })

  it('popupSize replaces the preferred size but is still screen-fit', () => {
    const f = parseFeatures(
      popupFeaturesFor(
        { screen: { availWidth: 1920, availHeight: 1080 }, outerWidth: 1920, outerHeight: 1080 },
        { popupSize: { width: 800, height: 600 } }
      )
    )
    expect(f).toEqual({ width: 800, height: 600, left: 560, top: 240 })
  })

  it('popupSize larger than the screen is shrunk to 90%', () => {
    const big = parseFeatures(
      popupFeaturesFor(
        { screen: { availWidth: 1000, availHeight: 800 } },
        { popupSize: { width: 4000, height: 4000 } }
      )
    )
    expect(big).toMatchObject({ width: 900, height: 720 })
  })

  it('validates popupSize', () => {
    for (const popupSize of [
      { width: 319, height: 600 },
      { width: 600, height: 4001 },
      { width: 600.5, height: 600 },
      { width: Number.NaN, height: 600 },
      { width: 600, height: Infinity }
    ]) {
      expect(() => createAdapter({ direct: { popupSize } })).toThrow(/popupSize/)
    }
    expect(() =>
      createAdapter({ direct: { popupSize: { width: 320, height: 4000 } } })
    ).not.toThrow()
  })

  it('popupFeatures still wins over popupSize', () => {
    expect(
      popupFeaturesFor(
        {},
        { popupFeatures: 'popup,width=300', popupSize: { width: 800, height: 600 } }
      )
    ).toBe('popup,width=300')
  })
})

describe('Direct transport — connect', () => {
  it('opens the popup synchronously with the origin hint and stores the approved accounts', async () => {
    const { adapter } = createAdapter()
    const connecting = adapter.connect({ method: 'direct' })
    // Same tick, no await yet: window.open must already have been called (user-gesture rule).
    expect(win.open).toHaveBeenCalledTimes(1)
    const [url, name, features] = win.open.mock.calls[0]
    expect(url).toBe(`${WALLET_ORIGIN}/direct?origin=${encodeURIComponent(DAPP_ORIGIN)}`)
    expect(name).toMatch(/^biatec-wallet-direct-[0-9a-f-]{36}$/)
    expect(features).toMatch(/^popup,width=1100,height=860,left=\d+,top=\d+$/)

    fromWallet(readyMessage())
    await flush()
    const request = sentRequest()
    expect(popup().postMessage.mock.calls[0][1]).toBe(WALLET_ORIGIN)
    expect(request.reference).toBe('arc0027:enable:request')
    expect(request.id).toMatch(/[0-9a-f-]{36}/)
    expect(request.params.providerId).toBe('dapp-provider')
    expect(request.params.genesisHash).toBe(GENESIS_HASH)
    expect(Object.keys(request.params.metadata).sort()).toEqual([
      'description',
      'icons',
      'name',
      'url'
    ])

    fromWallet(response(request, LiquidReference.enableResponse, enableResult(request)))
    const accounts = await connecting

    expect(accounts.map((a) => a.address)).toEqual([ADDR1, ADDR2])
    expect(accounts[0].name).toBe('Main')
    expect(accounts[1].name).toBe('Biatec Wallet Account 2')
    expect(accounts[0].metadata).toEqual({
      method: 'direct',
      walletOrigin: WALLET_ORIGIN,
      genesisHash: GENESIS_HASH
    })
    expect(adapter.isConnected).toBe(true)
    expect(adapter.activeAddress).toBe(ADDR1)
    // Everything is cleaned up once settled.
    expect(win.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('only ever posts with the wallet origin as targetOrigin, never "*"', async () => {
    const { adapter } = await connectAdapter()
    const { promise } = await readyAndRequest(() =>
      adapter.signTransactions([makePayment(ADDR1, STRANGER)])
    )
    void promise
    for (const p of win.popups) {
      for (const call of p.postMessage.mock.calls) expect(call[1]).toBe(WALLET_ORIGIN)
    }
    expect(win.popups).toHaveLength(2)
  })

  it('ignores a ready message from the wrong origin', async () => {
    const { adapter } = createAdapter()
    const connecting = adapter.connect({ method: 'direct' })
    connecting.catch(() => undefined)
    fromWallet(readyMessage(), { origin: 'https://evil.example' })
    fromWallet(readyMessage(), { origin: 'https://wallet.biatec.io.evil.example' })
    fromWallet(readyMessage(), { origin: 'http://wallet.biatec.io' })
    await flush()
    expect(popup().postMessage).not.toHaveBeenCalled()
    // The real one still works afterwards.
    fromWallet(readyMessage())
    await flush()
    expect(popup().postMessage).toHaveBeenCalledTimes(1)
  })

  it('ignores a ready message from the right origin but the wrong source window', async () => {
    const { adapter } = createAdapter()
    const connecting = adapter.connect({ method: 'direct' })
    connecting.catch(() => undefined)
    fromWallet(readyMessage(), { source: new FakePopup() })
    fromWallet(readyMessage(), { source: win })
    fromWallet(readyMessage(), { source: null })
    await flush()
    expect(popup().postMessage).not.toHaveBeenCalled()
  })

  it('ignores responses from the wrong origin or source, then accepts the genuine one', async () => {
    const { adapter } = createAdapter()
    const { connecting, request } = await startConnect(adapter)
    const good = response(request, LiquidReference.enableResponse, enableResult(request))
    fromWallet(good, { origin: 'https://evil.example' })
    fromWallet(good, { source: new FakePopup() })
    fromWallet(good, { source: null })
    await flush()
    expect(adapter.isConnected).toBe(false)
    fromWallet(good)
    await expect(connecting).resolves.toHaveLength(2)
  })

  it('ignores a response whose requestId does not match, and keeps waiting', async () => {
    const { adapter } = createAdapter()
    const { connecting, request } = await startConnect(adapter)
    fromWallet({
      ...response(request, LiquidReference.enableResponse, enableResult(request)),
      requestId: 'some-other-request'
    })
    fromWallet({ reference: LiquidReference.enableResponse, result: {} }) // no requestId at all
    fromWallet('a string')
    fromWallet(null)
    fromWallet(readyMessage()) // a repeated ready is not a response either
    await flush()
    expect(adapter.isConnected).toBe(false)
    fromWallet(response(request, LiquidReference.enableResponse, enableResult(request)))
    await expect(connecting).resolves.toHaveLength(2)
  })

  it('does not compare the response providerId with the dApp one (it identifies the wallet)', async () => {
    const { adapter } = createAdapter()
    const { connecting, request } = await startConnect(adapter)
    fromWallet(
      response(
        request,
        LiquidReference.enableResponse,
        enableResult(request, { providerId: 'wallet-own-provider-id' })
      )
    )
    await expect(connecting).resolves.toHaveLength(2)
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a string', 5],
    ['too long', 'p'.repeat(129)]
  ])('rejects a response whose providerId is %s', async (_name, providerId) => {
    const { adapter } = createAdapter()
    const { connecting, request } = await startConnect(adapter)
    fromWallet(
      response(request, LiquidReference.enableResponse, enableResult(request, { providerId }))
    )
    const error = await connecting.catch((e) => e)
    expect(error).toBeInstanceOf(LiquidProviderError)
    expect(error.code).toBe(4200)
    expect(error.message).toMatch(/providerId/)
    expect(adapter.isConnected).toBe(false)
  })

  describe('malformed payloads are rejected, never thrown from the handler', () => {
    const badReady: [string, unknown][] = [
      ['undefined', undefined],
      ['a string', 'ready'],
      ['an array', []],
      ['wrong reference', readyMessage({ reference: 'biatec:direct:nope' })],
      ['missing version', readyMessage({ v: undefined })],
      ['string version', readyMessage({ v: '1' })],
      ['missing capabilities', readyMessage({ capabilities: undefined })],
      ['non-array methods', readyMessage({ capabilities: { methods: 'x', genesisHashes: [] } })],
      [
        'non-string genesisHashes',
        readyMessage({ capabilities: { methods: [], genesisHashes: [1] } })
      ],
      [
        'oversized capability list',
        readyMessage({ capabilities: { methods: Array(100).fill('m'), genesisHashes: [] } })
      ]
    ]
    it.each(badReady)('ready: %s', async (_name, data) => {
      const { adapter } = createAdapter()
      const connecting = adapter.connect({ method: 'direct' })
      connecting.catch(() => undefined)
      expect(() => fromWallet(data)).not.toThrow()
      const error = await connecting.catch((e) => e)
      expect(error).toBeInstanceOf(LiquidProviderError)
      expect(error.code).toBe(4200)
      expect(popup().postMessage).not.toHaveBeenCalled()
      expect(popup().close).toHaveBeenCalled()
      expect(win.listeners.size).toBe(0)
    })

    it('rejects an unsupported protocol version with 4003', async () => {
      const { adapter } = createAdapter()
      const connecting = adapter.connect({ method: 'direct' })
      connecting.catch(() => undefined)
      fromWallet(readyMessage({ v: 2 }))
      const error = await connecting.catch((e) => e)
      expect(error.code).toBe(4003)
    })

    const badEnable: [string, (r: LiquidRequestMessage<any>) => Record<string, unknown>][] = [
      ['accounts missing', (r) => enableResult(r, { accounts: undefined })],
      ['accounts empty', (r) => enableResult(r, { accounts: [] })],
      ['accounts not an array', (r) => enableResult(r, { accounts: 'AAAA' })],
      [
        'too many accounts',
        (r) => enableResult(r, { accounts: Array(101).fill({ address: ADDR1 }) })
      ],
      ['account not an object', (r) => enableResult(r, { accounts: ['x'] })],
      ['address missing', (r) => enableResult(r, { accounts: [{ name: 'x' }] })],
      ['address not a string', (r) => enableResult(r, { accounts: [{ address: 5 }] })],
      ['address invalid', (r) => enableResult(r, { accounts: [{ address: 'NOTANADDRESS' }] })],
      [
        'address checksum broken',
        (r) =>
          enableResult(r, {
            accounts: [
              { address: ADDR1.slice(0, 10) + (ADDR1[10] === 'A' ? 'B' : 'A') + ADDR1.slice(11) }
            ]
          })
      ],
      [
        'one bad among good',
        (r) => enableResult(r, { accounts: [{ address: ADDR1 }, { address: 'x' }] })
      ],
      ['name not a string', (r) => enableResult(r, { accounts: [{ address: ADDR1, name: {} }] })],
      [
        'name too long',
        (r) => enableResult(r, { accounts: [{ address: ADDR1, name: 'n'.repeat(500) }] })
      ],
      ['result is not an object', () => 'accounts' as unknown as Record<string, unknown>]
    ]
    it.each(badEnable)('enable result: %s', async (_name, build) => {
      const { adapter } = createAdapter()
      const { connecting, request } = await startConnect(adapter)
      fromWallet({
        id: 'w',
        requestId: request.id,
        reference: LiquidReference.enableResponse,
        result: build(request)
      })
      const error = await connecting.catch((e) => e)
      expect(error).toBeInstanceOf(LiquidProviderError)
      expect(error.code).toBe(4200)
      expect(adapter.isConnected).toBe(false)
      expect(popup().close).toHaveBeenCalled()
    })

    const badEnvelopes: [string, (r: LiquidRequestMessage<any>) => Record<string, unknown>][] = [
      [
        'wrong response reference',
        (r) => ({ ...response(r, 'arc0027:sign_transactions:response', enableResult(r)) })
      ],
      [
        'both result and error',
        (r) => ({
          ...response(r, LiquidReference.enableResponse, enableResult(r)),
          error: { code: 4001, message: 'x' }
        })
      ],
      [
        'neither result nor error',
        (r) => ({ id: 'w', requestId: r.id, reference: LiquidReference.enableResponse })
      ],
      [
        'error without a numeric code',
        (r) => ({
          id: 'w',
          requestId: r.id,
          reference: LiquidReference.enableResponse,
          error: { code: '4001', message: 'x' }
        })
      ],
      [
        'error without a message',
        (r) => ({
          id: 'w',
          requestId: r.id,
          reference: LiquidReference.enableResponse,
          error: { code: 4001 }
        })
      ],
      [
        'error that is a string',
        (r) => ({
          id: 'w',
          requestId: r.id,
          reference: LiquidReference.enableResponse,
          error: 'nope'
        })
      ]
    ]
    it.each(badEnvelopes)('envelope: %s', async (_name, build) => {
      const { adapter } = createAdapter()
      const { connecting, request } = await startConnect(adapter)
      expect(() => fromWallet(build(request))).not.toThrow()
      const error = await connecting.catch((e) => e)
      expect(error).toBeInstanceOf(LiquidProviderError)
      expect(error.code).toBe(4200)
    })

    it('never throws out of the message handler for hostile payloads', async () => {
      const { adapter } = createAdapter()
      const { connecting, request } = await startConnect(adapter)
      const hostile = {
        requestId: request.id,
        get reference(): string {
          throw new Error('getter bomb')
        }
      }
      expect(() => fromWallet(hostile)).not.toThrow()
      await expect(connecting).rejects.toThrow('getter bomb')
    })
  })

  it('surfaces a wallet rejection with its error code', async () => {
    const { adapter } = createAdapter()
    const { connecting, request } = await startConnect(adapter)
    fromWallet(
      response(request, LiquidReference.enableResponse, undefined, {
        code: 4001,
        message: 'User rejected'
      })
    )
    const error = await connecting.catch((e) => e)
    expect(error).toBeInstanceOf(LiquidProviderError)
    expect(error.code).toBe(4001)
    expect(error.message).toBe('User rejected')
    expect(adapter.isConnected).toBe(false)
  })

  it('maps 4004 from the wallet to a DirectNetworkMismatchError carrying the genesis hash', async () => {
    const { adapter } = createAdapter()
    const { connecting, request } = await startConnect(adapter)
    fromWallet(
      response(request, LiquidReference.enableResponse, undefined, {
        code: 4004,
        message: 'wrong network',
        data: { genesisHashes: ['wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=', 'not-a-hash', 42] }
      })
    )
    const error = await connecting.catch((e) => e)
    expect(error).toBeInstanceOf(DirectNetworkMismatchError)
    expect(error.code).toBe(4004)
    expect(error.genesisHash).toBe(GENESIS_HASH)
    expect(error.walletGenesisHashes).toEqual(['wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=']) // invalid entries dropped
  })

  it('ignores ready capabilities.genesisHashes (reserved): the request is sent on any network', async () => {
    const { adapter } = createAdapter()
    const connecting = adapter.connect({ method: 'direct' })
    connecting.catch(() => undefined)
    fromWallet(
      readyMessage({
        capabilities: {
          methods: [],
          genesisHashes: ['wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=']
        }
      })
    )
    await flush()
    expect(popup().postMessage).toHaveBeenCalled()
  })

  it('uses a legacy-wallet 4004 message that does not tell the user to switch network', async () => {
    const { adapter } = createAdapter()
    const { connecting, request } = await startConnect(adapter)
    fromWallet(
      response(request, LiquidReference.enableResponse, undefined, { code: 4004, message: 'x' })
    )
    const error = await connecting.catch((e) => e)
    expect(error).toBeInstanceOf(DirectNetworkMismatchError)
    expect(error.message).toBe(
      'This version of Biatec Wallet cannot sign on this network. Reload the wallet page to update it, or use another connection method.'
    )
    expect(error.message).not.toMatch(/Switch network|genesis hash/i)
  })

  it('rejects an enable result for a different network with a mismatch error', async () => {
    const { adapter } = createAdapter()
    const { connecting, request } = await startConnect(adapter)
    fromWallet(
      response(
        request,
        LiquidReference.enableResponse,
        enableResult(request, { genesisHash: 'other' })
      )
    )
    await expect(connecting).rejects.toBeInstanceOf(DirectNetworkMismatchError)
  })

  it('de-duplicates repeated account addresses', async () => {
    const { adapter } = createAdapter()
    const { connecting, request } = await startConnect(adapter)
    fromWallet(
      response(
        request,
        LiquidReference.enableResponse,
        enableResult(request, { accounts: [{ address: ADDR1 }, { address: ADDR1 }] })
      )
    )
    expect(await connecting).toHaveLength(1)
  })

  describe('popup lifecycle', () => {
    it('rejects with PopupBlockedError when window.open returns null, leaving nothing behind', async () => {
      const { adapter } = createAdapter()
      win.blocked = true
      const error = await adapter.connect({ method: 'direct' }).catch((e) => e)
      expect(error).toBeInstanceOf(PopupBlockedError)
      expect(error.name).toBe('PopupBlockedError')
      expect(win.listeners.size).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
      // The user can simply try again once popups are allowed.
      win.blocked = false
      const retry = adapter.connect({ method: 'direct' })
      retry.catch(() => undefined)
      expect(win.popups).toHaveLength(1)
    })

    it('rejects with 4001 when the popup is closed before ready', async () => {
      const { adapter } = createAdapter()
      const connecting = adapter.connect({ method: 'direct' })
      connecting.catch(() => undefined)
      popup().closed = true
      await vi.advanceTimersByTimeAsync(POPUP_POLL_INTERVAL_MS * 3)
      const error = await connecting.catch((e) => e)
      expect(error).toBeInstanceOf(LiquidProviderError)
      expect(error.code).toBe(4001)
      expect(error.message).toMatch(/closed/)
      expect(win.listeners.size).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('rejects with 4001 when the popup is closed mid-request', async () => {
      const { adapter } = createAdapter()
      const { connecting } = await startConnect(adapter)
      popup().closed = true
      await vi.advanceTimersByTimeAsync(POPUP_POLL_INTERVAL_MS * 3)
      const error = await connecting.catch((e) => e)
      expect(error.code).toBe(4001)
      expect(adapter.isConnected).toBe(false)
    })

    it('still accepts a response that was posted just before the wallet closed itself', async () => {
      const { adapter } = createAdapter()
      const { connecting, request } = await startConnect(adapter)
      fromWallet(response(request, LiquidReference.enableResponse, enableResult(request)))
      popup().closed = true
      await vi.advanceTimersByTimeAsync(POPUP_POLL_INTERVAL_MS * 3)
      await expect(connecting).resolves.toHaveLength(2)
    })

    it('does not poll after settling (a closed popup no longer matters)', async () => {
      await connectAdapter()
      popup().closed = true
      await vi.advanceTimersByTimeAsync(POPUP_POLL_INTERVAL_MS * 5)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('rejects with 4002 and closes the popup when ready never arrives (default 5 min)', async () => {
      const { adapter } = createAdapter()
      const connecting = adapter.connect({ method: 'direct' })
      connecting.catch(() => undefined)
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1)
      expect(popup().close).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(2)
      const error = await connecting.catch((e) => e)
      expect(error.code).toBe(4002)
      expect(error.message).toMatch(/popup blocked or wallet origin unreachable/)
      expect(popup().close).toHaveBeenCalled()
    })

    it('rejects with 4002 when the wallet is ready but the user never answers', async () => {
      const { adapter } = createAdapter({ direct: { connectTimeoutMs: 10_000 } })
      const { connecting } = await startConnect(adapter)
      await vi.advanceTimersByTimeAsync(10_001)
      const error = await connecting.catch((e) => e)
      expect(error.code).toBe(4002)
      expect(popup().close).toHaveBeenCalled()
      expect(win.listeners.size).toBe(0)
    })

    it('ignores every message after the request settled', async () => {
      const { adapter } = createAdapter()
      const { connecting, request } = await startConnect(adapter)
      const good = response(request, LiquidReference.enableResponse, enableResult(request))
      fromWallet(good)
      await connecting
      expect(win.listeners.size).toBe(0)
      // Even a listener that was somehow invoked late would do nothing.
      expect(() => fromWallet(good)).not.toThrow()
      expect(() => fromWallet(readyMessage())).not.toThrow()
      expect(popup().postMessage).toHaveBeenCalledTimes(1)
    })

    it('refuses a second request while one popup is in flight', async () => {
      const { adapter } = createAdapter()
      const connecting = adapter.connect({ method: 'direct' })
      connecting.catch(() => undefined)
      const second = await adapter.connect({ method: 'direct' }).catch((e) => e)
      expect(second).toBeInstanceOf(LiquidProviderError)
      expect(second.message).toMatch(/already in progress/)
      expect(win.open).toHaveBeenCalledTimes(1)
    })

    it('refuses to run on a page with an opaque origin', async () => {
      win.location.origin = 'null'
      const { adapter } = createAdapter()
      const error = await adapter.connect({ method: 'direct' }).catch((e) => e)
      expect(error.message).toMatch(/opaque origin/)
      expect(win.open).not.toHaveBeenCalled()
    })

    it('rejects immediately when the signal is already aborted, without opening a popup', async () => {
      const transport = newBareTransport()
      const controller = new AbortController()
      controller.abort()
      await expect(transport.connect({ signal: controller.signal })).rejects.toThrow(/cancelled/)
      expect(win.open).not.toHaveBeenCalled()
    })

    it('closes the popup and rejects when the abort signal fires', async () => {
      const transport = newBareTransport()
      const controller = new AbortController()
      const connecting = transport.connect({ signal: controller.signal })
      connecting.catch(() => undefined)
      controller.abort()
      await expect(connecting).rejects.toThrow(/cancelled/)
      expect(popup().close).toHaveBeenCalled()
      expect(win.listeners.size).toBe(0)
    })

    it('cancelPending() closes the popup of an in-flight request', async () => {
      const transport = newBareTransport()
      const connecting = transport.connect()
      connecting.catch(() => undefined)
      expect(transport.isBusy).toBe(true)
      transport.cancelPending()
      await expect(connecting).rejects.toThrow(/cancelled/)
      expect(popup().close).toHaveBeenCalled()
      expect(transport.isBusy).toBe(false)
    })

    it('focusPopup() focuses the live popup and is harmless otherwise', () => {
      const transport = newBareTransport()
      expect(() => transport.focusPopup()).not.toThrow()
      transport.connect().catch(() => undefined)
      transport.focusPopup()
      expect(popup().focus).toHaveBeenCalledTimes(1)
    })

    it('reports a failure to post the request to the wallet as 4300', async () => {
      const { adapter } = createAdapter()
      const connecting = adapter.connect({ method: 'direct' })
      connecting.catch(() => undefined)
      popup().postMessage.mockImplementation(() => {
        throw new Error('DataCloneError')
      })
      fromWallet(readyMessage())
      const error = await connecting.catch((e) => e)
      expect(error.code).toBe(4300)
    })
  })

  describe('disconnect & resume', () => {
    it('disconnect() rejects the pending request, closes the popup and clears the store', async () => {
      const { adapter } = await connectAdapter()
      const { promise } = await readyAndRequest(() =>
        adapter.signTransactions([makePayment(ADDR1, STRANGER)])
      )
      await adapter.disconnect()
      await expect(promise).rejects.toThrow(/cancelled|Session closed/i)
      expect(popup().close).toHaveBeenCalled()
      expect(adapter.isConnected).toBe(false)
      expect(win.listeners.size).toBe(0)
    })

    it('resumeSession keeps a direct session whose wallet origin matches, without any popup', async () => {
      const account = {
        name: 'a',
        address: ADDR1,
        metadata: { method: 'direct', walletOrigin: WALLET_ORIGIN, genesisHash: GENESIS_HASH }
      }
      const { adapter } = createAdapter(
        {},
        { wallets: { [WALLET_ID]: { accounts: [account], activeAccount: account } } }
      )
      await adapter.resumeSession()
      expect(adapter.isConnected).toBe(true)
      expect(win.open).not.toHaveBeenCalled()
    })

    it('resumeSession drops a session that was created against a different wallet origin', async () => {
      const account = {
        name: 'a',
        address: ADDR1,
        metadata: { method: 'direct', walletOrigin: 'https://evil.example', genesisHash: 'x' }
      }
      const { adapter } = createAdapter(
        {},
        { wallets: { [WALLET_ID]: { accounts: [account], activeAccount: account } } }
      )
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      await adapter.resumeSession()
      expect(adapter.isConnected).toBe(false)
    })

    it('resumeSession drops a direct session when the direct method is disabled', async () => {
      const account = {
        name: 'a',
        address: ADDR1,
        metadata: { method: 'direct', walletOrigin: WALLET_ORIGIN, genesisHash: 'x' }
      }
      const { adapter } = createAdapter(
        { direct: false, withWalletConnect: true, projectId: 'p' },
        { wallets: { [WALLET_ID]: { accounts: [account], activeAccount: account } } }
      )
      await adapter.resumeSession()
      expect(adapter.isConnected).toBe(false)
    })
  })
})

describe('Direct transport — signTransactions', () => {
  it('opens the popup synchronously and sends sign_transactions with signers: [] where needed', async () => {
    const { adapter } = await connectAdapter()
    const own = makePayment(ADDR1, STRANGER)
    const foreign = makePayment(STRANGER, ADDR1)
    const unselected = makePayment(ADDR1, ADDR2, 7)
    const preSigned = makePayment(ADDR2, ADDR1, 9)
    algosdk.assignGroupID([own, foreign, unselected, preSigned])
    const preSignedBytes = preSigned.signTxn(account2.sk)
    const signing = adapter.signTransactions(
      [own.toByte(), foreign.toByte(), unselected.toByte(), preSignedBytes],
      [0, 1, 3]
    )
    signing.catch(() => undefined)
    expect(win.open).toHaveBeenCalledTimes(2) // connect + this call, same tick
    fromWallet(readyMessage())
    await flush()
    const request = sentRequest()

    expect(request.reference).toBe('arc0027:sign_transactions:request')
    expect(request.params).toEqual({
      providerId: 'dapp-provider',
      genesisHash: GENESIS_HASH,
      txns: [
        { txn: toBase64Url(own.toByte()) },
        { txn: toBase64Url(foreign.toByte()), signers: [] },
        { txn: toBase64Url(unselected.toByte()), signers: [] },
        { txn: toBase64Url(preSigned.toByte()), signers: [] }
      ]
    })

    const signedOwn = own.signTxn(account1.sk)
    fromWallet(
      response(request, LiquidReference.signTransactionsResponse, {
        providerId: 'dapp-provider',
        stxns: [toBase64Url(signedOwn), null, null, null]
      })
    )
    expect(await signing).toEqual([signedOwn, null, null, null])
    expect(win.listeners.size).toBe(0)
  })

  it('does not open a popup when nothing in the group is for the connected accounts', async () => {
    const { adapter } = await connectAdapter()
    win.open.mockClear()
    const result = await adapter.signTransactions([makePayment(STRANGER, ADDR1)])
    expect(result).toEqual([null])
    expect(win.open).not.toHaveBeenCalled()
  })

  it('attaches a raw 64-byte signature returned by reference wallets', async () => {
    const { adapter } = await connectAdapter()
    const txn = makePayment(ADDR1, STRANGER)
    const signed = txn.signTxn(account1.sk)
    const rawSig = algosdk.decodeSignedTransaction(signed).sig!
    const { promise, request } = await readyAndRequest(() => adapter.signTransactions([txn]))
    fromWallet(
      response(request, LiquidReference.signTransactionsResponse, {
        providerId: 'dapp-provider',
        stxns: [toBase64Url(rawSig)]
      })
    )
    const [result] = await promise
    expect(algosdk.decodeSignedTransaction(result!).sig).toEqual(rawSig)
    expect(algosdk.decodeSignedTransaction(result!).txn.txID()).toBe(txn.txID())
  })

  it('rejects a signed transaction that is not the one that was sent (tampered)', async () => {
    const { adapter } = await connectAdapter()
    const txn = makePayment(ADDR1, STRANGER, 1000)
    const tampered = makePayment(ADDR1, STRANGER, 999_999_000).signTxn(account1.sk)
    const { promise, request } = await readyAndRequest(() => adapter.signTransactions([txn]))
    fromWallet(
      response(request, LiquidReference.signTransactionsResponse, {
        providerId: 'dapp-provider',
        stxns: [toBase64Url(tampered)]
      })
    )
    const error = await promise.catch((e) => e)
    expect(error).toBeInstanceOf(LiquidProviderError)
    expect(error.code).toBe(4200)
    expect(error.message).toMatch(/does not match/)
  })

  it('rejects a tampered receiver even when the amount and sender are unchanged', async () => {
    const { adapter } = await connectAdapter()
    const txn = makePayment(ADDR1, STRANGER)
    const tampered = makePayment(ADDR1, ADDR2).signTxn(account1.sk)
    const { promise, request } = await readyAndRequest(() => adapter.signTransactions([txn]))
    fromWallet(
      response(request, LiquidReference.signTransactionsResponse, {
        providerId: 'dapp-provider',
        stxns: [toBase64Url(tampered)]
      })
    )
    await expect(promise).rejects.toThrow(/does not match/)
  })

  it('rejects a "signed" transaction that carries no signature', async () => {
    const { adapter } = await connectAdapter()
    const txn = makePayment(ADDR1, STRANGER)
    const unsigned = algosdk.encodeMsgpack(new algosdk.SignedTransaction({ txn }))
    const { promise, request } = await readyAndRequest(() => adapter.signTransactions([txn]))
    fromWallet(
      response(request, LiquidReference.signTransactionsResponse, {
        providerId: 'dapp-provider',
        stxns: [toBase64Url(unsigned)]
      })
    )
    await expect(promise).rejects.toThrow(/no signature/)
  })

  const badSignResults: [string, (txnLen: number) => unknown][] = [
    ['result is not an object', () => 'stxns'],
    ['stxns missing', () => ({ providerId: 'dapp-provider' })],
    ['stxns too short', () => ({ providerId: 'dapp-provider', stxns: [] })],
    ['stxns too long', () => ({ providerId: 'dapp-provider', stxns: [null, null] })],
    ['entry is a number', () => ({ providerId: 'dapp-provider', stxns: [5] })],
    ['entry is empty', () => ({ providerId: 'dapp-provider', stxns: [''] })],
    ['entry is not base64', () => ({ providerId: 'dapp-provider', stxns: ['!!!not base64!!!'] })],
    [
      'entry is base64 of garbage',
      () => ({ providerId: 'dapp-provider', stxns: [toBase64Url(new Uint8Array([1, 2, 3, 4, 5]))] })
    ],
    ['entry is gigantic', () => ({ providerId: 'dapp-provider', stxns: ['A'.repeat(200_000)] })],
    ['empty providerId', () => ({ providerId: '', stxns: [null] })]
  ]
  it.each(badSignResults)('rejects a malformed result: %s', async (_name, build) => {
    const { adapter } = await connectAdapter()
    const { promise, request } = await readyAndRequest(() =>
      adapter.signTransactions([makePayment(ADDR1, STRANGER)])
    )
    fromWallet({
      id: 'w',
      requestId: request.id,
      reference: LiquidReference.signTransactionsResponse,
      result: build(1)
    })
    const error = await promise.catch((e) => e)
    expect(error).toBeInstanceOf(LiquidProviderError)
    expect(error.code).toBe(4200)
  })

  it('rejects with 4001 when the wallet returns null for a position it was asked to sign', async () => {
    const { adapter } = await connectAdapter()
    const own = makePayment(ADDR1, STRANGER)
    const foreign = makePayment(STRANGER, ADDR1)
    const { promise, request } = await readyAndRequest(() =>
      adapter.signTransactions([own, foreign])
    )
    fromWallet(
      response(request, LiquidReference.signTransactionsResponse, {
        providerId: 'w',
        stxns: [null, null]
      })
    )
    const error = await promise.catch((e) => e)
    expect(error).toBeInstanceOf(LiquidProviderError)
    expect(error.code).toBe(4001)
    expect(error.message).toMatch(/did not sign the transaction at position 0/)
    expect(popup().close).toHaveBeenCalled()
  })

  it('returns null for a position the wallet answered although it was not asked to sign it', async () => {
    const { adapter } = await connectAdapter()
    const own = makePayment(ADDR1, STRANGER)
    const foreign = makePayment(STRANGER, ADDR1)
    const { promise, request } = await readyAndRequest(() =>
      adapter.signTransactions([own, foreign])
    )
    fromWallet(
      response(request, LiquidReference.signTransactionsResponse, {
        providerId: 'dapp-provider',
        stxns: [toBase64Url(own.signTxn(account1.sk)), toBase64Url(new Uint8Array([1, 2, 3]))]
      })
    )
    const result = await promise
    expect(result[1]).toBeNull()
  })

  it('maps 4001 (user rejected), 4100 (not connected) and 4004 (network) errors', async () => {
    const { adapter } = await connectAdapter()
    const attempt = async (code: number) => {
      const { promise, request } = await readyAndRequest(() =>
        adapter.signTransactions([makePayment(ADDR1, STRANGER)])
      )
      fromWallet(
        response(request, LiquidReference.signTransactionsResponse, undefined, {
          code,
          message: `wallet says ${code}`
        })
      )
      return promise.catch((e) => e)
    }
    const rejected = await attempt(4001)
    expect(rejected).toBeInstanceOf(LiquidProviderError)
    expect(rejected.code).toBe(4001)

    const notConnected = await attempt(4100)
    expect(notConnected).toBeInstanceOf(LiquidProviderError)
    expect(notConnected.code).toBe(4100)
    expect(notConnected.message).toMatch(/not connected in Biatec Wallet/)

    const network = await attempt(4004)
    expect(network).toBeInstanceOf(DirectNetworkMismatchError)
    expect(network.genesisHash).toBe(GENESIS_HASH)
  })

  it('ignores a response with a mismatched requestId and times out with 4002', async () => {
    const { adapter } = await connectAdapter({ direct: { requestTimeoutMs: 20_000 } })
    const { promise, request } = await readyAndRequest(() =>
      adapter.signTransactions([makePayment(ADDR1, STRANGER)])
    )
    fromWallet({
      ...response(request, LiquidReference.signTransactionsResponse, {
        providerId: 'dapp-provider',
        stxns: [null]
      }),
      requestId: 'other'
    })
    await vi.advanceTimersByTimeAsync(20_001)
    const error = await promise.catch((e) => e)
    expect(error.code).toBe(4002)
    expect(popup().close).toHaveBeenCalled()
  })

  it('rejects with PopupBlockedError when the popup is blocked', async () => {
    const { adapter } = await connectAdapter()
    win.blocked = true
    const error = await adapter.signTransactions([makePayment(ADDR1, STRANGER)]).catch((e) => e)
    expect(error).toBeInstanceOf(PopupBlockedError)
  })

  it('rejects with 4001 when the popup is closed while signing', async () => {
    const { adapter } = await connectAdapter()
    const { promise } = await readyAndRequest(() =>
      adapter.signTransactions([makePayment(ADDR1, STRANGER)])
    )
    popup().closed = true
    await vi.advanceTimersByTimeAsync(POPUP_POLL_INTERVAL_MS * 3)
    expect((await promise.catch((e) => e)).code).toBe(4001)
  })

  it('ignores a spoofed response from another window while signing', async () => {
    const { adapter } = await connectAdapter()
    const txn = makePayment(ADDR1, STRANGER)
    const { promise, request } = await readyAndRequest(() => adapter.signTransactions([txn]))
    const forged = response(request, LiquidReference.signTransactionsResponse, {
      providerId: 'dapp-provider',
      stxns: [toBase64Url(txn.signTxn(stranger.sk))]
    })
    fromWallet(forged, { source: new FakePopup() })
    fromWallet(forged, { origin: 'https://evil.example' })
    await flush()
    const signed = txn.signTxn(account1.sk)
    fromWallet({
      ...forged,
      result: { providerId: 'dapp-provider', stxns: [toBase64Url(signed)] }
    })
    expect(await promise).toEqual([signed])
  })
})

describe('Direct transport — unsupported transaction kinds', () => {
  const params = {
    fee: 1000,
    minFee: 1000,
    flatFee: true,
    firstValid: 1,
    lastValid: 1000,
    genesisID: 'testnet-v1.0',
    genesisHash: algosdk.base64ToBytes(GENESIS_HASH)
  }
  const program = new Uint8Array([6, 129, 1])
  const cases: [string, () => algosdk.Transaction, RegExp][] = [
    [
      'asset config',
      () =>
        algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
          sender: ADDR1,
          total: 1,
          decimals: 0,
          defaultFrozen: false,
          suggestedParams: params
        }),
      /Transaction type "acfg" is not supported by Biatec Direct/
    ],
    [
      'asset freeze',
      () =>
        algosdk.makeAssetFreezeTxnWithSuggestedParamsFromObject({
          sender: ADDR1,
          assetIndex: 1,
          freezeTarget: ADDR2,
          frozen: true,
          suggestedParams: params
        }),
      /Transaction type "afrz" is not supported/
    ],
    [
      'application creation',
      () =>
        algosdk.makeApplicationCreateTxnFromObject({
          sender: ADDR1,
          onComplete: algosdk.OnApplicationComplete.NoOpOC,
          approvalProgram: program,
          clearProgram: program,
          numLocalInts: 0,
          numLocalByteSlices: 0,
          numGlobalInts: 0,
          numGlobalByteSlices: 0,
          suggestedParams: params
        }),
      /Creating an application is not supported by Biatec Direct/
    ],
    [
      'application program update',
      () =>
        algosdk.makeApplicationUpdateTxnFromObject({
          sender: ADDR1,
          appIndex: 5,
          approvalProgram: program,
          clearProgram: program,
          suggestedParams: params
        }),
      /Updating application programs is not supported by Biatec Direct/
    ]
  ]

  for (const [name, make, message] of cases) {
    it(`rejects ${name} with 4200 before any popup opens`, async () => {
      const { adapter } = await connectAdapter()
      win.open.mockClear()
      const error = await adapter.signTransactions([make()]).catch((e) => e)
      expect(error).toBeInstanceOf(LiquidProviderError)
      expect(error.code).toBe(4200)
      expect(error.message).toMatch(message)
      expect(win.open).not.toHaveBeenCalled()
    })
  }

  it('returns nulls without a popup when nothing is to be signed, whatever the kinds', async () => {
    const { adapter } = await connectAdapter()
    win.open.mockClear()
    const foreign = algosdk.makeAssetFreezeTxnWithSuggestedParamsFromObject({
      sender: STRANGER,
      assetIndex: 1,
      freezeTarget: ADDR2,
      frozen: true,
      suggestedParams: params
    })
    expect(await adapter.signTransactions([foreign])).toEqual([null])
    expect(win.open).not.toHaveBeenCalled()
  })

  it('rejects the whole group when a signers: [] position has an unsupported kind', async () => {
    const { adapter } = await connectAdapter()
    win.open.mockClear()
    const pay = makePayment(ADDR1, STRANGER)
    const foreignFreeze = algosdk.makeAssetFreezeTxnWithSuggestedParamsFromObject({
      sender: STRANGER,
      assetIndex: 1,
      freezeTarget: ADDR2,
      frozen: true,
      suggestedParams: params
    })
    const error = await adapter.signTransactions([pay, foreignFreeze]).catch((e) => e)
    expect(error).toBeInstanceOf(LiquidProviderError)
    expect(error.code).toBe(4200)
    expect(error.message).toMatch(/Transaction type "afrz" is not supported/)
    expect(win.open).not.toHaveBeenCalled()
  })

  it('still opens the popup for a call to an existing application', async () => {
    const { adapter } = await connectAdapter()
    win.open.mockClear()
    const call = algosdk.makeApplicationNoOpTxnFromObject({
      sender: ADDR1,
      appIndex: 5,
      suggestedParams: params
    })
    const signing = adapter.signTransactions([call])
    signing.catch(() => undefined)
    expect(win.open).toHaveBeenCalledTimes(1)
  })
})

describe('Direct transport — signData (ARC-0060)', () => {
  const metadata = { scope: ScopeType.AUTH, encoding: 'base64' }
  const data = byteArrayToBase64(new TextEncoder().encode('hello'))

  it('opens the popup before awaiting anything, then returns the signature', async () => {
    const { adapter } = await connectAdapter()
    win.open.mockClear()
    const signing = adapter.signData(data, metadata)
    signing.catch(() => undefined)
    expect(win.open).toHaveBeenCalledTimes(1)
    fromWallet(readyMessage())
    await requestPosted()
    const request = sentRequest()
    expect(request.reference).toBe('arc0060:sign_data:request')
    expect(request.params.genesisHash).toBe(GENESIS_HASH)
    expect(request.params.items).toHaveLength(1)
    expect(request.params.items[0].domain).toBe('dapp.example')
    expect(request.params.items[0].scope).toBe(ScopeType.AUTH)

    const signature = await signArc60(account1, request.params.items[0])
    fromWallet(
      response(request, LiquidReference.signDataResponse, {
        providerId: 'dapp-provider',
        signatures: [toBase64Url(signature)]
      })
    )
    expect((await signing).signature).toEqual(signature)
  })

  it('rejects a data signature that does not verify (tampered) or is by another key', async () => {
    for (const tamper of ['flip', 'otherKey'] as const) {
      win.popups.length = 0
      const { adapter } = await connectAdapter()
      win.open.mockClear()
      const signing = adapter.signData(data, metadata)
      signing.catch(() => undefined)
      fromWallet(readyMessage())
      await requestPosted()
      const request = sentRequest()
      const signature = await signArc60(
        tamper === 'otherKey' ? stranger : account1,
        request.params.items[0]
      )
      if (tamper === 'flip') signature[5] ^= 1
      fromWallet(
        response(request, LiquidReference.signDataResponse, {
          providerId: 'dapp-provider',
          signatures: [toBase64Url(signature)]
        })
      )
      const error = await signing.catch((e) => e)
      expect(error).toBeInstanceOf(SignDataError)
      expect(error.code).toBe(4200)
      expect(error.message).toMatch(/invalid data signature/)
      expect(popup().close).toHaveBeenCalled()
    }
  })

  describe('rekeyed signer', () => {
    const rekeyedAccount = algosdk.generateAccount()
    const REKEYED_SIGNER = rekeyedAccount.addr.toString()

    async function signWith(
      signer: algosdk.Account | undefined,
      lookupFails = false
    ): Promise<{ result: Promise<unknown> }> {
      authAddrs[REKEYED_SIGNER] = ADDR2
      const ctx = createAdapter()
      const { connecting, request: enable } = await startConnect(ctx.adapter)
      fromWallet(
        response(
          enable,
          LiquidReference.enableResponse,
          enableResult(enable, { accounts: [{ address: REKEYED_SIGNER }] })
        )
      )
      await connecting
      if (lookupFails) {
        // Only the rekey lookup (`.exclude()`) fails; BaseWallet's own `.do()` keeps working.
        vi.spyOn(mockAlgodClient, 'accountInformation').mockImplementation(
          // Test double for the one algod call the adapter makes.
          () =>
            ({
              do: async () => ({ authAddr: undefined }),
              exclude: () => ({ do: async () => Promise.reject(new Error('algod down')) })
            }) as never
        )
      }
      win.open.mockClear()
      const signing = ctx.adapter.signData(data, metadata)
      signing.catch(() => undefined)
      fromWallet(readyMessage())
      await requestPosted()
      const request = sentRequest()
      const signature = await signArc60(signer ?? account1, request.params.items[0])
      fromWallet(
        response(request, LiquidReference.signDataResponse, {
          providerId: 'dapp-provider',
          signatures: [toBase64Url(signature)]
        })
      )
      return { result: signing }
    }

    it('accepts a signature by the auth address of a rekeyed signer', async () => {
      const { result } = await signWith(account2)
      expect(await result).toMatchObject({ signature: expect.any(Uint8Array) })
    })

    it('rejects a signature by neither the signer nor its auth address', async () => {
      const { result } = await signWith(stranger)
      const error = await result.catch((e: unknown) => e)
      expect(error).toBeInstanceOf(SignDataError)
      expect((error as SignDataError).code).toBe(4200)
      expect((error as Error).message).toMatch(/invalid data signature/)
    })

    it('reports a failing chain lookup as a network error (4300), not an invalid signature', async () => {
      const { result } = await signWith(account2, true)
      const error = await result.catch((e: unknown) => e)
      expect(error).toBeInstanceOf(SignDataError)
      expect((error as SignDataError).code).toBe(4300)
      expect((error as Error).message).toMatch(/Could not confirm the signer/)
    })

    it('does not look the chain up when the signer key itself signed', async () => {
      const { adapter } = await connectAdapter()
      const signing = adapter.signData(data, metadata)
      signing.catch(() => undefined)
      fromWallet(readyMessage())
      await requestPosted()
      const request = sentRequest()
      const signature = await signArc60(account1, request.params.items[0])
      fromWallet(
        response(request, LiquidReference.signDataResponse, {
          providerId: 'dapp-provider',
          signatures: [toBase64Url(signature)]
        })
      )
      await signing
      expect(excluded).toEqual([])
    })
  })

  const failures: [string, unknown, number][] = [
    ['null signature', { providerId: 'dapp-provider', signatures: [null] }, 4001],
    ['empty providerId', { providerId: '', signatures: [toBase64Url(new Uint8Array(64))] }, 4200],
    [
      'wrong length (63 bytes)',
      { providerId: 'w', signatures: [toBase64Url(new Uint8Array(63))] },
      4200
    ],
    ['wrong length', { providerId: 'dapp-provider', signatures: [] }, 4200],
    ['not an array', { providerId: 'dapp-provider', signatures: 'sig' }, 4200],
    ['not base64', { providerId: 'dapp-provider', signatures: ['***'] }, 4200]
  ]
  it.each(failures)('maps a bad result to SignDataError: %s', async (_name, result, code) => {
    const { adapter } = await connectAdapter()
    win.open.mockClear()
    const signing = adapter.signData(data, metadata)
    signing.catch(() => undefined)
    fromWallet(readyMessage())
    await requestPosted()
    fromWallet({
      id: 'w',
      requestId: sentRequest().id,
      reference: LiquidReference.signDataResponse,
      result
    })
    const error = await signing.catch((e) => e)
    expect(error).toBeInstanceOf(SignDataError)
    expect(error.code).toBe(code)
  })

  it.each([
    [4001, 4001],
    [4100, 4100],
    [4200, 4200],
    [4003, 4200],
    [4004, 4200],
    [4002, 4300],
    [9999, 4300]
  ])('maps wallet error %i to SignDataError %i', async (walletCode, expected) => {
    const { adapter } = await connectAdapter()
    win.open.mockClear()
    const signing = adapter.signData(data, metadata)
    signing.catch(() => undefined)
    fromWallet(readyMessage())
    await requestPosted()
    fromWallet(
      response(sentRequest(), LiquidReference.signDataResponse, undefined, {
        code: walletCode,
        message: 'no'
      })
    )
    const error = await signing.catch((e) => e)
    expect(error).toBeInstanceOf(SignDataError)
    expect(error.code).toBe(expected)
  })

  it('rejects with PopupBlockedError unchanged when the popup is blocked', async () => {
    const { adapter } = await connectAdapter()
    win.blocked = true
    const error = await adapter.signData(data, metadata).catch((e) => e)
    expect(error).toBeInstanceOf(PopupBlockedError)
    expect(error).not.toBeInstanceOf(SignDataError)
  })

  it('rejects with 4200 without opening a popup when signData is disabled', async () => {
    const { adapter } = await connectAdapter({ enableSignData: false })
    win.open.mockClear()
    const error = await adapter.signData(data, metadata).catch((e) => e)
    expect(error.code).toBe(4200)
    expect(win.open).not.toHaveBeenCalled()
  })

  it('closes the popup when building the sign-data payload fails', async () => {
    const { adapter } = await connectAdapter()
    win.open.mockClear()
    // createStdSignData needs `location`; without it the payload cannot be built, after the popup opened.
    vi.stubGlobal('location', undefined)
    const error = await adapter.signData(data, metadata).catch((e) => e)
    expect(error).toBeInstanceOf(SignDataError)
    expect(popup().close).toHaveBeenCalled()
    expect(win.listeners.size).toBe(0)
  })
})

/** A transport over a stub context, for tests that don't need the whole adapter. */
function newBareTransport(): DirectTransport {
  const noop = () => undefined
  return new DirectTransport(
    {
      logger: { debug: noop, info: noop, warn: noop, error: noop },
      store: {} as never,
      getMetadataName: () => 'Biatec Wallet',
      getAddresses: () => [ADDR1],
      getActiveNetworkConfig: () => ({
        algod: { token: '', baseServer: '' },
        genesisHash: GENESIS_HASH
      }),
      getActiveNetwork: () => 'testnet',
      createStdSignData: async () => {
        throw new Error('unused')
      },
      onDisconnect: noop
    },
    { providerId: 'dapp-provider' }
  )
}

// ---------- Contract with the real wallet (literal response shapes) ---------- //

/**
 * The shapes below are copied from what the wallet implementation (scholtz/wallet, PR #193,
 * `src/store/direct.ts`) actually sends: its own fixed provider id (never an echo of the dApp's),
 * a NORMALIZED genesis hash (base64url, no padding), full reference strings in `ready`, the
 * `wallet` brand in the enable result and a `providerId` inside error payloads.
 */
describe('Direct transport — contract with the wallet implementation', () => {
  const WALLET_PROVIDER_ID = '8f7a1c2e-5b3d-4e9f-a6c0-1d2e3f4a5b6c'
  const NORMALIZED_HASH = 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9_cOUJOiI'

  const walletReady = () => ({
    v: 1,
    reference: 'biatec:direct:ready',
    capabilities: {
      methods: [
        'arc0027:enable:request',
        'arc0027:disable:request',
        'arc0027:sign_transactions:request',
        'arc0060:sign_data:request'
      ],
      genesisHashes: []
    }
  })

  const walletResponse = (
    request: LiquidRequestMessage<any>,
    reference: string,
    body: { result?: unknown; error?: unknown }
  ) => ({ id: crypto.randomUUID(), requestId: request.id, reference, ...body })

  async function walletConnect(
    accounts: { address: string; name?: string }[] = [{ address: ADDR1 }],
    options: Partial<BiatecWalletOptions> = {}
  ) {
    const ctx = createAdapter(options)
    const connecting = ctx.adapter.connect({ method: 'direct' })
    connecting.catch(() => undefined)
    fromWallet(walletReady())
    await flush()
    const request = sentRequest()
    fromWallet(
      walletResponse(request, 'arc0027:enable:response', {
        result: {
          providerId: WALLET_PROVIDER_ID,
          genesisHash: NORMALIZED_HASH,
          accounts,
          wallet: 'Biatec Wallet'
        }
      })
    )
    return { ...ctx, accounts: await connecting, request }
  }

  it('connects: padded request hash vs the wallet normalized (unpadded base64url) hash', async () => {
    const { adapter, request, accounts } = await walletConnect()
    expect(request.params.genesisHash).toBe(GENESIS_HASH) // padded standard base64 from use-wallet
    expect(GENESIS_HASH).not.toBe(NORMALIZED_HASH)
    expect(accounts).toHaveLength(1)
    expect(accounts[0].name).toBe('Biatec Wallet Account 1') // `name` is omitted by the wallet when unset
    expect(accounts[0].metadata).toMatchObject({ method: 'direct', genesisHash: GENESIS_HASH })
    expect(adapter.isConnected).toBe(true)
  })

  it('signs transactions with the wallet literal response (own providerId, signed txn)', async () => {
    const { adapter } = await walletConnect()
    const txn = makePayment(ADDR1, STRANGER)
    const { promise, request } = await readyAndRequest(() => adapter.signTransactions([txn]))
    // (readyAndRequest posts the dApp's own ready shape; the literal wallet one is covered above)
    const signed = txn.signTxn(account1.sk)
    fromWallet(
      walletResponse(request, 'arc0027:sign_transactions:response', {
        result: { providerId: WALLET_PROVIDER_ID, stxns: [toBase64Url(signed)] }
      })
    )
    expect(await promise).toEqual([signed])
  })

  it('signs data with the wallet literal response', async () => {
    const { adapter } = await walletConnect()
    win.open.mockClear()
    const signing = adapter.signData(byteArrayToBase64(new TextEncoder().encode('hi')), {
      scope: ScopeType.AUTH,
      encoding: 'base64'
    })
    signing.catch(() => undefined)
    fromWallet(walletReady())
    await requestPosted()
    const signature = await signArc60(account1, sentRequest().params.items[0])
    fromWallet(
      walletResponse(sentRequest(), 'arc0060:sign_data:response', {
        result: { providerId: WALLET_PROVIDER_ID, signatures: [toBase64Url(signature)] }
      })
    )
    expect((await signing).signature).toEqual(signature)
  })

  it('maps the wallet literal error payload (with providerId inside the error)', async () => {
    const ctx = createAdapter()
    const connecting = ctx.adapter.connect({ method: 'direct' })
    connecting.catch(() => undefined)
    fromWallet(walletReady())
    await flush()
    fromWallet(
      walletResponse(sentRequest(), 'arc0027:enable:response', {
        error: { code: 4001, message: 'User rejected', providerId: WALLET_PROVIDER_ID }
      })
    )
    const error = await connecting.catch((e) => e)
    expect(error).toBeInstanceOf(LiquidProviderError)
    expect(error.code).toBe(4001)
  })

  it('rejects an enable result for another network even when written in the other base64 flavour', async () => {
    const ctx = createAdapter()
    const connecting = ctx.adapter.connect({ method: 'direct' })
    connecting.catch(() => undefined)
    fromWallet(walletReady())
    await flush()
    fromWallet(
      walletResponse(sentRequest(), 'arc0027:enable:response', {
        result: {
          providerId: WALLET_PROVIDER_ID,
          genesisHash: 'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8', // mainnet, normalized
          accounts: [{ address: ADDR1 }]
        }
      })
    )
    await expect(connecting).rejects.toBeInstanceOf(DirectNetworkMismatchError)
  })
})

describe('genesis hash comparison', () => {
  const bytes = new Uint8Array(32).map((_, i) => 250 - i * 3)
  const b64 = Buffer.from(bytes).toString('base64')
  const b64url = Buffer.from(bytes).toString('base64url')

  it('compares decoded bytes across base64/base64url and padding', () => {
    expect(b64.endsWith('=')).toBe(true)
    expect(genesisHashesEqual(b64, b64url)).toBe(true)
    expect(genesisHashesEqual(b64, b64.replace(/=+$/, ''))).toBe(true)
    expect(genesisHashesEqual(b64url, b64)).toBe(true)
  })

  it('is false for different bytes and for anything that is not a 32-byte hash', () => {
    const other = Buffer.from(new Uint8Array(32).fill(1)).toString('base64')
    expect(genesisHashesEqual(b64, other)).toBe(false)
    expect(genesisHashesEqual(b64, 'short')).toBe(false)
    expect(genesisHashesEqual(b64, undefined)).toBe(false)
    expect(genesisHashesEqual('', '')).toBe(false)
    expect(decodeGenesisHash(Buffer.from(new Uint8Array(31)).toString('base64'))).toBeNull()
    expect(decodeGenesisHash('!'.repeat(43))).toBeNull()
  })
})

describe('Direct transport — shared popup name across transports', () => {
  it('a second adapter on the same page cannot navigate the first one popup', async () => {
    const first = createAdapter()
    const second = createAdapter()
    const connecting = first.adapter.connect({ method: 'direct' })
    connecting.catch(() => undefined)
    expect(win.open).toHaveBeenCalledTimes(1)

    const error = await second.adapter.connect({ method: 'direct' }).catch((e) => e)
    expect(error).toBeInstanceOf(LiquidProviderError)
    expect(error.code).toBe(4200)
    expect(error.message).toMatch(/already in progress/)
    expect(win.open).toHaveBeenCalledTimes(1) // the first popup was never re-targeted
    expect(popup().close).not.toHaveBeenCalled()

    // Once the first request is over, the other adapter may use the popup again.
    first.adapter.disconnect().catch(() => undefined)
    await expect(connecting).rejects.toBeDefined()
    const retry = second.adapter.connect({ method: 'direct' })
    retry.catch(() => undefined)
    expect(win.open).toHaveBeenCalledTimes(2)
  })
})

describe('Direct transport — local validation failures close the popup', () => {
  it.each([
    ['tampered transaction', () => toBase64Url(makePayment(ADDR1, ADDR2, 5).signTxn(account1.sk))],
    ['undecodable signed transaction', () => toBase64Url(new Uint8Array([1, 2, 3, 4, 5, 6]))],
    ['invalid base64', () => '***not-base64***']
  ])('closes the popup after a %s', async (_name, build) => {
    const { adapter } = await connectAdapter()
    const txn = makePayment(ADDR1, STRANGER)
    const { promise, request } = await readyAndRequest(() => adapter.signTransactions([txn]))
    expect(popup().close).not.toHaveBeenCalled()
    fromWallet(
      response(request, LiquidReference.signTransactionsResponse, {
        providerId: 'w',
        stxns: [build()]
      })
    )
    await expect(promise).rejects.toBeInstanceOf(LiquidProviderError)
    expect(popup().close).toHaveBeenCalled()
    expect(win.listeners.size).toBe(0)
  })

  it('closes the popup when the connect result fails local validation after the session settled', async () => {
    const { adapter } = createAdapter()
    const { connecting, request } = await startConnect(adapter)
    fromWallet(
      response(
        request,
        LiquidReference.enableResponse,
        enableResult(request, { accounts: [{ address: 'nope' }] })
      )
    )
    await expect(connecting).rejects.toBeDefined()
    expect(popup().close).toHaveBeenCalled()
  })
})

describe('Direct transport — signature verification', () => {
  const rekeyed = algosdk.generateAccount()
  const REKEYED = rekeyed.addr.toString()

  /** A connected adapter whose accounts also include a rekeyed one (auth address = account2). */
  async function connectWithRekeyed() {
    authAddrs[REKEYED] = ADDR2
    const ctx = createAdapter()
    const { connecting, request } = await startConnect(ctx.adapter)
    fromWallet(
      response(
        request,
        LiquidReference.enableResponse,
        enableResult(request, { accounts: [{ address: ADDR1 }, { address: REKEYED }] })
      )
    )
    await connecting
    return ctx
  }

  async function sign(
    adapter: BiatecWalletAdapter,
    txn: algosdk.Transaction,
    entry: string | null
  ) {
    const { promise, request } = await readyAndRequest(() => adapter.signTransactions([txn]))
    fromWallet(
      response(request, LiquidReference.signTransactionsResponse, {
        providerId: 'w',
        stxns: [entry]
      })
    )
    return promise
  }

  it('accepts a rekeyed account signed by its auth address and keeps sgnr', async () => {
    const { adapter } = await connectWithRekeyed()
    const txn = makePayment(REKEYED, STRANGER)
    const signed = txn.signTxn(account2.sk)
    const [result] = await sign(adapter, txn, toBase64Url(signed))
    expect(algosdk.decodeSignedTransaction(result!).sgnr?.toString()).toBe(ADDR2)
  })

  it('sets sgnr when the wallet returns an auth-key signature without it (txID unchanged)', async () => {
    const { adapter } = await connectWithRekeyed()
    const txn = makePayment(REKEYED, STRANGER)
    const sig = algosdk.decodeSignedTransaction(txn.signTxn(account2.sk)).sig!
    const noSgnr = algosdk.encodeMsgpack(new algosdk.SignedTransaction({ txn, sig }))
    expect(algosdk.decodeSignedTransaction(noSgnr).sgnr).toBeUndefined()
    const [result] = await sign(adapter, txn, toBase64Url(noSgnr))
    const decoded = algosdk.decodeSignedTransaction(result!)
    expect(decoded.sgnr?.toString()).toBe(ADDR2)
    expect(decoded.sig).toEqual(sig)
    expect(decoded.txn.txID()).toBe(txn.txID())
  })

  it('attaches a raw 64-byte signature of a rekeyed account with the auth address as signer', async () => {
    const { adapter } = await connectWithRekeyed()
    const txn = makePayment(REKEYED, STRANGER)
    const raw = algosdk.decodeSignedTransaction(txn.signTxn(account2.sk)).sig!
    const [result] = await sign(adapter, txn, toBase64Url(raw))
    const decoded = algosdk.decodeSignedTransaction(result!)
    expect(decoded.sig).toEqual(raw)
    expect(decoded.sgnr?.toString()).toBe(ADDR2)
    expect(decoded.txn.txID()).toBe(txn.txID())
  })

  it('rejects a rekeyed account signed by a key the chain does not name as auth address', async () => {
    const { adapter } = await connectWithRekeyed()
    const txn = makePayment(REKEYED, STRANGER)
    const signed = txn.signTxn(stranger.sk) // claims sgnr = stranger
    await expect(sign(adapter, txn, toBase64Url(signed))).rejects.toThrow(/invalid signature/)
  })

  it('rejects a sgnr claim for an account that is not rekeyed on chain', async () => {
    const { adapter } = await connectAdapter()
    const txn = makePayment(ADDR1, STRANGER)
    const signed = txn.signTxn(stranger.sk) // wallet claims stranger is the signer of ADDR1
    await expect(sign(adapter, txn, toBase64Url(signed))).rejects.toThrow(/invalid signature/)
  })

  it('rejects an ed25519 signature that does not verify (one flipped bit)', async () => {
    const { adapter } = await connectAdapter()
    const txn = makePayment(ADDR1, STRANGER)
    const good = algosdk.decodeSignedTransaction(txn.signTxn(account1.sk))
    const badSig = new Uint8Array(good.sig!)
    badSig[10] ^= 1
    const forged = algosdk.encodeMsgpack(new algosdk.SignedTransaction({ txn, sig: badSig }))
    const error = await sign(adapter, txn, toBase64Url(forged)).catch((e) => e)
    expect(error).toBeInstanceOf(LiquidProviderError)
    expect(error.code).toBe(4200)
    expect(error.message).toMatch(/invalid signature/)
    expect(popup().close).toHaveBeenCalled()
  })

  it('rejects an invalid raw 64-byte signature', async () => {
    const { adapter } = await connectAdapter()
    const txn = makePayment(ADDR1, STRANGER)
    await expect(sign(adapter, txn, toBase64Url(new Uint8Array(64).fill(7)))).rejects.toThrow(
      /invalid signature/
    )
  })

  it('rejects a signature of the wrong length (63 bytes)', async () => {
    const { adapter } = await connectAdapter()
    const error = await sign(
      adapter,
      makePayment(ADDR1, STRANGER),
      toBase64Url(new Uint8Array(63).fill(1))
    ).catch((e) => e)
    expect(error).toBeInstanceOf(LiquidProviderError)
    expect(error.code).toBe(4200)
  })

  it('does not look the chain up for a plain (not rekeyed) account', async () => {
    const lookups = vi.spyOn(mockAlgodClient, 'accountInformation')
    const { adapter } = await connectAdapter()
    const txn = makePayment(ADDR1, STRANGER)
    await sign(adapter, txn, toBase64Url(txn.signTxn(account1.sk)))
    expect(lookups).not.toHaveBeenCalled()
  })

  it('reports a failing chain lookup instead of trusting the wallet', async () => {
    authAddrs[REKEYED] = ADDR2
    const ctx = createAdapter()
    const { connecting, request } = await startConnect(ctx.adapter)
    fromWallet(
      response(
        request,
        LiquidReference.enableResponse,
        enableResult(request, { accounts: [{ address: REKEYED }] })
      )
    )
    await connecting
    vi.spyOn(mockAlgodClient, 'accountInformation').mockImplementation(
      // Test double for the one algod call the adapter makes.
      () =>
        ({ exclude: () => ({ do: async () => Promise.reject(new Error('algod down')) }) }) as never
    )
    const txn = makePayment(REKEYED, STRANGER)
    const error = await sign(ctx.adapter, txn, toBase64Url(txn.signTxn(account2.sk))).catch(
      (e) => e
    )
    expect(error.message).toMatch(/Could not confirm the signer/)
  })
})

describe('Direct transport — resume does not depend on the active network', () => {
  const persisted = (genesisHash: string) => {
    const account = {
      name: 'a',
      address: ADDR1,
      metadata: { method: 'direct', walletOrigin: WALLET_ORIGIN, genesisHash }
    }
    return { wallets: { [WALLET_ID]: { accounts: [account], activeAccount: account } } }
  }

  it('keeps the session when the persisted hash is the active network in another encoding', async () => {
    const { adapter } = createAdapter({}, persisted('SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9_cOUJOiI'))
    await adapter.resumeSession()
    expect(adapter.isConnected).toBe(true)
  })

  it('keeps the session when it was connected on another network (grant is per site, not per network)', async () => {
    const { adapter } = createAdapter({}, persisted('wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8='))
    await adapter.resumeSession()
    expect(adapter.isConnected).toBe(true)
  })

  it('keeps the session even when the persisted hash is garbage (informational only)', async () => {
    const { adapter } = createAdapter({}, persisted('not-a-hash'))
    await adapter.resumeSession()
    expect(adapter.isConnected).toBe(true)
  })
})

// ---------- Round 2: window names, origin pre-check, verification robustness ---------- //

describe('Direct transport — unique window name per session', () => {
  it('uses a different window name for every session, so a stale popup is never re-targeted', async () => {
    const { adapter } = createAdapter()
    const first = adapter.connect({ method: 'direct' })
    first.catch(() => undefined)
    adapter.disconnect().catch(() => undefined)
    await first.catch(() => undefined)
    const second = adapter.connect({ method: 'direct' })
    second.catch(() => undefined)
    const names = win.open.mock.calls.map((call) => call[1] as string)
    expect(names).toHaveLength(2)
    expect(names[0]).toMatch(/^biatec-wallet-direct-[0-9a-f-]{36}$/)
    expect(names[1]).toMatch(/^biatec-wallet-direct-[0-9a-f-]{36}$/)
    expect(names[0]).not.toBe(names[1])
  })
})

describe('Direct transport — dApp origin pre-check (mirrors the wallet)', () => {
  it.each([
    'http://192.168.1.5:5173',
    'http://app.test',
    'http://example.com',
    'https://example.com.',
    'http://localhost.evil.com',
    'ftp://localhost'
  ])('refuses %s before opening any popup', async (origin) => {
    win.location.origin = origin
    const { adapter } = createAdapter()
    const error = await adapter.connect({ method: 'direct' }).catch((e) => e)
    expect(error.name).toBe('SessionError')
    expect(error.message).toMatch(/https|origin/)
    expect(win.open).not.toHaveBeenCalled()
  })

  it.each([
    'https://dapp.example',
    'https://example.com:8443',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://[::1]:5173',
    'http://app.localhost:3000'
  ])('accepts %s', async (origin) => {
    win.location.origin = origin
    const { adapter } = createAdapter()
    adapter.connect({ method: 'direct' }).catch(() => undefined)
    expect(win.open).toHaveBeenCalledTimes(1)
    expect(win.open.mock.calls[0][0]).toContain(encodeURIComponent(origin))
  })
})

describe('Direct transport — signature verification robustness', () => {
  const rekeyed = algosdk.generateAccount()
  const REKEYED = rekeyed.addr.toString()

  const payment = (sender: string, receiver: string, rekeyTo?: string, amount = 1000) =>
    algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender,
      receiver,
      amount,
      ...(rekeyTo ? { rekeyTo } : {}),
      suggestedParams: {
        fee: 1000,
        minFee: 1000,
        flatFee: true,
        firstValid: 1,
        lastValid: 1000,
        genesisID: 'testnet-v1.0',
        genesisHash: algosdk.base64ToBytes(GENESIS_HASH)
      }
    })

  async function connectAccounts(addresses: string[]) {
    const ctx = createAdapter()
    const { connecting, request } = await startConnect(ctx.adapter)
    fromWallet(
      response(
        request,
        LiquidReference.enableResponse,
        enableResult(request, { accounts: addresses.map((address) => ({ address })) })
      )
    )
    await connecting
    return ctx
  }

  async function signGroup(
    adapter: BiatecWalletAdapter,
    txns: algosdk.Transaction[],
    stxns: string[]
  ) {
    const { promise, request } = await readyAndRequest(() => adapter.signTransactions(txns))
    fromWallet(
      response(request, LiquidReference.signTransactionsResponse, { providerId: 'w', stxns })
    )
    return promise
  }

  it('looks the chain up once per sender, however many transactions it has', async () => {
    authAddrs[REKEYED] = ADDR2
    const { adapter } = await connectAccounts([ADDR1, REKEYED])
    const lookups = vi.spyOn(mockAlgodClient, 'accountInformation')
    const txns = [
      payment(REKEYED, STRANGER, undefined, 1),
      payment(REKEYED, STRANGER, undefined, 2)
    ]
    algosdk.assignGroupID(txns)
    const result = await signGroup(
      adapter,
      txns,
      txns.map((t) => toBase64Url(t.signTxn(account2.sk)))
    )
    expect(result).toHaveLength(2)
    expect(lookups).toHaveBeenCalledTimes(1)
    expect(lookups).toHaveBeenCalledWith(REKEYED)
    expect(excluded).toEqual(['all']) // the full asset/app lists are never downloaded
  })

  it('does not look the chain up when the wallet claims the sender signed and it does not verify', async () => {
    const { adapter } = await connectAccounts([ADDR1])
    const lookups = vi.spyOn(mockAlgodClient, 'accountInformation')
    const txn = payment(ADDR1, STRANGER)
    const good = algosdk.decodeSignedTransaction(txn.signTxn(account1.sk))
    const badSig = new Uint8Array(good.sig!)
    badSig[3] ^= 1
    const forged = algosdk.encodeMsgpack(
      new algosdk.SignedTransaction({ txn, sig: badSig, sgnr: txn.sender })
    )
    const error = await signGroup(adapter, [txn], [toBase64Url(forged)]).catch((e) => e)
    expect(error.code).toBe(4200)
    expect(error.message).toMatch(/invalid signature/)
    expect(lookups).not.toHaveBeenCalled()
  })

  it('honours a rekey made by an earlier transaction of the same group (no chain lookup)', async () => {
    const { adapter } = await connectAccounts([ADDR1])
    const lookups = vi.spyOn(mockAlgodClient, 'accountInformation')
    const t0 = payment(ADDR1, STRANGER, ADDR2, 1) // rekeys ADDR1 -> ADDR2, signed by ADDR1
    const t1 = payment(ADDR1, STRANGER, undefined, 2) // already controlled by ADDR2
    algosdk.assignGroupID([t0, t1])
    const result = await signGroup(
      adapter,
      [t0, t1],
      [toBase64Url(t0.signTxn(account1.sk)), toBase64Url(t1.signTxn(account2.sk))]
    )
    expect(algosdk.decodeSignedTransaction(result[1]!).sgnr?.toString()).toBe(ADDR2)
    expect(lookups).not.toHaveBeenCalled()
  })

  it('applies group rekeys in order: the rekeyed key cannot sign the transaction that rekeys', async () => {
    const { adapter } = await connectAccounts([ADDR1])
    const t0 = payment(ADDR1, STRANGER, ADDR2, 1)
    const t1 = payment(ADDR1, STRANGER, undefined, 2)
    algosdk.assignGroupID([t0, t1])
    // t0 signed by the NEW key (account2) is wrong: at t0 the sender's own key still controls it.
    await expect(
      signGroup(
        adapter,
        [t0, t1],
        [toBase64Url(t0.signTxn(account2.sk)), toBase64Url(t1.signTxn(account2.sk))]
      )
    ).rejects.toThrow(/invalid signature/)
  })

  it('rekey back to itself in the group makes the sender own key valid again', async () => {
    authAddrs[ADDR1] = ADDR2
    const { adapter } = await connectAccounts([ADDR1])
    const t0 = payment(ADDR1, STRANGER, ADDR1, 1) // signed by ADDR2 (chain auth), rekeys back
    const t1 = payment(ADDR1, STRANGER, undefined, 2) // signed by ADDR1 itself again
    algosdk.assignGroupID([t0, t1])
    const result = await signGroup(
      adapter,
      [t0, t1],
      [toBase64Url(t0.signTxn(account2.sk)), toBase64Url(t1.signTxn(account1.sk))]
    )
    expect(result).toHaveLength(2)
  })

  it('tells a transient algod failure apart from an invalid signature', async () => {
    authAddrs[REKEYED] = ADDR2
    const { adapter } = await connectAccounts([REKEYED])
    vi.spyOn(mockAlgodClient, 'accountInformation').mockImplementation(
      // Test double for the one algod call the adapter makes.
      () =>
        ({ exclude: () => ({ do: async () => Promise.reject(new Error('algod down')) }) }) as never
    )
    const txn = payment(REKEYED, STRANGER)
    const network = await signGroup(adapter, [txn], [toBase64Url(txn.signTxn(account2.sk))]).catch(
      (e) => e
    )
    expect(network.code).toBe(4300)
    expect(network.message).toMatch(/network error/)
    expect(network.message).not.toMatch(/invalid signature/)
  })
})

describe('Direct transport — abort during response processing', () => {
  it('never writes accounts when the signal aborted before the result was stored', async () => {
    const { adapter } = createAdapter()
    const transport = (adapter as unknown as { direct: DirectTransport }).direct
    const controller = new AbortController()
    const connecting = transport.connect({ signal: controller.signal })
    connecting.catch(() => undefined)
    fromWallet(readyMessage())
    await flush()
    const request = sentRequest()
    // Abort in the same turn the response arrives (after the session settled successfully).
    fromWallet(response(request, LiquidReference.enableResponse, enableResult(request)))
    controller.abort()
    await expect(connecting).rejects.toThrow(/cancelled/)
    expect(adapter.isConnected).toBe(false)
  })
})

describe('Direct transport — every account type (multisig, post-quantum, pre-signed)', () => {
  const cosigner = algosdk.generateAccount()
  const msigParams: algosdk.MultisigMetadata = {
    version: 1,
    threshold: 2,
    addrs: [ADDR1, ADDR2, cosigner.addr.toString()]
  }
  const MSIG = algosdk.multisigAddress(msigParams).toString()
  const pqKey = new Uint8Array(1793).fill(7)
  const pqSig = new Uint8Array(1280).fill(9)
  const scheme = new Uint8Array([0x66, 0x31])

  /** A connected adapter whose accounts include the given extra addresses. */
  async function connectWithSpecial(extra: string[]) {
    const ctx = createAdapter()
    const { connecting, request } = await startConnect(ctx.adapter)
    fromWallet(
      response(
        request,
        LiquidReference.enableResponse,
        enableResult(request, {
          accounts: [{ address: ADDR1 }, ...extra.map((address) => ({ address }))]
        })
      )
    )
    await connecting
    return ctx
  }

  async function sign(adapter: BiatecWalletAdapter, txn: algosdk.Transaction, entry: string) {
    const { promise, request } = await readyAndRequest(() => adapter.signTransactions([txn]))
    fromWallet(
      response(request, LiquidReference.signTransactionsResponse, {
        providerId: 'w',
        stxns: [entry]
      })
    )
    return { promise, request }
  }

  it('returns a partially signed multisig blob (far larger than 64 bytes) as is, not as a raw signature', async () => {
    const { adapter } = await connectWithSpecial([MSIG])
    const txn = makePayment(MSIG, STRANGER)
    const blob = algosdk.signMultisigTransaction(txn, msigParams, account1.sk).blob
    expect(blob.length).toBeGreaterThan(64)
    const { promise, request } = await sign(adapter, txn, toBase64Url(blob))
    // The adapter sends only the unsigned txn: the wallet knows the multisig parameters itself.
    expect(request.params.txns).toEqual([{ txn: toBase64Url(txn.toByte()) }])
    const [result] = await promise
    expect(result).toEqual(blob)
    expect(algosdk.decodeSignedTransaction(result!).msig?.subsig).toHaveLength(3)
  })

  it('rejects a multisig blob of a different transaction', async () => {
    const { adapter } = await connectWithSpecial([MSIG])
    const txn = makePayment(MSIG, STRANGER)
    const other = makePayment(MSIG, STRANGER, 5)
    const blob = algosdk.signMultisigTransaction(other, msigParams, account1.sk).blob
    const { promise } = await sign(adapter, txn, toBase64Url(blob))
    await expect(promise).rejects.toThrow(/does not match/)
  })

  it('accepts a full signed post-quantum (pqsig) blob and does not mistake it for a raw signature', async () => {
    const pqAddr = algosdk.addressFromPQKey(scheme, pqKey).address.toString()
    const { adapter } = await connectWithSpecial([pqAddr])
    const txn = makePayment(pqAddr, STRANGER)
    const blob = algosdk.encodeMsgpack(
      new algosdk.SignedTransaction({ txn, pqsig: { sch: scheme, slt: 0, pk: pqKey, sig: pqSig } })
    )
    expect(blob.length).toBeGreaterThan(3000)
    const { promise } = await sign(adapter, txn, toBase64Url(blob))
    const [result] = await promise
    expect(result).toEqual(blob)
    expect(algosdk.decodeSignedTransaction(result!).pqsig?.sig).toEqual(pqSig)
  })

  it('rejects a pqsig blob of a different transaction', async () => {
    const pqAddr = algosdk.addressFromPQKey(scheme, pqKey).address.toString()
    const { adapter } = await connectWithSpecial([pqAddr])
    const txn = makePayment(pqAddr, STRANGER)
    const blob = algosdk.encodeMsgpack(
      new algosdk.SignedTransaction({
        txn: makePayment(pqAddr, STRANGER, 77),
        pqsig: { sch: scheme, slt: 0, pk: pqKey, sig: pqSig }
      })
    )
    const { promise } = await sign(adapter, txn, toBase64Url(blob))
    await expect(promise).rejects.toThrow(/does not match/)
  })

  it('treats exactly 64 bytes as a raw signature and verifies it (a bogus one is rejected)', async () => {
    const { adapter } = await connectWithSpecial([MSIG])
    const txn = makePayment(MSIG, STRANGER)
    const { promise } = await sign(adapter, txn, toBase64Url(new Uint8Array(64).fill(1)))
    await expect(promise).rejects.toThrow(/invalid signature/)
  })

  it('leaves an already signed input untouched: no popup and a null result, even for a multisig sender', async () => {
    const { adapter } = await connectWithSpecial([MSIG])
    const txn = makePayment(MSIG, STRANGER)
    const preSigned = algosdk.signMultisigTransaction(txn, msigParams, account1.sk).blob
    win.open.mockClear()
    const result = await adapter.signTransactions([preSigned])
    expect(result).toEqual([null])
    expect(win.open).not.toHaveBeenCalled()
  })
})
