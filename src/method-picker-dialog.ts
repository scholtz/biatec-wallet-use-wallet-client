/**
 * Built-in vanilla-DOM UI for the unified Biatec Wallet connector: a method picker (choose
 * WalletConnect vs. Liquid Auth) and a shared URI/QR-less display dialog for whichever method
 * is chosen. Both reuse the same overlay/box chrome so the two steps read as one flow instead
 * of jumping into a third-party modal. No framework and no QR dependency — render your own QR
 * code through `onDisplayUri` for a scannable experience.
 */
import { icon } from './icon'
import type { BiatecMethod, DialogHandle } from './transports/types'

const METHOD_LABELS: Record<BiatecMethod, string> = {
  walletconnect: 'WalletConnect',
  liquid: 'Liquid Auth (Passkey)'
}

function noopHandle(): DialogHandle {
  return { close: () => undefined }
}

function createOverlay(): { overlay: HTMLDivElement; box: HTMLDivElement } {
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-label', 'Connect Biatec Wallet')
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:2147483000;font-family:system-ui,sans-serif'

  const box = document.createElement('div')
  box.style.cssText =
    'background:#fff;color:#111;border-radius:12px;padding:1.5rem;max-width:420px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,.2)'

  overlay.appendChild(box)
  return { overlay, box }
}

function attachDismissHandlers(
  overlay: HTMLDivElement,
  box: HTMLDivElement,
  onDismiss: () => void
): DialogHandle {
  const handle: DialogHandle = { close: () => overlay.remove() }
  const cancelButton = box.querySelector('[data-cancel]') as HTMLButtonElement | null
  if (cancelButton) {
    cancelButton.onclick = () => {
      handle.close()
      onDismiss()
    }
  }
  overlay.onclick = (event) => {
    if (event.target === overlay) {
      handle.close()
      onDismiss()
    }
  }
  return handle
}

/** Step 1: shown when both transports are enabled and no method was chosen explicitly. */
export function openMethodPickerDialog(
  onChoose: (method: BiatecMethod) => void,
  onCancel: () => void
): DialogHandle {
  if (typeof document === 'undefined') return noopHandle()

  const { overlay, box } = createOverlay()
  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:.6rem;margin:0 0 1rem">
      <div style="width:2rem;height:2rem;flex-shrink:0">${icon}</div>
      <h2 style="margin:0;font-size:1.1rem">Connect Biatec Wallet</h2>
    </div>
    <p style="margin:0 0 1rem;font-size:.9rem;line-height:1.4;color:#444">
      Choose how you'd like to connect.
    </p>
    <div style="display:flex;flex-direction:column;gap:.5rem">
      <button data-method="walletconnect" style="padding:.65rem;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;font-size:.95rem">
        ${METHOD_LABELS.walletconnect}
      </button>
      <button data-method="liquid" style="padding:.65rem;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;font-size:.95rem">
        ${METHOD_LABELS.liquid}
      </button>
      <button data-cancel style="padding:.5rem;border:none;background:none;color:#666;cursor:pointer;font-size:.85rem">Cancel</button>
    </div>`

  const handle = attachDismissHandlers(overlay, box, onCancel)
  for (const button of box.querySelectorAll<HTMLButtonElement>('[data-method]')) {
    button.onclick = () => {
      const method = button.dataset.method as BiatecMethod
      handle.close()
      onChoose(method)
    }
  }

  document.body.appendChild(overlay)
  return handle
}

/**
 * Step 2: shown after a method is chosen and no `onDisplayUri` override was given — replaces
 * both the legacy Liquid-only fallback dialog and `@walletconnect/modal`'s wallet-explorer
 * modal as the default "here's your pairing link" UI for both transports.
 */
export function openUriDisplayDialog(
  uri: string,
  method: BiatecMethod,
  onCancel: () => void
): DialogHandle {
  if (typeof document === 'undefined') return noopHandle()

  const { overlay, box } = createOverlay()
  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:.6rem;margin:0 0 .75rem">
      <div style="width:2rem;height:2rem;flex-shrink:0">${icon}</div>
      <h2 style="margin:0;font-size:1.1rem">Connect via ${METHOD_LABELS[method]}</h2>
    </div>
    <p style="margin:0 0 .75rem;font-size:.9rem;line-height:1.4;color:#444">
      Open Biatec Wallet, paste this link and approve the connection.
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

  const handle = attachDismissHandlers(overlay, box, onCancel)
  document.body.appendChild(overlay)
  return handle
}
