/**
 * Fallback pairing dialog used when no `onDisplayUri` handler is configured: shows the
 * `liquid://` link with a copy button and a link to Biatec Wallet. It intentionally has no QR
 * dependency — render your own QR code through `onDisplayUri` for a scannable experience.
 */
import { BIATEC_WALLET_URL } from '../adapter'

export interface LiquidDialogHandle {
  close(): void
}

export function openLiquidPairingDialog(uri: string, onCancel: () => void): LiquidDialogHandle {
  if (typeof document === 'undefined') {
    return { close: () => undefined }
  }
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-label', 'Connect Biatec Wallet')
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:2147483000;font-family:system-ui,sans-serif'

  const box = document.createElement('div')
  box.style.cssText =
    'background:#fff;color:#111;border-radius:12px;padding:1.5rem;max-width:420px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,.2)'
  box.innerHTML = `
    <h2 style="margin:0 0 .5rem;font-size:1.1rem">Connect Biatec Wallet</h2>
    <p style="margin:0 0 .75rem;font-size:.9rem;line-height:1.4">
      Open <a href="${BIATEC_WALLET_URL}/connect" target="_blank" rel="noreferrer">Biatec Wallet → Connect → Liquid Auth</a>,
      paste this link and approve with your passkey.
    </p>
    <input readonly style="width:100%;box-sizing:border-box;padding:.5rem;font-family:monospace;font-size:.8rem" />
    <div style="display:flex;gap:.5rem;margin-top:.75rem">
      <button data-copy style="flex:1;padding:.5rem">Copy link</button>
      <button data-cancel style="flex:1;padding:.5rem;background:none;border:1px solid #ccc">Cancel</button>
    </div>`
  const input = box.querySelector('input') as HTMLInputElement
  input.value = uri
  const copy = box.querySelector('[data-copy]') as HTMLButtonElement
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(uri)
      copy.textContent = 'Copied!'
      setTimeout(() => (copy.textContent = 'Copy link'), 2000)
    } catch {
      input.select()
    }
  }
  const handle: LiquidDialogHandle = {
    close: () => {
      overlay.remove()
    }
  }
  ;(box.querySelector('[data-cancel]') as HTMLButtonElement).onclick = () => {
    handle.close()
    onCancel()
  }
  overlay.onclick = (event) => {
    if (event.target === overlay) {
      handle.close()
      onCancel()
    }
  }
  overlay.appendChild(box)
  document.body.appendChild(overlay)
  return handle
}
