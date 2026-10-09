import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestHarness } from '@txnlab/use-wallet/testing'
import type algosdk from 'algosdk'
import { BiatecWalletAdapter, WALLET_ID, type BiatecWalletOptions } from './adapter'

// use-wallet's logger only prints when `window` exists at the time ITS module is first loaded,
// so define one before any import runs. Kept in its own file so no other suite sees a `window`.
vi.hoisted(() => {
  Object.assign(globalThis, { window: {} })
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
