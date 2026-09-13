<script setup lang="ts">
import algosdk from 'algosdk'
import { ScopeType, useWallet } from '@txnlab/use-wallet-vue'
import { ref } from 'vue'

/**
 * Demonstrates the two things a connected wallet can do through use-wallet:
 * ARC-0001 transaction signing and ARC-0060 arbitrary data signing.
 * Both calls are wallet-agnostic — nothing here is Biatec-specific.
 */
const { activeWallet, activeAddress, algodClient, signTransactions, signData } = useWallet()
const log = ref<string[]>([])
const busy = ref(false)

function append(line: string) {
  log.value = [...log.value, line]
}

async function handleSignTransaction() {
  if (!activeAddress.value) return
  busy.value = true
  try {
    const suggestedParams = await algodClient.value.getTransactionParams().do()
    // A 0 ALGO self-payment: safe to sign repeatedly, never actually sent.
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: activeAddress.value,
      receiver: activeAddress.value,
      amount: 0,
      suggestedParams
    })

    const [signed] = await signTransactions([txn])
    append(
      signed
        ? `Signed transaction (${signed.length} bytes). Not submitted to the network.`
        : 'Wallet declined to sign this transaction.'
    )
  } catch (e) {
    append(`Sign transaction failed: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    busy.value = false
  }
}

async function handleSignData() {
  if (!activeWallet.value) return
  busy.value = true
  try {
    if (!activeWallet.value.canSignData) {
      append(`${activeWallet.value.metadata.name} does not support signData.`)
      return
    }
    const message = `Sign in to example dApp — ${new Date().toISOString()}`
    const data = btoa(message)
    const result = await signData(data, { scope: ScopeType.AUTH, encoding: 'base64' })
    const signatureB64 = btoa(String.fromCharCode(...result.signature))
    append(`Signed data "${message}" → signature ${signatureB64.slice(0, 24)}…`)
  } catch (e) {
    append(`Sign data failed: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="activeWallet && activeAddress">
    <div class="buttons">
      <button class="button" :disabled="busy" @click="handleSignTransaction">
        Sign 0 ALGO self-payment
      </button>
      <button
        class="button"
        :style="{ opacity: !activeWallet.canSignData ? 0.5 : 1 }"
        :disabled="busy || !activeWallet.canSignData"
        @click="handleSignData"
      >
        Sign data (ARC-0060)
      </button>
    </div>
    <pre class="log">{{ log.join('\n') || '// output appears here' }}</pre>
  </div>
</template>

<style scoped>
.buttons {
  display: flex;
  gap: 0.5rem;
}
.button {
  padding: 0.5rem 1rem;
  border-radius: 999px;
  border: none;
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.log {
  background: var(--accent-soft);
  color: var(--text);
  border-radius: 12px;
  padding: 1rem;
  margin-top: 1rem;
  overflow-x: auto;
}
</style>
