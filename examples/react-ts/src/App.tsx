import { useWallet } from '@txnlab/use-wallet-react'
import { ConnectWallet } from './ConnectWallet'
import { NetworkSwitcher } from './NetworkSwitcher'
import { SignActions } from './SignActions'

export function App() {
  const { isReady, activeAddress } = useWallet()

  return (
    <main style={{ maxWidth: 640, margin: '3rem auto', padding: '0 1rem' }}>
      <div
        style={{
          background: 'var(--card-bg)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid var(--card-border)',
          borderRadius: 24,
          boxShadow: 'var(--shadow)',
          padding: '2rem'
        }}
      >
        <h1 style={{ marginTop: 0, fontSize: '1.4rem' }}>Biatec Wallet × use-wallet (React)</h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
          Minimal dApp showing how to integrate{' '}
          <a href="https://wallet.biatec.io" target="_blank" rel="noreferrer">
            Biatec Wallet
          </a>{' '}
          through <code>@txnlab/use-wallet-react</code> and the{' '}
          <code>biatec-wallet-use-wallet-client</code> adapter from this repository.
        </p>

        <div style={{ margin: '1.25rem 0' }}>
          <NetworkSwitcher />
        </div>

        {!isReady ? <p>Loading wallet manager…</p> : <ConnectWallet />}

        {activeAddress && (
          <>
            <h2 style={{ fontSize: '1.05rem' }}>Sign something</h2>
            <SignActions />
          </>
        )}
      </div>
    </main>
  )
}
