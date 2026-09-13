import { useWallet } from '@txnlab/use-wallet-solid'
import { createSignal, For, Show, type JSX } from 'solid-js'

/**
 * Renders every registered wallet as a connect/disconnect button, and an
 * account switcher for the wallet that is currently active. Works for any
 * wallet in `wallets` (only Biatec Wallet is registered in this example),
 * so this component doesn't hardcode anything Biatec-specific.
 *
 * `wallet.connect()` here doesn't pass a `method` or `onDisplayUri`, so Biatec's built-in
 * connect dialog handles everything: method selector on the left, live QR on the right, all in
 * one window — see src/connect-dialog.ts in the adapter package.
 */
export function ConnectWallet() {
  const { wallets, activeWallet, activeAddress } = useWallet()
  const [connecting, setConnecting] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  const handleConnect = async (walletId: string) => {
    const wallet = wallets().find((w) => w.id === walletId)
    if (!wallet) return
    setError(null)
    setConnecting(walletId)
    try {
      await wallet.connect()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setConnecting(null)
    }
  }

  const pillButton: JSX.CSSProperties = {
    padding: '0.5rem 1rem',
    'border-radius': '999px',
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    'font-weight': 600,
    'font-size': '0.85rem',
    cursor: 'pointer'
  }
  const ghostButton: JSX.CSSProperties = {
    ...pillButton,
    background: 'var(--accent-soft)',
    color: 'var(--text)'
  }

  return (
    <div>
      <ul
        style={{
          'list-style': 'none',
          padding: 0,
          display: 'flex',
          'flex-direction': 'column',
          gap: '0.6rem'
        }}
      >
        <For each={wallets()}>
          {(wallet) => (
            <li
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '0.75rem',
                padding: '0.6rem 0.8rem',
                'border-radius': '16px',
                background: 'var(--accent-soft)'
              }}
            >
              <img src={wallet.metadata.icon} alt="" width={28} height={28} />
              <span style={{ flex: 1, 'font-weight': 600 }}>{wallet.metadata.name}</span>

              <Show
                when={wallet.isConnected}
                fallback={
                  <button
                    style={pillButton}
                    onClick={() => handleConnect(wallet.id)}
                    disabled={connecting() === wallet.id}
                  >
                    {connecting() === wallet.id ? 'Connecting…' : 'Connect'}
                  </button>
                }
              >
                <Show when={wallet.accounts.length > 1}>
                  <select
                    value={wallet.activeAccount?.address ?? ''}
                    onChange={(e) => wallet.setActiveAccount(e.currentTarget.value)}
                    style={{ 'border-radius': '8px', padding: '0.3rem' }}
                  >
                    <For each={wallet.accounts}>
                      {(account) => (
                        <option value={account.address}>
                          {account.name} ({account.address.slice(0, 6)}…{account.address.slice(-4)})
                        </option>
                      )}
                    </For>
                  </select>
                </Show>
                <Show when={!wallet.isActive}>
                  <button style={ghostButton} onClick={() => wallet.setActive()}>
                    Use this wallet
                  </button>
                </Show>
                <button style={ghostButton} onClick={() => wallet.disconnect()}>
                  Disconnect
                </button>
              </Show>
            </li>
          )}
        </For>
      </ul>

      <Show when={error()}>
        <p style={{ color: '#dc2626' }}>{error()}</p>
      </Show>

      <Show when={activeWallet() && activeAddress()}>
        <p style={{ color: 'var(--muted)' }}>
          Active: <strong style={{ color: 'var(--text)' }}>{activeWallet()!.metadata.name}</strong>{' '}
          — <code>{activeAddress()}</code>
        </p>
      </Show>
    </div>
  )
}
