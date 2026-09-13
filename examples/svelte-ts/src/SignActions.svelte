<script lang="ts">
  import algosdk from 'algosdk'
  import { ScopeType, useWallet } from '@txnlab/use-wallet-svelte'

  /**
   * Demonstrates the two things a connected wallet can do through use-wallet:
   * ARC-0001 transaction signing and ARC-0060 arbitrary data signing.
   * Both calls are wallet-agnostic — nothing here is Biatec-specific.
   */
  const wallet = useWallet()
  let log = $state<string[]>([])
  let busy = $state(false)

  function append(line: string) {
    log = [...log, line]
  }

  async function handleSignTransaction() {
    const address = wallet.activeAddress.current
    if (!address) return
    busy = true
    try {
      const suggestedParams = await wallet.algodClient.current.getTransactionParams().do()
      // A 0 ALGO self-payment: safe to sign repeatedly, never actually sent.
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: address,
        receiver: address,
        amount: 0,
        suggestedParams
      })

      const [signed] = await wallet.signTransactions([txn])
      append(
        signed
          ? `Signed transaction (${signed.length} bytes). Not submitted to the network.`
          : 'Wallet declined to sign this transaction.'
      )
    } catch (e) {
      append(`Sign transaction failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      busy = false
    }
  }

  async function handleSignData() {
    const activeWallet = wallet.activeWallet()
    if (!activeWallet) return
    busy = true
    try {
      if (!activeWallet.canSignData) {
        append(`${activeWallet.metadata.name} does not support signData.`)
        return
      }
      const message = `Sign in to example dApp — ${new Date().toISOString()}`
      const data = btoa(message)
      const result = await wallet.signData(data, { scope: ScopeType.AUTH, encoding: 'base64' })
      const signatureB64 = btoa(String.fromCharCode(...result.signature))
      append(`Signed data "${message}" → signature ${signatureB64.slice(0, 24)}…`)
    } catch (e) {
      append(`Sign data failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      busy = false
    }
  }
</script>

{#if wallet.activeWallet() && wallet.activeAddress.current}
  <div>
    <div class="buttons">
      <button class="button" disabled={busy} onclick={handleSignTransaction}>
        Sign 0 ALGO self-payment
      </button>
      <button
        class="button"
        style="opacity: {!wallet.activeWallet()?.canSignData ? 0.5 : 1}"
        disabled={busy || !wallet.activeWallet()?.canSignData}
        onclick={handleSignData}
      >
        Sign data (ARC-0060)
      </button>
    </div>
    <pre class="log">{log.join('\n') || '// output appears here'}</pre>
  </div>
{/if}

<style>
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
