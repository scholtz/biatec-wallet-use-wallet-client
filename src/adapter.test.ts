import algosdk from 'algosdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestHarness } from '@txnlab/use-wallet/testing'
import type { State } from '@txnlab/use-wallet/testing'
import {
  BiatecWalletAdapter,
  classifyConnectError,
  PopupBlockedError,
  WALLET_ID,
  type BiatecWalletOptions
} from './adapter'
import { LiquidErrorCode, LiquidProviderError } from './liquid/protocol'
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
  // BaseWallet calls `.do()` directly; Direct's rekey lookup goes through `.exclude('all')`.
  accountInformation: () => {
    const query = { do: async () => ({ authAddr: undefined }), exclude: () => query }
    return query
  }
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
  it('shows the built-in dialog when several methods are enabled and no method is given', async () => {
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
    expect(options.methods).toEqual(['direct', 'walletconnect', 'liquid'])
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

describe('classifyConnectError', () => {
  it('maps every error kind', () => {
    expect(classifyConnectError(new PopupBlockedError())).toBe('popupBlocked')
    expect(classifyConnectError(new LiquidProviderError('x', LiquidErrorCode.timedOut))).toBe(
      'timedOut'
    )
    expect(
      classifyConnectError(new LiquidProviderError('x', LiquidErrorCode.networkNotSupported))
    ).toBe('wrongNetwork')
    expect(
      classifyConnectError(
        new LiquidProviderError('Wallet window was closed', LiquidErrorCode.cancelled)
      )
    ).toBe('walletClosed')
    expect(
      classifyConnectError(new LiquidProviderError('declined', LiquidErrorCode.cancelled))
    ).toBe('userRejected')
    expect(classifyConnectError({ code: 5000, message: 'User rejected.' })).toBe('userRejected')
    expect(classifyConnectError({ code: 4001, message: 'nope' })).toBe('userRejected')
    expect(classifyConnectError(new Error('User rejected the request'))).toBe('userRejected')
    expect(classifyConnectError(new Error('boom'))).toBeUndefined()
    expect(classifyConnectError('weird')).toBeUndefined()
    expect(classifyConnectError(null)).toBeUndefined()
  })
})

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

  it('shows all three methods in order, direct pre-selected by default without opening it', async () => {
    const { adapter } = createDialogAdapter()
    mocks.signClient.connect.mockReturnValue(new Promise(() => undefined))
    void adapter.connect()
    expect(dialogOptions.methods).toEqual(['direct', 'walletconnect', 'liquid'])
    expect(dialogOptions.defaultMethod).toBe('direct')
    // An implicit Direct default shows the idle panel: nothing starts until the button click.
    expect(openCalls).toBe(0)
    expect(dialogSetState).not.toHaveBeenCalled()
    expect(mocks.signClient.connect).not.toHaveBeenCalled()
    dialogOptions.onSelectMethod('direct')
    expect(openCalls).toBe(1)
  })

  it('starts walletconnect lazily when its tab is selected after the implicit direct default', () => {
    const { adapter } = createDialogAdapter()
    mocks.signClient.connect.mockReturnValue(new Promise(() => undefined))
    void adapter.connect()
    expect(mocks.signClientInit).not.toHaveBeenCalled()
    dialogOptions.onSelectMethod('walletconnect')
    expect(dialogSetState).toHaveBeenCalledWith('walletconnect', { status: 'connecting' })
    expect(openCalls).toBe(0)
  })

  it('pre-selects and auto-starts walletconnect when defaultMethod is walletconnect', () => {
    const { adapter } = createDialogAdapter({ defaultMethod: 'walletconnect' })
    mocks.signClient.connect.mockReturnValue(new Promise(() => undefined))
    void adapter.connect()
    expect(dialogOptions.defaultMethod).toBe('walletconnect')
    expect(dialogSetState).toHaveBeenCalledWith('walletconnect', { status: 'connecting' })
    expect(openCalls).toBe(0)
  })

  it('keeps walletconnect as the auto-started default when the integrator has their own onDisplayUri', async () => {
    const onDisplayUri = vi.fn()
    const { adapter } = createAdapter({ onDisplayUri })
    mocks.signClient.connect.mockResolvedValue({
      uri: 'wc:uri',
      approval: () => new Promise(() => undefined)
    })
    void adapter.connect()
    expect(dialogOptions.methods).toEqual(['direct', 'walletconnect', 'liquid'])
    expect(dialogOptions.defaultMethod).toBe('walletconnect')
    await vi.waitFor(() => expect(onDisplayUri).toHaveBeenCalledWith('wc:uri', expect.anything()))
    expect(openCalls).toBe(0)
  })

  it('defaults to walletconnect when direct is disabled, liquid when only liquid remains', () => {
    const a = createDialogAdapter({ direct: false })
    mocks.signClient.connect.mockReturnValue(new Promise(() => undefined))
    void a.adapter.connect()
    expect(dialogOptions.methods).toEqual(['walletconnect', 'liquid'])
    expect(dialogOptions.defaultMethod).toBe('walletconnect')
    expect(dialogSetState).toHaveBeenCalledWith('walletconnect', { status: 'connecting' })

    const b = createDialogAdapter({ direct: false, walletconnect: false })
    void b.adapter.connect().catch(() => undefined)
    expect(dialogOptions.methods).toEqual(['liquid'])
    expect(dialogOptions.defaultMethod).toBe('liquid')
  })

  it('defaults to direct without auto-opening when walletconnect is disabled', () => {
    const { adapter } = createDialogAdapter({ walletconnect: false })
    void adapter.connect().catch(() => undefined)
    expect(dialogOptions.methods).toEqual(['direct', 'liquid'])
    expect(dialogOptions.defaultMethod).toBe('direct')
    expect(openCalls).toBe(0)
    dialogOptions.onSelectMethod('direct')
    expect(openCalls).toBe(1)
  })

  it('opens the popup immediately for connect({ method: "direct" })', () => {
    const { adapter } = createDialogAdapter()
    void adapter.connect({ method: 'direct' }).catch(() => undefined)
    expect(openCalls).toBe(1)
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

  it('logs the raw error of a failed method (the dialog only shows generic copy)', async () => {
    const { adapter } = createDialogAdapter({ defaultMethod: 'walletconnect' })
    const warn = vi.spyOn(adapter['logger'], 'warn').mockImplementation(() => undefined)
    mocks.signClient.connect.mockRejectedValue(new Error('relay exploded'))
    void adapter.connect().catch(() => undefined)
    await vi.waitFor(() =>
      expect(dialogSetState).toHaveBeenCalledWith(
        'walletconnect',
        expect.objectContaining({ status: 'error', error: 'relay exploded' })
      )
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('walletconnect'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('relay exploded'))
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
    const { adapter } = createDialogAdapter({ defaultMethod: 'walletconnect' })
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
    expect(openCalls).toBe(0)
    dialogOptions.onSelectMethod('direct')
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

describe('BiatecWalletAdapter — losing transports are aborted', () => {
  it('aborts losing attempts and a late WalletConnect completion never writes accounts', async () => {
    const WALLET_ORIGIN = 'https://wallet.biatec.io'
    const popup = {
      closed: false,
      postMessage: vi.fn(),
      close: vi.fn(),
      focus: vi.fn()
    }
    const listeners = new Set<(event: { origin: string; source: unknown; data: unknown }) => void>()
    vi.stubGlobal('window', {
      location: { origin: 'https://dapp.example' },
      open: () => popup,
      addEventListener: (_t: string, l: never) => listeners.add(l),
      removeEventListener: (_t: string, l: never) => listeners.delete(l)
    })
    let dialogOptions!: Parameters<typeof connectDialog.openConnectDialog>[0]
    vi.mocked(connectDialog.openConnectDialog).mockImplementation((options) => {
      dialogOptions = options
      return { close: vi.fn(), setState: vi.fn() }
    })
    let approveWalletConnect!: () => void
    mocks.signClient.connect.mockResolvedValue({
      uri: 'wc:uri',
      approval: () =>
        new Promise((resolve) => {
          approveWalletConnect = () =>
            resolve({
              topic: 't1',
              namespaces: {
                algorand: {
                  accounts: [`algorand:x:${ADDR1}`],
                  methods: ['algo_signTxn'],
                  events: []
                }
              }
            })
        })
    })

    const { adapter } = createAdapter(
      { liquid: false, defaultMethod: 'walletconnect' },
      undefined,
      {
        withOnDisplayUri: false
      }
    )
    const connecting = adapter.connect()
    await vi.waitFor(() => expect(typeof approveWalletConnect).toBe('function'))
    dialogOptions.onSelectMethod('direct')
    const send = (data: unknown) => {
      for (const l of [...listeners]) l({ origin: WALLET_ORIGIN, source: popup, data })
    }
    send({
      v: 1,
      reference: 'biatec:direct:ready',
      capabilities: { methods: [], genesisHashes: [] }
    })
    await vi.waitFor(() => expect(popup.postMessage).toHaveBeenCalledTimes(1))
    const request = popup.postMessage.mock.calls[0][0]
    const direct = algosdk.generateAccount().addr.toString()
    send({
      id: 'w',
      requestId: request.id,
      reference: 'arc0027:enable:response',
      result: {
        providerId: 'wallet',
        genesisHash: request.params.genesisHash,
        accounts: [{ address: direct }]
      }
    })
    await connecting

    // The WalletConnect attempt finishes AFTER Direct won: it must not touch the store.
    approveWalletConnect()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(adapter.accounts.map((a) => a.address)).toEqual([direct])
    expect(adapter.accounts[0].metadata).toMatchObject({ method: 'direct' })
  })
})

describe('BiatecWalletAdapter — picker-only mode reports a failed explicit Direct pick at once', () => {
  it('rejects connect() immediately when the user picked Direct and its popup was blocked', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://dapp.example' },
      open: () => null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    })
    let dialogOptions!: Parameters<typeof connectDialog.openConnectDialog>[0]
    const close = vi.fn()
    vi.mocked(connectDialog.openConnectDialog).mockImplementation((options) => {
      dialogOptions = options
      return { close, setState: vi.fn() }
    })
    // WalletConnect pairing that never completes (as in real life until the QR is scanned).
    mocks.signClient.connect.mockResolvedValue({
      uri: 'wc:uri',
      approval: () => new Promise(() => undefined)
    })
    const { adapter } = createAdapter() // onDisplayUri set => picker-only dialog
    const connecting = adapter.connect()
    expect(dialogOptions.showContent).toBe(false)
    dialogOptions.onSelectMethod('direct')
    await expect(connecting).rejects.toBeInstanceOf(PopupBlockedError)
    expect(close).toHaveBeenCalled()
  })

  it('passes a localized error kind (not the raw message) to the content dialog', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://dapp.example' },
      open: () => null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    })
    let dialogOptions!: Parameters<typeof connectDialog.openConnectDialog>[0]
    const setState = vi.fn()
    vi.mocked(connectDialog.openConnectDialog).mockImplementation((options) => {
      dialogOptions = options
      return { close: vi.fn(), setState }
    })
    mocks.signClient.connect.mockReturnValue(new Promise(() => undefined))
    const { adapter } = createAdapter({}, undefined, { withOnDisplayUri: false })
    void adapter.connect().catch(() => undefined)
    dialogOptions.onSelectMethod('direct')
    await vi.waitFor(() =>
      expect(setState).toHaveBeenCalledWith(
        'direct',
        expect.objectContaining({ status: 'popup-blocked', errorKind: 'popupBlocked' })
      )
    )
  })
})

// ---------- projectId is optional: WalletConnect is only enabled with one ----- //

describe('BiatecWalletAdapter — optional projectId', () => {
  function createBare(options: BiatecWalletOptions = {}, state?: Partial<State>) {
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
      options
    })
    return adapter
  }

  /** Opens the (mocked) dialog, cancels it, and returns what it was given. */
  async function dialogOptions(adapter: BiatecWalletAdapter) {
    vi.mocked(connectDialog.openConnectDialog).mockImplementationOnce((opts) => {
      opts.onCancel()
      return { close: vi.fn(), setState: vi.fn() }
    })
    await expect(adapter.connect()).rejects.toThrow('Connection cancelled')
    return vi.mocked(connectDialog.openConnectDialog).mock.calls[0][0]
  }

  it('defaults to Direct and Liquid Auth without a projectId', async () => {
    const options = await dialogOptions(createBare())
    expect(options.methods).toEqual(['direct', 'liquid'])
    expect(options.defaultMethod).toBe('direct')
    expect(mocks.signClientInit).not.toHaveBeenCalled()
  })

  it.each(['', '   '])('treats projectId %j as absent', async (projectId) => {
    const options = await dialogOptions(createBare({ projectId }))
    expect(options.methods).toEqual(['direct', 'liquid'])
  })

  it('offers all three methods, in order, with a projectId', async () => {
    const options = await dialogOptions(createBare({ projectId: 'abc' }))
    expect(options.methods).toEqual(['direct', 'walletconnect', 'liquid'])
  })

  it('walletconnect: false disables WalletConnect even with a projectId', async () => {
    const options = await dialogOptions(createBare({ projectId: 'abc', walletconnect: false }))
    expect(options.methods).toEqual(['direct', 'liquid'])
  })

  it('liquid: false without a projectId leaves Direct only', () => {
    const adapter = createBare({ liquid: false })
    expect(adapter.directWalletOrigin).not.toBeNull()
    expect(adapter.walletInfo).toBeNull()
  })

  it('throws an actionable error when no method is enabled', () => {
    expect(() => createBare({ direct: false, liquid: false })).toThrow(
      /At least one connection method.*WalletConnect.*projectId/s
    )
  })

  it("throws a hint when defaultMethod is 'walletconnect' but there is no projectId", () => {
    expect(() => createBare({ defaultMethod: 'walletconnect' })).toThrow(
      /defaultMethod "walletconnect" is not an enabled connection method.*projectId/
    )
  })

  it.each([
    ['tagged walletconnect', { method: 'walletconnect' }],
    ['legacy untagged', undefined]
  ])(
    'resumeSession drops a persisted %s session when WalletConnect is not enabled',
    async (_n, metadata) => {
      const account = { name: 'a', address: ADDR1, ...(metadata ? { metadata } : {}) }
      const adapter = createBare(
        {},
        { wallets: { [WALLET_ID]: { accounts: [account], activeAccount: account } } }
      )

      await expect(adapter.resumeSession()).resolves.toBeUndefined()

      expect(adapter.isConnected).toBe(false)
      expect(mocks.signClientInit).not.toHaveBeenCalled()
    }
  )
})
