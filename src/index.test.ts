import { describe, expect, it } from 'vitest'
import * as api from './index'
import { BiatecWalletAdapter, WALLET_ID, biatec } from './index'

describe('biatec factory', () => {
  const projectId = 'test-project-id'

  it('returns the biatec wallet id, default metadata and adapter options', () => {
    const config = biatec({ projectId })

    expect(config.id).toBe(WALLET_ID)
    expect(config.metadata).toEqual(BiatecWalletAdapter.defaultMetadata)
    expect(config.Adapter).toBe(BiatecWalletAdapter)
    expect(config.options).toEqual({ projectId })
  })

  it('lets the dApp override the display metadata without leaking it into options', () => {
    const config = biatec({ projectId, displayMetadata: { name: 'My Biatec' } })

    expect(config.metadata).toEqual({
      name: 'My Biatec',
      icon: BiatecWalletAdapter.defaultMetadata.icon
    })
    expect(config.options).toEqual({ projectId })
  })

  it('keeps WalletConnect dApp metadata inside the adapter options', () => {
    const metadata = {
      name: 'My dApp',
      description: 'Example',
      url: 'https://dapp.example',
      icons: ['https://dapp.example/icon.png']
    }
    const config = biatec({ projectId, metadata })

    expect(config.options).toEqual({ projectId, metadata })
    expect(config.metadata).toEqual(BiatecWalletAdapter.defaultMetadata)
  })

  it('passes adapter-specific options through untouched', () => {
    const onDisplayUri = () => undefined
    const config = biatec({ projectId, onDisplayUri, enableSignData: false })

    expect(config.options).toEqual({
      projectId,
      onDisplayUri,
      enableSignData: false
    })
  })

  it('passes the liquid option through, including `false` to disable it', () => {
    expect(biatec({ projectId, liquid: false }).options).toEqual({ projectId, liquid: false })
    expect(biatec({ projectId, liquid: { origin: 'https://liquid.example.com' } }).options).toEqual(
      { projectId, liquid: { origin: 'https://liquid.example.com' } }
    )
  })

  it('passes the direct and walletconnect options through, without requiring a projectId', () => {
    expect(biatec({ walletconnect: false, liquid: false }).options).toEqual({
      walletconnect: false,
      liquid: false
    })
    const direct = { walletUrl: 'http://localhost:8080', popupFeatures: 'popup,width=400' }
    expect(biatec({ projectId, direct, defaultMethod: 'direct' }).options).toEqual({
      projectId,
      direct,
      defaultMethod: 'direct'
    })
    expect(biatec({ projectId, direct: false }).options).toEqual({ projectId, direct: false })
  })
})

describe('export surface', () => {
  it('exports the Direct errors and protocol constants', () => {
    expect(new api.PopupBlockedError()).toBeInstanceOf(api.SessionError)
    expect(new api.DirectNetworkMismatchError('x', 'g')).toBeInstanceOf(api.SessionError)
    expect(api.DIRECT_READY_REFERENCE).toBe('biatec:direct:ready')
    expect(api.DIRECT_PROTOCOL_VERSION).toBe(1)
    expect(api.DIRECT_ROUTE).toBe('/direct')
    expect(api.DIRECT_WINDOW_NAME).toBe('biatec-wallet-direct')
    expect(api.LiquidReference.enableRequest).toBe('arc0027:enable:request')
    expect(api.LiquidReference.enableResponse).toBe('arc0027:enable:response')
    expect(api.LiquidReference.disableRequest).toBe('arc0027:disable:request')
  })
})
