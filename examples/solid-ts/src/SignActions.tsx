import algosdk from 'algosdk'
import { ScopeType, useWallet } from '@txnlab/use-wallet-solid'
import { createSignal, Show, type JSX } from 'solid-js'

/**
 * Demonstrates the two things a connected wallet can do through use-wallet:
 * ARC-0001 transaction signing and ARC-0060 arbitrary data signing.
 * Both calls are wallet-agnostic — nothing here is Biatec-specific.
 */
export function SignActions() {
  const { activeWallet, activeAddress, algodClient, signTransactions, signData } = useWallet()
  const [log, setLog] = createSignal<string[]>([])
  const [busy, setBusy] = createSignal(false)

  const append = (line: string) => setLog((prev) => [...prev, line])

  const handleSignTransaction = async () => {
    const address = activeAddress()
    if (!address) return
    setBusy(true)
    try {
      const suggestedParams = await algodClient().getTransactionParams().do()
      // A 0 ALGO self-payment: safe to sign repeatedly, never actually sent.
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: address,
        receiver: address,
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
      setBusy(false)
    }
  }

  const handleSignData = async () => {
    const wallet = activeWallet()
    if (!wallet) return
    setBusy(true)
    try {
      if (!wallet.canSignData) {
        append(`${wallet.metadata.name} does not support signData.`)
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
      setBusy(false)
    }
  }

  const button: JSX.CSSProperties = {
    padding: '0.5rem 1rem',
    'border-radius': '999px',
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    'font-weight': 600,
    'font-size': '0.85rem',
    cursor: 'pointer'
  }

  return (
    <Show when={activeWallet() && activeAddress()}>
      <div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button style={button} onClick={handleSignTransaction} disabled={busy()}>
            Sign 0 ALGO self-payment
          </button>
          <button
            style={{ ...button, opacity: !activeWallet()!.canSignData ? 0.5 : 1 }}
            onClick={handleSignData}
            disabled={busy() || !activeWallet()!.canSignData}
          >
            Sign data (ARC-0060)
          </button>
        </div>
        <pre
          style={{
            background: 'var(--accent-soft)',
            color: 'var(--text)',
            'border-radius': '12px',
            padding: '1rem',
            'margin-top': '1rem',
            'overflow-x': 'auto'
          }}
        >
          {log().join('\n') || '// output appears here'}
        </pre>
      </div>
    </Show>
  )
}
