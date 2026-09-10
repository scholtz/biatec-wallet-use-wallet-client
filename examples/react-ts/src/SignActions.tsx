import algosdk from 'algosdk'
import { ScopeType, useWallet } from '@txnlab/use-wallet-react'
import { useState } from 'react'

/**
 * Demonstrates the two things a connected wallet can do through use-wallet:
 * ARC-0001 transaction signing and ARC-0060 arbitrary data signing.
 * Both calls are wallet-agnostic — nothing here is Biatec-specific.
 */
export function SignActions() {
  const { activeWallet, activeAddress, algodClient, signTransactions, signData } = useWallet()
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const append = (line: string) => setLog((prev) => [...prev, line])

  if (!activeWallet || !activeAddress) return null

  const handleSignTransaction = async () => {
    setBusy(true)
    try {
      const suggestedParams = await algodClient.getTransactionParams().do()
      // A 0 ALGO self-payment: safe to sign repeatedly, never actually sent.
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: activeAddress,
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
    setBusy(true)
    try {
      if (!activeWallet.canSignData) {
        append(`${activeWallet.metadata.name} does not support signData.`)
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

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={handleSignTransaction} disabled={busy}>
          Sign 0 ALGO self-payment
        </button>
        <button onClick={handleSignData} disabled={busy || !activeWallet.canSignData}>
          Sign data (ARC-0060)
        </button>
      </div>
      <pre style={{ background: '#f3f3f3', padding: '1rem', marginTop: '1rem', overflowX: 'auto' }}>
        {log.join('\n') || '// output appears here'}
      </pre>
    </div>
  )
}
