import algosdk from 'algosdk'
import { ScopeType, useWallet } from '@txnlab/use-wallet-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

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

  // Suggested params are fetched BEFORE the click (and refreshed on a timer), so the click handler
  // can build the transaction and call signTransactions with NO `await` in between: the Biatec
  // Direct popup must be opened inside the user's gesture or the browser blocks it.
  const paramsRef = useRef<algosdk.SuggestedParams | null>(null)
  useEffect(() => {
    const refresh = () =>
      algodClient
        .getTransactionParams()
        .do()
        .then((params) => (paramsRef.current = params))
        .catch(() => undefined)
    void refresh()
    const timer = setInterval(refresh, 20_000)
    return () => clearInterval(timer)
  }, [algodClient])

  if (!activeWallet || !activeAddress) return null

  const handleSignTransaction = async () => {
    setBusy(true)
    try {
      const suggestedParams = paramsRef.current
      if (!suggestedParams) {
        append('Suggested params not loaded yet; click again in a moment.')
        return
      }
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
      append(
        e instanceof Error && e.name === 'PopupBlockedError'
          ? 'Popup blocked: allow popups for this site, then click again.'
          : `Sign transaction failed: ${e instanceof Error ? e.message : String(e)}`
      )
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

  const button: CSSProperties = {
    padding: '0.5rem 1rem',
    borderRadius: 999,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: 'pointer'
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button style={button} onClick={handleSignTransaction} disabled={busy}>
          Sign 0 ALGO self-payment
        </button>
        <button
          style={{ ...button, opacity: !activeWallet.canSignData ? 0.5 : 1 }}
          onClick={handleSignData}
          disabled={busy || !activeWallet.canSignData}
        >
          Sign data (ARC-0060)
        </button>
      </div>
      <pre
        style={{
          background: 'var(--accent-soft)',
          color: 'var(--text)',
          borderRadius: 12,
          padding: '1rem',
          marginTop: '1rem',
          overflowX: 'auto'
        }}
      >
        {log.join('\n') || '// output appears here'}
      </pre>
    </div>
  )
}
