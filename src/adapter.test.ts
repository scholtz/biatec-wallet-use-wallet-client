import algosdk from 'algosdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestHarness } from '@txnlab/use-wallet/testing'
import type { State } from '@txnlab/use-wallet/testing'
import { BiatecWalletAdapter, WALLET_ID, type BiatecWalletOptions } from './adapter'
import * as methodPickerDialog from './method-picker-dialog'

// ---------- Mocks -------------------------------------------------- //

const mocks = vi.hoisted(() => {
  const signClient = {
    connect: vi.fn(),
    request: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    session: { length: 0, keys: [] as string[], get: vi.fn() }
  }
  return { signClient, signClientInit: vi.fn(async () => signClient) }
})

vi.mock('@walletconnect/sign-client', () => ({
  SignClient: { init: mocks.signClientInit }
}))

vi.mock('./method-picker-dialog', () => ({
  openMethodPickerDialog: vi.fn(),
  openUriDisplayDialog: vi.fn(() => ({ close: vi.fn() }))
}))

// ---------- Fixtures ----------------------------------------------- //

const account1 = algosdk.generateAccount()
const ADDR1 = account1.addr.toString()

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
    options: { projectId: 'test-project-id', onDisplayUri: () => undefined, ...options }
  })
  return { adapter, store }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.signClient.session.length = 0
  mocks.signClient.session.keys = []
  vi.stubGlobal('location', { host: 'dapp.example' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BiatecWalletAdapter — dispatch', () => {
  it('shows the built-in method picker when both transports are enabled and no method is given', async () => {
    const { adapter } = createAdapter()
    vi.mocked(methodPickerDialog.openMethodPickerDialog).mockImplementation((onChoose) => {
      onChoose('walletconnect')
      return { close: vi.fn() }
    })
    mocks.signClient.connect.mockResolvedValue({
      uri: 'wc:uri',
      approval: async () => ({
        topic: 't1',
        namespaces: {
          algorand: { accounts: [`algorand:x:${ADDR1}`], methods: ['algo_signTxn'], events: [] }
        }
      })
    })

    await adapter.connect()

    expect(methodPickerDialog.openMethodPickerDialog).toHaveBeenCalledTimes(1)
    expect(mocks.signClient.connect).toHaveBeenCalledTimes(1)
  })

  it('skips the picker and rejects when the picker is cancelled', async () => {
    const { adapter } = createAdapter()
    vi.mocked(methodPickerDialog.openMethodPickerDialog).mockImplementation(
      (_onChoose, onCancel) => {
        onCancel()
        return { close: vi.fn() }
      }
    )

    await expect(adapter.connect()).rejects.toThrow('Connection cancelled')
    expect(mocks.signClient.connect).not.toHaveBeenCalled()
  })

  it('skips the picker when liquid is disabled', async () => {
    const { adapter } = createAdapter({ liquid: false })
    mocks.signClient.connect.mockResolvedValue({
      uri: 'wc:uri',
      approval: async () => ({
        topic: 't1',
        namespaces: {
          algorand: { accounts: [`algorand:x:${ADDR1}`], methods: ['algo_signTxn'], events: [] }
        }
      })
    })

    await adapter.connect()

    expect(methodPickerDialog.openMethodPickerDialog).not.toHaveBeenCalled()
    expect(mocks.signClient.connect).toHaveBeenCalledTimes(1)
  })

  it('skips the picker when a method is given explicitly', async () => {
    const { adapter } = createAdapter()
    mocks.signClient.connect.mockResolvedValue({
      uri: 'wc:uri',
      approval: async () => ({
        topic: 't1',
        namespaces: {
          algorand: { accounts: [`algorand:x:${ADDR1}`], methods: ['algo_signTxn'], events: [] }
        }
      })
    })

    await adapter.connect({ method: 'walletconnect' })

    expect(methodPickerDialog.openMethodPickerDialog).not.toHaveBeenCalled()
    expect(mocks.signClient.connect).toHaveBeenCalledTimes(1)
  })

  it('resumeSession dispatches to WalletConnect when persisted metadata says so', async () => {
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

    expect(mocks.signClientInit).toHaveBeenCalledTimes(1)
  })

  it('resumeSession dispatches to Liquid Auth when persisted metadata says so, without touching WalletConnect', async () => {
    const { adapter } = createAdapter(
      {},
      {
        wallets: {
          [WALLET_ID]: {
            accounts: [
              {
                name: 'a',
                address: ADDR1,
                metadata: { method: 'liquid', requestId: 'r1', origin: 'https://liquid.biatec.io' }
              }
            ],
            activeAccount: {
              name: 'a',
              address: ADDR1,
              metadata: { method: 'liquid', requestId: 'r1', origin: 'https://liquid.biatec.io' }
            }
          }
        }
      }
    )

    await adapter.resumeSession()

    expect(mocks.signClientInit).not.toHaveBeenCalled()
    expect(adapter.isConnected).toBe(true)
  })

  it('resumeSession falls back to WalletConnect for legacy accounts with no method tag', async () => {
    const { adapter } = createAdapter(
      {},
      {
        wallets: {
          [WALLET_ID]: {
            accounts: [{ name: 'a', address: ADDR1 }],
            activeAccount: { name: 'a', address: ADDR1 }
          }
        }
      }
    )

    await adapter.resumeSession()

    expect(mocks.signClientInit).toHaveBeenCalledTimes(1)
  })

  it('disconnects cleanly when a persisted Liquid Auth session is resumed but liquid is now disabled', async () => {
    const { adapter } = createAdapter(
      { liquid: false },
      {
        wallets: {
          [WALLET_ID]: {
            accounts: [
              {
                name: 'a',
                address: ADDR1,
                metadata: { method: 'liquid', requestId: 'r1', origin: 'x' }
              }
            ],
            activeAccount: {
              name: 'a',
              address: ADDR1,
              metadata: { method: 'liquid', requestId: 'r1', origin: 'x' }
            }
          }
        }
      }
    )

    await adapter.resumeSession()

    expect(adapter.isConnected).toBe(false)
  })
})
