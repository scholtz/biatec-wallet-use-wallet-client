import { useWallet } from '@txnlab/use-wallet-react'
import { useState, type CSSProperties } from 'react'
import { closeWalletConnectDialog } from './walletManager'

/**
 * Renders every registered wallet as a connect/disconnect button, and an
 * account switcher for the wallet that is currently active. Works for any
 * wallet in `wallets` (only Biatec Wallet is registered in this example),
 * so this component doesn't hardcode anything Biatec-specific.
 *
 * `wallet.connect()` here doesn't pass a `method`, so Biatec's built-in method picker
 * (WalletConnect vs. Liquid Auth) shows first — before `<ConnectQrDialog>` ever receives a URI.
 */
export function ConnectWallet() {
  const { wallets, activeWallet, activeAddress } = useWallet()
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = async (walletId: string) => {
    const wallet = wallets.find((w) => w.id === walletId)
    if (!wallet) return
    setError(null)
    setConnecting(walletId)
    try {
      await wallet.connect()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setConnecting(null)
      // The QR dialog (walletManager.ts's onDisplayUri) only knows to open itself; it doesn't
      // know when connect() settles, so close it explicitly here — on success and on failure.
      closeWalletConnectDialog()
    }
  }

  const pillButton: CSSProperties = {
    padding: '0.5rem 1rem',
    borderRadius: 999,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: 'pointer'
  }
  const ghostButton: CSSProperties = {
    ...pillButton,
    background: 'var(--accent-soft)',
    color: 'var(--text)'
  }

  return (
    <div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem'
        }}
      >
        {wallets.map((wallet) => (
          <li
            key={wallet.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.6rem 0.8rem',
              borderRadius: 16,
              background: 'var(--accent-soft)'
            }}
          >
            <img src={wallet.metadata.icon} alt="" width={28} height={28} />
            <span style={{ flex: 1, fontWeight: 600 }}>{wallet.metadata.name}</span>

            {wallet.isConnected ? (
              <>
                {wallet.accounts.length > 1 && (
                  <select
                    value={wallet.activeAccount?.address ?? ''}
                    onChange={(e) => wallet.setActiveAccount(e.target.value)}
                    style={{ borderRadius: 8, padding: '0.3rem' }}
                  >
                    {wallet.accounts.map((account) => (
                      <option key={account.address} value={account.address}>
                        {account.name} ({account.address.slice(0, 6)}…{account.address.slice(-4)})
                      </option>
                    ))}
                  </select>
                )}
                {!wallet.isActive && (
                  <button style={ghostButton} onClick={() => wallet.setActive()}>
                    Use this wallet
                  </button>
                )}
                <button style={ghostButton} onClick={() => wallet.disconnect()}>
                  Disconnect
                </button>
              </>
            ) : (
              <button
                style={pillButton}
                onClick={() => handleConnect(wallet.id)}
                disabled={connecting === wallet.id}
              >
                {connecting === wallet.id ? 'Connecting…' : 'Connect'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {activeWallet && activeAddress && (
        <p style={{ color: 'var(--muted)' }}>
          Active: <strong style={{ color: 'var(--text)' }}>{activeWallet.metadata.name}</strong> —{' '}
          <code>{activeAddress}</code>
        </p>
      )}
    </div>
  )
}
