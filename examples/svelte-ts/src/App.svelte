<script lang="ts">
  import { useWallet, useWalletContext } from '@txnlab/use-wallet-svelte'
  import ConnectWallet from './ConnectWallet.svelte'
  import NetworkSwitcher from './NetworkSwitcher.svelte'
  import SignActions from './SignActions.svelte'
  import ThemeToggle from './ThemeToggle.svelte'
  import { walletManager } from './walletManager'

  // Registers `walletManager` on Svelte context so useWallet()/useNetwork() work in any
  // descendant component — must run during this (root) component's initialization.
  useWalletContext(walletManager)

  const wallet = useWallet()
</script>

<main class="page">
  <div class="card">
    <div class="header">
      <h1>Biatec Wallet × use-wallet (Svelte)</h1>
      <ThemeToggle />
    </div>
    <p class="muted">
      Minimal dApp showing how to integrate
      <a href="https://wallet.biatec.io" target="_blank" rel="noreferrer">Biatec Wallet</a>
      through <code>@txnlab/use-wallet-svelte</code> and the
      <code>biatec-wallet-use-wallet-client</code> adapter from this repository.
    </p>

    <div class="network">
      <NetworkSwitcher />
    </div>

    {#if !wallet.isReady()}
      <p>Loading wallet manager…</p>
    {:else}
      <ConnectWallet />
    {/if}

    {#if wallet.activeAddress.current}
      <h2 class="sign-heading">Sign something</h2>
      <SignActions />
    {/if}
  </div>
</main>

<style>
  .page {
    max-width: 640px;
    margin: 3rem auto;
    padding: 0 1rem;
  }
  .card {
    background: var(--card-bg);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid var(--card-border);
    border-radius: 24px;
    box-shadow: var(--shadow);
    padding: 2rem;
  }
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  h1 {
    margin: 0;
    font-size: 1.4rem;
  }
  .muted {
    color: var(--muted);
    line-height: 1.5;
  }
  .network {
    margin: 1.25rem 0;
  }
  .sign-heading {
    font-size: 1.05rem;
  }
</style>
