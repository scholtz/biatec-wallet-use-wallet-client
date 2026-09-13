<script setup lang="ts">
import { useWallet } from '@txnlab/use-wallet-vue'
import { ref } from 'vue'

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
const { wallets, activeWallet, activeAddress } = useWallet()
const connecting = ref<string | null>(null)
const error = ref<string | null>(null)

async function handleConnect(walletId: string) {
  const wallet = wallets.value.find((w) => w.id === walletId)
  if (!wallet) return
  error.value = null
  connecting.value = walletId
  try {
    await wallet.connect()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    connecting.value = null
  }
}
</script>

<template>
  <div>
    <ul class="wallet-list">
      <li v-for="wallet in wallets" :key="wallet.id" class="wallet-row">
        <img :src="wallet.metadata.icon" alt="" width="28" height="28" />
        <span class="wallet-name">{{ wallet.metadata.name }}</span>

        <template v-if="wallet.isConnected">
          <select
            v-if="wallet.accounts.length > 1"
            :value="wallet.activeAccount?.address ?? ''"
            aria-label="Active account"
            @change="wallet.setActiveAccount(($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="account in wallet.accounts"
              :key="account.address"
              :value="account.address"
            >
              {{ account.name }} ({{ account.address.slice(0, 6) }}…{{ account.address.slice(-4) }})
            </option>
          </select>
          <button v-if="!wallet.isActive" class="ghost" @click="wallet.setActive()">
            Use this wallet
          </button>
          <button class="ghost" @click="wallet.disconnect()">Disconnect</button>
        </template>
        <button
          v-else
          class="pill"
          :disabled="connecting === wallet.id"
          @click="handleConnect(wallet.id)"
        >
          {{ connecting === wallet.id ? 'Connecting…' : 'Connect' }}
        </button>
      </li>
    </ul>

    <p v-if="error" class="error">{{ error }}</p>

    <p v-if="activeWallet && activeAddress" class="active-line">
      Active: <strong>{{ activeWallet.metadata.name }}</strong> — <code>{{ activeAddress }}</code>
    </p>
  </div>
</template>

<style scoped>
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
