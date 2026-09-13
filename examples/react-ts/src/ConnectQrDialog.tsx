import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import {
  onWalletConnectClose,
  onWalletConnectUri,
  type WalletConnectUriDetail
} from './walletManager'

const METHOD_LABELS = {
  walletconnect: 'WalletConnect',
  liquid: 'Liquid Auth'
}

/**
 * Minimal pairing UI: just a QR code and a copy button — no wallet explorer, no "get a wallet"
 * links, nothing else. Rendered instead of the adapter's built-in URI dialog because `biatec()`
 * was configured with `onDisplayUri` (see walletManager.ts), which hands us the pairing URI
 * directly instead of showing that dialog itself. The adapter's built-in method picker (choose
 * WalletConnect vs. Liquid Auth) still appears first; this component only renders the URI step.
 *
 * Mount this once near the root of the app (see App.tsx) — it stays invisible until a `connect()`
 * call produces a URI, and hides itself again once that call settles (success or failure).
 */
export function ConnectQrDialog() {
  const [detail, setDetail] = useState<WalletConnectUriDetail | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const unsubscribeUri = onWalletConnectUri(setDetail)
    const unsubscribeClose = onWalletConnectClose(() => setDetail(null))
    return () => {
      unsubscribeUri()
      unsubscribeClose()
    }
  }, [])

  const uri = detail?.uri ?? null

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
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)'
      }}
      onClick={() => setDetail(null)}
    >
      <div
        style={{
          background: 'var(--card-bg)',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          border: '1px solid var(--card-border)',
          borderRadius: 20,
          padding: '1.5rem',
          maxWidth: 340,
          width: '90%',
          textAlign: 'center',
          boxShadow: 'var(--shadow)',
          color: 'var(--text)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.05rem' }}>
          Scan with Biatec Wallet — {METHOD_LABELS[detail!.info.method]}
        </h2>

        <div
          style={{
            width: 220,
            height: 220,
            margin: '0 auto',
            padding: 10,
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
            display: 'grid',
            placeItems: 'center'
          }}
        >
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Pairing QR code"
              width={200}
              height={200}
              style={{ display: 'block' }}
            />
          ) : (
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Generating QR code…</span>
          )}
        </div>

        <button
          onClick={handleCopy}
          style={{
            marginTop: '1rem',
            width: '100%',
            padding: '0.6rem',
            borderRadius: 10,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          {copied ? 'Copied!' : 'Copy connection string'}
        </button>

        <button
          onClick={() => setDetail(null)}
          style={{
            marginTop: '0.5rem',
            width: '100%',
            padding: '0.55rem',
            borderRadius: 10,
            border: 'none',
            background: 'transparent',
            color: 'var(--muted)',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
