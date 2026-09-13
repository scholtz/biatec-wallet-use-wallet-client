import { useWallet } from '@txnlab/use-wallet-solid'
import { Show } from 'solid-js'
import { ConnectWallet } from './ConnectWallet'
import { NetworkSwitcher } from './NetworkSwitcher'
import { SignActions } from './SignActions'
import { ThemeToggle } from './ThemeToggle'

export function App() {
  const { isReady, activeAddress } = useWallet()

  return (
    <main style={{ 'max-width': '640px', margin: '3rem auto', padding: '0 1rem' }}>
      <div
        style={{
          background: 'var(--card-bg)',
          'backdrop-filter': 'blur(20px) saturate(180%)',
          '-webkit-backdrop-filter': 'blur(20px) saturate(180%)',
          border: '1px solid var(--card-border)',
          'border-radius': '24px',
          'box-shadow': 'var(--shadow)',
          padding: '2rem'
        }}
      >
        <div
          style={{
            display: 'flex',
            'align-items': 'flex-start',
            'justify-content': 'space-between',
            gap: '1rem'
          }}
        >
          <h1 style={{ margin: 0, 'font-size': '1.4rem' }}>Biatec Wallet × use-wallet (Solid)</h1>
          <ThemeToggle />
        </div>
        <p style={{ color: 'var(--muted)', 'line-height': 1.5 }}>
          Minimal dApp showing how to integrate{' '}
          <a href="https://wallet.biatec.io" target="_blank" rel="noreferrer">
            Biatec Wallet
          </a>{' '}
          through <code>@txnlab/use-wallet-solid</code> and the{' '}
          <code>biatec-wallet-use-wallet-client</code> adapter from this repository.
        </p>

        <div style={{ margin: '1.25rem 0' }}>
          <NetworkSwitcher />
        </div>

        <Show when={isReady()} fallback={<p>Loading wallet manager…</p>}>
          <ConnectWallet />
        </Show>

        <Show when={activeAddress()}>
          <h2 style={{ 'font-size': '1.05rem' }}>Sign something</h2>
          <SignActions />
        </Show>
      </div>
    </main>
  )
}
