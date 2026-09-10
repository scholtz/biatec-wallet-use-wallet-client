import { describe, expect, it } from 'vitest'
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
    const config = biatec({ projectId, onDisplayUri, enableSignData: false, themeMode: 'light' })

    expect(config.options).toEqual({
      projectId,
      onDisplayUri,
      enableSignData: false,
      themeMode: 'light'
    })
  })
})
