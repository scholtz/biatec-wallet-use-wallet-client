import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LogLevel, WalletManager } from '@txnlab/use-wallet'
import { createTestHarness } from '@txnlab/use-wallet/testing'
import type algosdk from 'algosdk'
import { BiatecWalletAdapter, WALLET_ID, type BiatecWalletOptions } from './adapter'

// use-wallet's logger only prints when `window` exists at the time ITS module is first loaded,
// so define one before any import runs. Kept in its own file so no other suite sees a `window`.
vi.hoisted(() => {
  const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
  Object.assign(globalThis, { window: {}, localStorage: storage })
})

function construct(options: BiatecWalletOptions) {
  const { store, accessor } = createTestHarness(WALLET_ID)
  return new BiatecWalletAdapter({
    id: WALLET_ID,
    metadata: BiatecWalletAdapter.defaultMetadata,
    store: accessor,
    subscribe: (callback) => {
      const subscription = store.subscribe(() => callback(store.state))
      return () => subscription.unsubscribe()
    },
    getAlgodClient: () => ({}) as algosdk.Algodv2,
    options
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

function spyLogs() {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  return {
    warned: () => warn.mock.calls.map((call) => String(call[0])),
    informed: () => info.mock.calls.map((call) => String(call[0]))
  }
}

describe('BiatecWalletAdapter — WalletConnect options without a projectId', () => {
  it.each([
    ['relayUrl', { relayUrl: 'wss://relay.example' }],
    ['chains', { chains: ['algorand:x'] }]
  ])('warns (without throwing) when %s is given but there is no projectId', (_name, extra) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(() => construct(extra)).not.toThrow()
    expect(warn.mock.calls.some((call) => /without a projectId/.test(String(call[0])))).toBe(true)
  })

  it('does not warn for a plain default configuration or when a projectId is given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    construct({})
    construct({ projectId: 'abc', relayUrl: 'wss://relay.example' })
    expect(warn.mock.calls.some((call) => /projectId/.test(String(call[0])))).toBe(false)
  })
})

describe('BiatecWalletAdapter — projectId logging', () => {
  // use-wallet's default log level hides info; a WalletManager with logLevel INFO raises it.
  beforeAll(() => {
    new WalletManager({ wallets: [], options: { logLevel: LogLevel.INFO } })
  })

  it('logs an info line (and no warning) for a plain config without the projectId key', () => {
    const logs = spyLogs()
    construct({})
    expect(logs.informed().some((m) => /WalletConnect not enabled \(no projectId\)/.test(m))).toBe(
      true
    )
    expect(logs.warned().some((m) => /projectId/.test(m))).toBe(false)
  })

  it.each([
    ['present but undefined', { projectId: undefined as unknown as string }],
    ['present but empty', { projectId: '' }],
    ['present but whitespace', { projectId: '   ' }]
  ])('warns when projectId is %s', (_name, options) => {
    const logs = spyLogs()
    construct(options)
    expect(logs.warned().some((m) => /`projectId` was passed but is empty/.test(m))).toBe(true)
  })

  it('does not warn when the projectId key is absent', () => {
    const logs = spyLogs()
    construct({})
    expect(logs.warned().some((m) => /projectId/.test(m))).toBe(false)
  })

  it('does not warn with walletconnect: false and an empty projectId', () => {
    const logs = spyLogs()
    construct({ walletconnect: false, projectId: '' })
    expect(logs.warned().some((m) => /projectId/.test(m))).toBe(false)
  })

  it('does not warn for a valid projectId', () => {
    const logs = spyLogs()
    construct({ projectId: 'abc' })
    expect(logs.warned().some((m) => /projectId/.test(m))).toBe(false)
    expect(logs.informed().some((m) => /no projectId/.test(m))).toBe(false)
  })
})

describe('BiatecWalletAdapter — connect({ method: "walletconnect" }) when not enabled', () => {
  it('hints at the missing projectId', async () => {
    await expect(construct({}).connect({ method: 'walletconnect' })).rejects.toThrow(
      /not enabled: WalletConnect needs a projectId \(biatec\(\{ projectId \}\)\)/
    )
  })

  it('says it was disabled by the option when walletconnect: false', async () => {
    await expect(
      construct({ walletconnect: false, projectId: 'abc' }).connect({ method: 'walletconnect' })
    ).rejects.toThrow(/disabled by the `walletconnect: false` option/)
  })
})
