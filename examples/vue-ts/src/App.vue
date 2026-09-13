<script setup lang="ts">
import { useWallet } from '@txnlab/use-wallet-vue'
import ConnectWallet from './ConnectWallet.vue'
import NetworkSwitcher from './NetworkSwitcher.vue'
import SignActions from './SignActions.vue'
import ThemeToggle from './ThemeToggle.vue'

const { isReady, activeAddress } = useWallet()
</script>

<template>
  <main class="page">
    <div class="card">
      <div class="header">
        <h1>Biatec Wallet × use-wallet (Vue)</h1>
        <ThemeToggle />
      </div>
      <p class="muted">
        Minimal dApp showing how to integrate
        <a href="https://wallet.biatec.io" target="_blank" rel="noreferrer">Biatec Wallet</a>
        through <code>@txnlab/use-wallet-vue</code> and the
        <code>biatec-wallet-use-wallet-client</code> adapter from this repository.
      </p>

      <div class="network">
        <NetworkSwitcher />
      </div>

      <p v-if="!isReady">Loading wallet manager…</p>
      <ConnectWallet v-else />

      <template v-if="activeAddress">
        <h2 class="sign-heading">Sign something</h2>
        <SignActions />
      </template>
    </div>
  </main>
</template>

<style scoped>
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
