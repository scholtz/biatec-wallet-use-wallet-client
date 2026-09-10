import { useWallet } from '@txnlab/use-wallet-react'
import { ConnectQrDialog } from './ConnectQrDialog'
import { ConnectWallet } from './ConnectWallet'
import { NetworkSwitcher } from './NetworkSwitcher'
import { SignActions } from './SignActions'

export function App() {
  const { isReady, activeAddress } = useWallet()

  return (
    <main
      style={{
        maxWidth: 640,
        margin: '2rem auto',
        padding: '0 1rem',
        fontFamily: 'system-ui, sans-serif'
      }}
    >
      <h1>Biatec Wallet × use-wallet (React)</h1>
      <p>
        Minimal dApp showing how to integrate{' '}
        <a href="https://wallet.biatec.io" target="_blank" rel="noreferrer">
          Biatec Wallet
        </a>{' '}
        through <code>@txnlab/use-wallet-react</code> and the{' '}
        <code>biatec-wallet-use-wallet-client</code> adapter from this repository.
      </p>

      <div style={{ margin: '1rem 0' }}>
        <NetworkSwitcher />
      </div>

      {!isReady ? <p>Loading wallet manager…</p> : <ConnectWallet />}

      {activeAddress && (
        <>
          <h2>Sign something</h2>
          <SignActions />
        </>
      )}

      <ConnectQrDialog />
    </main>
  )
}
