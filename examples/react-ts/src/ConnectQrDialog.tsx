import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { onWalletConnectClose, onWalletConnectUri } from './walletManager'

/**
 * Minimal WalletConnect pairing UI: just a QR code and a copy button — no wallet explorer,
 * no "get a wallet" links, nothing else. Rendered instead of the default WalletConnect modal
 * because `biatec()` was configured with `onDisplayUri` (see walletManager.ts), which hands us
 * the pairing URI directly instead of opening that modal itself.
 *
 * Mount this once near the root of the app (see App.tsx) — it stays invisible until a `connect()`
 * call produces a URI, and hides itself again once that call settles (success or failure).
 */
export function ConnectQrDialog() {
  const [uri, setUri] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const unsubscribeUri = onWalletConnectUri(setUri)
    const unsubscribeClose = onWalletConnectClose(() => setUri(null))
    return () => {
      unsubscribeUri()
      unsubscribeClose()
    }
  }, [])

  useEffect(() => {
    if (!uri) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(uri, { width: 280, margin: 1 })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl)
      })
      .catch((error: unknown) => {
        console.error('Failed to render WalletConnect QR code', error)
      })
    return () => {
      cancelled = true
    }
  }, [uri])

  if (!uri) return null

  const handleCopy = async () => {
    await navigator.clipboard.writeText(uri)
    setCopied(true)
    clearTimeout(copiedTimeout.current)
    copiedTimeout.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      role="dialog"
      aria-label="Connect Biatec Wallet"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={() => setUri(null)}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          padding: '1.5rem',
          maxWidth: 320,
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Scan with Biatec Wallet</h2>

        {qrDataUrl ? (
          <img src={qrDataUrl} alt="WalletConnect pairing QR code" width={280} height={280} />
        ) : (
          <div style={{ width: 280, height: 280, margin: '0 auto' }}>Generating QR code…</div>
        )}

        <button
          onClick={handleCopy}
          style={{ marginTop: '1rem', width: '100%', padding: '0.5rem' }}
        >
          {copied ? 'Copied!' : 'Copy connection string'}
        </button>

        <button
          onClick={() => setUri(null)}
          style={{ marginTop: '0.5rem', width: '100%', padding: '0.5rem', background: 'none' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
