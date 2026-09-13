<script lang="ts">
  import { useWallet } from '@txnlab/use-wallet-svelte'

  /**
   * Renders every registered wallet as a connect/disconnect button, and an
   * account switcher for the wallet that is currently active. Works for any
   * wallet in `wallets` (only Biatec Wallet is registered in this example),
   * so this component doesn't hardcode anything Biatec-specific.
   *
   * `wallet.connect()` here doesn't pass a `method` or `onDisplayUri`, so Biatec's built-in
   * connect dialog handles everything: method selector on the left, live QR on the right, all
   * in one window — see src/connect-dialog.ts in the adapter package.
   */
  const wallet = useWallet()
  let connecting = $state<string | null>(null)
  let error = $state<string | null>(null)

  async function handleConnect(walletId: string) {
    const w = wallet.wallets.find((x) => x.id === walletId)
    if (!w) return
    error = null
    connecting = walletId
    try {
      await w.connect()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      connecting = null
    }
  }
</script>

<div>
  <ul class="wallet-list">
    {#each wallet.wallets as w (w.id)}
      <li class="wallet-row">
        <img src={w.metadata.icon} alt="" width="28" height="28" />
        <span class="wallet-name">{w.metadata.name}</span>

        {#if w.isConnected()}
          {#if (w.accounts.current?.length ?? 0) > 1}
            <select
              value={w.accounts.current?.[0]?.address ?? ''}
              onchange={(e) => w.setActiveAccount((e.target as HTMLSelectElement).value)}
            >
              {#each w.accounts.current ?? [] as account (account.address)}
                <option value={account.address}
                  >{account.name} ({account.address.slice(0, 6)}…{account.address.slice(
                    -4
                  )})</option
                >
              {/each}
            </select>
          {/if}
          {#if !w.isActive()}
            <button class="ghost" onclick={() => w.setActive()}>Use this wallet</button>
          {/if}
          <button class="ghost" onclick={() => w.disconnect()}>Disconnect</button>
        {:else}
          <button class="pill" disabled={connecting === w.id} onclick={() => handleConnect(w.id)}>
            {connecting === w.id ? 'Connecting…' : 'Connect'}
          </button>
        {/if}
      </li>
    {/each}
  </ul>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if wallet.activeWallet() && wallet.activeAddress.current}
    <p class="active-line">
      Active: <strong>{wallet.activeWallet()?.metadata.name}</strong> —
      <code>{wallet.activeAddress.current}</code>
    </p>
  {/if}
</div>

<style>
  .wallet-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .wallet-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.8rem;
    border-radius: 16px;
    background: var(--accent-soft);
  }
  .wallet-name {
    flex: 1;
    font-weight: 600;
  }
  select {
    border-radius: 8px;
    padding: 0.3rem;
  }
  .pill,
  .ghost {
    padding: 0.5rem 1rem;
    border-radius: 999px;
    border: none;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .pill {
    background: var(--accent);
    color: #fff;
  }
  .ghost {
    background: var(--accent-soft);
    color: var(--text);
  }
  .error {
    color: #dc2626;
  }
  .active-line {
    color: var(--muted);
  }
  .active-line strong {
    color: var(--text);
  }
</style>
