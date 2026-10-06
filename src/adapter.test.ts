import algosdk from 'algosdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestHarness } from '@txnlab/use-wallet/testing'
import type { State } from '@txnlab/use-wallet/testing'
import {
  BiatecWalletAdapter,
  PopupBlockedError,
  WALLET_ID,
  type BiatecWalletOptions
} from './adapter'
import * as connectDialog from './connect-dialog'

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

vi.mock('./connect-dialog', () => ({
  openConnectDialog: vi.fn(() => ({ close: vi.fn(), setState: vi.fn() }))
}))

// ---------- Fixtures ----------------------------------------------- //

const account1 = algosdk.generateAccount()
const ADDR1 = account1.addr.toString()

const mockAlgodClient = {
  accountInformation: () => ({ do: async () => ({ authAddr: undefined }) })
} as unknown as algosdk.Algodv2

function createAdapter(
  options: Partial<BiatecWalletOptions> = {},
  state?: Partial<State>,
  { withOnDisplayUri = true }: { withOnDisplayUri?: boolean } = {}
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
      projectId: 'test-project-id',
      ...(withOnDisplayUri ? { onDisplayUri: () => undefined } : {}),
      ...options
    }
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
  it('shows the built-in dialog when both transports are enabled and no method is given', async () => {
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

    await adapter.connect()

    expect(connectDialog.openConnectDialog).toHaveBeenCalledTimes(1)
    const options = vi.mocked(connectDialog.openConnectDialog).mock.calls[0][0]
    expect(options.methods).toEqual(['walletconnect', 'liquid', 'direct'])
    expect(options.defaultMethod).toBe('walletconnect')
    expect(mocks.signClient.connect).toHaveBeenCalledTimes(1)
  })

  it('rejects when the dialog is cancelled, without starting any transport', async () => {
    const { adapter } = createAdapter()
    vi.mocked(connectDialog.openConnectDialog).mockImplementationOnce((opts) => {
      opts.onCancel()
      return { close: vi.fn(), setState: vi.fn() }
    })

    await expect(adapter.connect()).rejects.toThrow('Connection cancelled')
    expect(mocks.signClient.connect).not.toHaveBeenCalled()
  })

  it('skips the dialog entirely when liquid is disabled and onDisplayUri is set', async () => {
    const { adapter } = createAdapter({ liquid: false, direct: false })
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

    expect(connectDialog.openConnectDialog).not.toHaveBeenCalled()
    expect(mocks.signClient.connect).toHaveBeenCalledTimes(1)
  })

  it('still shows the (picker-less) content dialog for a single method when onDisplayUri is unset', async () => {
    const { adapter } = createAdapter({ liquid: false, direct: false }, undefined, {
      withOnDisplayUri: false
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

    expect(connectDialog.openConnectDialog).toHaveBeenCalledTimes(1)
    const options = vi.mocked(connectDialog.openConnectDialog).mock.calls[0][0]
    expect(options.methods).toEqual(['walletconnect'])
    expect(options.showContent).toBe(true)
    expect(mocks.signClient.connect).toHaveBeenCalledTimes(1)
  })

  it('skips the dialog when a method is given explicitly (and onDisplayUri is set)', async () => {
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

    expect(connectDialog.openConnectDialog).not.toHaveBeenCalled()
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

// ---------- Direct (popup) dispatch through the connect dialog --------------- //

describe('BiatecWalletAdapter — direct method & dialog', () => {
  const WALLET_ORIGIN = 'https://wallet.biatec.io'
  // No onDisplayUri: the built-in dialog renders its own content (and gets state updates).
  const createDialogAdapter = (options: Partial<BiatecWalletOptions> = {}) =>
    createAdapter(options, undefined, { withOnDisplayUri: false })

  interface Popup {
    closed: boolean
    postMessage: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
  }
  let popups: Popup[]
  let blocked: boolean
  let listeners: Set<(event: { origin: string; source: unknown; data: unknown }) => void>
  let openCalls: number
  let dialogOptions: Parameters<typeof connectDialog.openConnectDialog>[0]
  let dialogSetState: ReturnType<typeof vi.fn>

  beforeEach(() => {
    popups = []
    blocked = false
    openCalls = 0
    listeners = new Set()
    vi.stubGlobal('window', {
      location: { origin: 'https://dapp.example' },
      open: () => {
        openCalls++
        if (blocked) return null
        const popup: Popup = {
          closed: false,
          postMessage: vi.fn(),
          close: vi.fn(() => {
            popup.closed = true
          }),
          focus: vi.fn()
        }
        popups.push(popup)
        return popup
      },
      addEventListener: (_t: string, l: never) => listeners.add(l),
      removeEventListener: (_t: string, l: never) => listeners.delete(l)
    })
    dialogSetState = vi.fn()
    vi.mocked(connectDialog.openConnectDialog).mockImplementation((options) => {
      dialogOptions = options
      return { close: vi.fn(), setState: dialogSetState }
    })
  })

  const dispatch = (data: unknown, source: unknown = popups[popups.length - 1]) => {
    for (const l of [...listeners]) l({ origin: WALLET_ORIGIN, source, data })
  }

  it('shows all three methods in order, walletconnect pre-selected by default', async () => {
    const { adapter } = createDialogAdapter()
    mocks.signClient.connect.mockReturnValue(new Promise(() => undefined))
    void adapter.connect()
    expect(dialogOptions.methods).toEqual(['walletconnect', 'liquid', 'direct'])
    expect(dialogOptions.defaultMethod).toBe('walletconnect')
    // Direct is not started merely because it is listed.
    expect(openCalls).toBe(0)
  })

  it('honours defaultMethod and opens the direct popup synchronously inside connect()', () => {
    const { adapter } = createDialogAdapter({ defaultMethod: 'direct' })
    void adapter.connect().catch(() => undefined)
    // No await has happened: the popup must already be open (user-gesture rule).
    expect(dialogOptions.defaultMethod).toBe('direct')
    expect(openCalls).toBe(1)
    expect(dialogSetState).toHaveBeenCalledWith('direct', { status: 'connecting' })
    expect(mocks.signClient.connect).not.toHaveBeenCalled()
  })

  it('rejects a defaultMethod that is not enabled, and connecting with a disabled method', async () => {
    expect(() => createDialogAdapter({ defaultMethod: 'liquid', liquid: false })).toThrow(
      /defaultMethod/
    )
    const { adapter } = createDialogAdapter({ direct: false })
    await expect(adapter.connect({ method: 'direct' })).rejects.toThrow(/not enabled/)
  })

  it('the "Open Biatec Wallet" click handler opens the popup synchronously', () => {
    const { adapter } = createDialogAdapter()
    mocks.signClient.connect.mockReturnValue(new Promise(() => undefined))
    void adapter.connect().catch(() => undefined)
    expect(openCalls).toBe(0)
    // What the dialog's button does: call onSelectMethod('direct') straight from the click.
    dialogOptions.onSelectMethod('direct')
    expect(openCalls).toBe(1)
    expect(dialogSetState).toHaveBeenCalledWith('direct', { status: 'connecting' })
    // Clicking again while the popup is open refocuses it instead of opening another one.
    dialogOptions.onSelectMethod('direct')
    expect(openCalls).toBe(1)
    expect(popups[0].focus).toHaveBeenCalledTimes(1)
  })

  it('keeps the dialog open on a blocked popup and lets the user click again', async () => {
    const { adapter } = createDialogAdapter()
    mocks.signClient.connect.mockReturnValue(new Promise(() => undefined))
    let settled = false
    void adapter.connect().then(
      () => (settled = true),
      () => (settled = true)
    )
    blocked = true
    dialogOptions.onSelectMethod('direct')
    await Promise.resolve()
    await Promise.resolve()
    expect(dialogSetState).toHaveBeenCalledWith(
      'direct',
      expect.objectContaining({ status: 'popup-blocked' })
    )
    expect(settled).toBe(false)

    blocked = false
    dialogOptions.onSelectMethod('direct')
    expect(openCalls).toBe(2)
    expect(popups).toHaveLength(1)
  })

  it('completes through the dialog and tags the session as direct', async () => {
    const { adapter } = createDialogAdapter()
    mocks.signClient.connect.mockReturnValue(new Promise(() => undefined))
    const connecting = adapter.connect()
    dialogOptions.onSelectMethod('direct')
    dispatch({
      v: 1,
      reference: 'biatec:direct:ready',
      capabilities: { methods: [], genesisHashes: [] }
    })
    await vi.waitFor(() => expect(popups[0].postMessage).toHaveBeenCalledTimes(1))
    const [request, targetOrigin] = popups[0].postMessage.mock.calls[0]
    expect(targetOrigin).toBe(WALLET_ORIGIN)
    dispatch({
      id: 'w',
      requestId: request.id,
      reference: 'arc0027:enable:response',
      result: {
        providerId: request.params.providerId,
        genesisHash: request.params.genesisHash,
        accounts: [{ address: ADDR1 }]
      }
    })
    const accounts = await connecting
    expect(accounts[0].metadata).toMatchObject({ method: 'direct', walletOrigin: WALLET_ORIGIN })
    expect(adapter.isConnected).toBe(true)
  })

  it('closes the direct popup when another method wins', async () => {
    const { adapter } = createDialogAdapter()
    mocks.signClient.connect.mockResolvedValue({
      uri: 'wc:uri',
      approval: () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                topic: 't1',
                namespaces: {
                  algorand: {
                    accounts: [`algorand:x:${ADDR1}`],
                    methods: ['algo_signTxn'],
                    events: []
                  }
                }
              }),
            20
          )
        )
    })
    const connecting = adapter.connect()
    dialogOptions.onSelectMethod('direct')
    expect(popups).toHaveLength(1)
    await connecting
    expect(popups[0].close).toHaveBeenCalled()
    expect(listeners.size).toBe(0)
  })

  it('closes the direct popup and rejects when the dialog is cancelled', async () => {
    const { adapter } = createDialogAdapter()
    mocks.signClient.connect.mockReturnValue(new Promise(() => undefined))
    const connecting = adapter.connect()
    dialogOptions.onSelectMethod('direct')
    dialogOptions.onCancel()
    await expect(connecting).rejects.toThrow('Connection cancelled')
    expect(popups[0].close).toHaveBeenCalled()
  })

  it('lets WalletConnect be disabled: direct-only starts no WalletConnect client', async () => {
    const { adapter } = createDialogAdapter({
      walletconnect: false,
      liquid: false
    })
    void adapter.connect().catch(() => undefined)
    expect(dialogOptions.methods).toEqual(['direct'])
    expect(dialogOptions.defaultMethod).toBe('direct')
    expect(mocks.signClientInit).not.toHaveBeenCalled()
    expect(openCalls).toBe(1)
  })

  it('treats a blocked popup as a plain failure when the dialog renders no content', async () => {
    const { adapter } = createAdapter({ walletconnect: false, liquid: false }, undefined, {
      withOnDisplayUri: true
    })
    // With onDisplayUri set and a single method there is no dialog at all: reject right away.
    blocked = true
    await expect(adapter.connect({ method: 'direct' })).rejects.toBeInstanceOf(PopupBlockedError)
  })
})
