/**
 * Built-in connect UI for the unified Biatec Wallet connector: a modern, glassmorphic dialog
 * that shows a method selector (WalletConnect / Liquid Auth) on the left and the pairing QR
 * code / link for whichever method is selected on the right — defaulting to WalletConnect when
 * both are enabled. Supports light and dark mode via `prefers-color-scheme`. No framework
 * dependency; a lazy `qrcode` import renders the QR only while the dialog is open.
 */
import { icon } from './icon'
import { BIATEC_WALLET_URL } from './adapter-constants'
import type { BiatecMethod, DialogHandle } from './transports/types'

const STYLE_ID = 'biatec-connect-dialog-styles'

const METHOD_LABEL: Record<BiatecMethod, string> = {
  walletconnect: 'WalletConnect',
  liquid: 'Liquid Auth'
}

const METHOD_HINT: Record<BiatecMethod, string> = {
  walletconnect: 'Relay-based pairing',
  liquid: 'Peer-to-peer, passkey'
}

const METHOD_INSTRUCTIONS: Record<BiatecMethod, string> = {
  walletconnect:
    'Open <strong>Biatec Wallet</strong> on your phone, tap the scan icon, and point your camera at this code.',
  liquid:
    'Open <strong>Biatec Wallet</strong>, choose <strong>Liquid Auth</strong>, and scan this code. You’ll approve the connection with your device passkey — no relay server involved.'
}

const METHOD_ICON: Record<BiatecMethod, string> = {
  walletconnect: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.5 9.9c3-2.9 7.9-2.9 10.9 0l.4.3a.4.4 0 0 1 0 .6l-1.2 1.2a.2.2 0 0 1-.3 0l-.5-.5c-2.1-2-5.5-2-7.6 0l-.6.5a.2.2 0 0 1-.3 0L6.1 10.8a.4.4 0 0 1 0-.6zm13.5 2.5 1 1a.4.4 0 0 1 0 .6l-4.7 4.6a.4.4 0 0 1-.6 0l-3.3-3.3a.1.1 0 0 0-.2 0l-3.3 3.3a.4.4 0 0 1-.6 0L3.6 14a.4.4 0 0 1 0-.6l1-1a.4.4 0 0 1 .6 0l3.3 3.3a.1.1 0 0 0 .2 0l3.3-3.3a.4.4 0 0 1 .6 0l3.3 3.3a.1.1 0 0 0 .2 0l3.3-3.3a.4.4 0 0 1 .6 0z" fill="currentColor"/></svg>`,
  liquid: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 6 12 6.3 12.3a1 1 0 0 0 1.4 0C13 21 19 14.2 19 9a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" fill="currentColor"/></svg>`
}

function injectStylesOnce(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

async function renderQrDataUrl(uri: string): Promise<string> {
  const QRCode = await import('qrcode')
  return QRCode.toDataURL(uri, {
    width: 220,
    margin: 1,
    color: { dark: '#0f172a', light: '#ffffff' }
  })
}

export interface ConnectMethodState {
  status: 'connecting' | 'ready' | 'error'
  uri?: string
  error?: string
}

export interface ConnectDialogController extends DialogHandle {
  setState(method: BiatecMethod, state: ConnectMethodState): void
}

export interface ConnectDialogOptions {
  /** Methods offered — one entry means nothing to pick, just show/skip content. */
  methods: BiatecMethod[]
  defaultMethod: BiatecMethod
  /**
   * Whether this dialog renders pairing content itself (QR/link). `false` when the consumer
   * supplied `onDisplayUri` — then this dialog is picker-only and closes as soon as a method
   * is chosen, handing off to the consumer's own UI.
   */
  showContent: boolean
  /** Fired the first time a method is selected (either the default, or a manual tab click). */
  onSelectMethod: (method: BiatecMethod) => void
  onCancel: () => void
}

function noopHandle(): ConnectDialogController {
  return { close: () => undefined, setState: () => undefined }
}

export function openConnectDialog(options: ConnectDialogOptions): ConnectDialogController {
  if (typeof document === 'undefined') return noopHandle()
  injectStylesOnce()

  const { methods, showContent } = options
  const showPicker = methods.length > 1
  let selected = options.defaultMethod
  const states = new Map<BiatecMethod, ConnectMethodState>()
  const started = new Set<BiatecMethod>()

  const overlay = document.createElement('div')
  overlay.className = 'bcd-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Connect Biatec Wallet')

  const panel = document.createElement('div')
  panel.className = 'bcd-panel'
  if (!showPicker) panel.classList.add('bcd-panel--single')
  if (!showContent) panel.classList.add('bcd-panel--picker-only')
  overlay.appendChild(panel)

  const handle: ConnectDialogController = {
    close: () => {
      document.removeEventListener('keydown', onKeydown)
      overlay.classList.remove('bcd-overlay--visible')
      setTimeout(() => overlay.remove(), 160)
    },
    setState: (method, state) => {
      states.set(method, state)
      renderMethodStatus(method)
      if (method === selected) renderContent()
    }
  }

  function cancel(): void {
    handle.close()
    options.onCancel()
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') cancel()
  }

  /** User clicked a method tab (or it's the initial default selection). */
  function select(method: BiatecMethod, isInitial = false): void {
    selected = method
    renderMethods()
    if (!started.has(method)) {
      started.add(method)
      // The initial default selection is started explicitly by the caller right after this
      // function returns (it needs the dialog handle, which doesn't exist yet while
      // `openConnectDialog` is still constructing it) — only forward real tab clicks here.
      if (!isInitial) options.onSelectMethod(method)
    }
    if (showContent) {
      renderContent()
    } else if (!isInitial) {
      handle.close()
    }
  }

  panel.innerHTML = `
    <button type="button" class="bcd-close" aria-label="Cancel">${CLOSE_ICON}</button>
    <div class="bcd-header">
      <div class="bcd-logo">${icon}</div>
      <div>
        <h2 class="bcd-title">Connect Biatec Wallet</h2>
        ${showPicker ? '<p class="bcd-subtitle">Pick a method, then scan the code</p>' : ''}
      </div>
    </div>
    <div class="bcd-body">
      ${showPicker ? '<div class="bcd-methods" role="tablist"></div>' : ''}
      ${showContent ? '<div class="bcd-content"></div>' : ''}
    </div>
  `
  ;(panel.querySelector('.bcd-close') as HTMLButtonElement).onclick = cancel
  overlay.onclick = (event) => {
    if (event.target === overlay) cancel()
  }
  document.addEventListener('keydown', onKeydown)

  const methodsEl = panel.querySelector('.bcd-methods') as HTMLDivElement | null
  const contentEl = panel.querySelector('.bcd-content') as HTMLDivElement | null

  function renderMethods(): void {
    if (!methodsEl) return
    methodsEl.innerHTML = methods
      .map((method) => {
        const state = states.get(method)
        const dotClass =
          state?.status === 'ready'
            ? 'bcd-dot--ready'
            : state?.status === 'error'
              ? 'bcd-dot--error'
              : ''
        return `
          <button type="button" class="bcd-method${method === selected ? ' bcd-method--active' : ''}" data-method="${method}" role="tab" aria-selected="${method === selected}">
            <span class="bcd-method-icon">${METHOD_ICON[method]}</span>
            <span class="bcd-method-text">
              <span class="bcd-method-label">${METHOD_LABEL[method]}</span>
              <span class="bcd-method-hint">${METHOD_HINT[method]}</span>
            </span>
            <span class="bcd-dot ${dotClass}"></span>
          </button>`
      })
      .join('')
    for (const button of methodsEl.querySelectorAll<HTMLButtonElement>('[data-method]')) {
      button.onclick = () => select(button.dataset.method as BiatecMethod)
    }
  }

  function renderMethodStatus(method: BiatecMethod): void {
    if (!methodsEl) return
    const button = methodsEl.querySelector(`[data-method="${method}"] .bcd-dot`)
    const state = states.get(method)
    if (button) {
      button.className = `bcd-dot ${state?.status === 'ready' ? 'bcd-dot--ready' : state?.status === 'error' ? 'bcd-dot--error' : ''}`
    }
  }

  function renderContent(): void {
    if (!contentEl) return
    const state = states.get(selected)
    if (!state || state.status === 'connecting') {
      contentEl.innerHTML = `<div class="bcd-content-state"><div class="bcd-spinner"></div><p class="bcd-hint">Preparing ${METHOD_LABEL[selected]}…</p></div>`
      return
    }
    if (state.status === 'error') {
      contentEl.innerHTML = `<div class="bcd-content-state"><p class="bcd-error">${escapeHtml(state.error ?? 'Something went wrong.')}</p></div>`
      return
    }
    const uri = state.uri ?? ''
    contentEl.innerHTML = `
      <h3 class="bcd-content-title">Connect with ${METHOD_LABEL[selected]}</h3>
      <div class="bcd-qr-tile"><img class="bcd-qr" alt="Pairing QR code" /></div>
      <p class="bcd-hint">${METHOD_INSTRUCTIONS[selected]}</p>
      <input class="bcd-uri" readonly value="${escapeHtml(uri)}" aria-label="Pairing link" />
      <button type="button" class="bcd-copy">Copy link</button>
      <p class="bcd-footnote">Don’t have Biatec Wallet?
        <a class="bcd-link" href="${BIATEC_WALLET_URL}" target="_blank" rel="noreferrer">Get it here</a>
      </p>
    `
    const img = contentEl.querySelector('.bcd-qr') as HTMLImageElement
    renderQrDataUrl(uri)
      .then((dataUrl) => {
        if (states.get(selected) === state) img.src = dataUrl
      })
      .catch(() => {
        contentEl.querySelector('.bcd-qr-tile')?.remove()
      })
    const copyButton = contentEl.querySelector('.bcd-copy') as HTMLButtonElement
    copyButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(uri)
        copyButton.textContent = 'Copied!'
        setTimeout(() => (copyButton.textContent = 'Copy link'), 2000)
      } catch {
        ;(contentEl.querySelector('.bcd-uri') as HTMLInputElement)?.select()
      }
    }
  }

  if (showPicker) renderMethods()
  select(options.defaultMethod, true)

  document.body.appendChild(overlay)
  requestAnimationFrame(() => overlay.classList.add('bcd-overlay--visible'))

  return handle
}

function escapeHtml(value: string): string {
  const div = document.createElement('div')
  div.textContent = value
  return div.innerHTML
}

const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`

const CSS = `
.bcd-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: var(--bcd-overlay);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  opacity: 0;
  transition: opacity 160ms ease;
  --bcd-overlay: rgba(15, 23, 42, 0.45);
  --bcd-bg: rgba(255, 255, 255, 0.82);
  --bcd-border: rgba(15, 23, 42, 0.08);
  --bcd-text: #0f172a;
  --bcd-muted: #64748b;
  --bcd-accent: #0f766e;
  --bcd-accent-soft: rgba(15, 118, 110, 0.12);
  --bcd-surface: rgba(255, 255, 255, 0.55);
  --bcd-shadow: 0 24px 70px rgba(15, 23, 42, 0.28), 0 2px 8px rgba(15, 23, 42, 0.08);
  --bcd-danger: #dc2626;
}
@media (prefers-color-scheme: dark) {
  .bcd-overlay {
    --bcd-overlay: rgba(2, 6, 12, 0.6);
    --bcd-bg: rgba(24, 30, 42, 0.78);
    --bcd-border: rgba(255, 255, 255, 0.08);
    --bcd-text: #f1f5f9;
    --bcd-muted: #94a3b8;
    --bcd-accent: #2dd4bf;
    --bcd-accent-soft: rgba(45, 212, 191, 0.16);
    --bcd-surface: rgba(255, 255, 255, 0.05);
    --bcd-shadow: 0 24px 70px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.3);
    --bcd-danger: #f87171;
  }
}
.bcd-overlay--visible { opacity: 1; }
.bcd-overlay--visible .bcd-panel { transform: scale(1) translateY(0); opacity: 1; }
.bcd-panel {
  position: relative;
  width: 100%;
  max-width: 480px;
  background: var(--bcd-bg);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid var(--bcd-border);
  border-radius: 20px;
  box-shadow: var(--bcd-shadow);
  padding: 1.5rem;
  color: var(--bcd-text);
  transform: scale(0.96) translateY(6px);
  opacity: 0;
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease;
}
.bcd-panel--single { max-width: 380px; }
.bcd-close {
  position: absolute;
  top: 0.9rem;
  right: 0.9rem;
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--bcd-muted);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.bcd-close:hover { background: var(--bcd-accent-soft); color: var(--bcd-text); }
.bcd-close svg { width: 1rem; height: 1rem; }
.bcd-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; padding-right: 1.5rem; }
.bcd-logo { width: 2.25rem; height: 2.25rem; flex-shrink: 0; }
.bcd-logo svg { width: 100%; height: 100%; }
.bcd-title { margin: 0; font-size: 1.05rem; font-weight: 600; }
.bcd-subtitle { margin: 0.15rem 0 0; font-size: 0.85rem; color: var(--bcd-muted); }
.bcd-body { display: flex; gap: 1.25rem; }
.bcd-panel--single .bcd-body, .bcd-panel--picker-only .bcd-body { flex-direction: column; }
.bcd-methods { display: flex; flex-direction: column; gap: 0.5rem; flex: 0 0 auto; }
.bcd-panel:not(.bcd-panel--picker-only) .bcd-methods { width: 168px; }
.bcd-method {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.65rem 0.75rem;
  border-radius: 14px;
  border: 1px solid transparent;
  background: var(--bcd-surface);
  color: var(--bcd-text);
  cursor: pointer;
  text-align: left;
  transition: background 150ms ease, border-color 150ms ease, transform 150ms ease;
}
.bcd-method:hover { transform: translateY(-1px); }
.bcd-method--active {
  border-color: var(--bcd-accent);
  background: var(--bcd-accent-soft);
}
.bcd-method-icon { width: 1.15rem; height: 1.15rem; flex-shrink: 0; color: var(--bcd-accent); }
.bcd-method-icon svg { width: 100%; height: 100%; }
.bcd-method-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.bcd-method-label { font-size: 0.88rem; font-weight: 600; }
.bcd-method-hint { font-size: 0.72rem; color: var(--bcd-muted); }
.bcd-dot { width: 0.45rem; height: 0.45rem; border-radius: 999px; background: var(--bcd-muted); opacity: 0.4; flex-shrink: 0; }
.bcd-dot--ready { background: #22c55e; opacity: 1; }
.bcd-dot--error { background: var(--bcd-danger); opacity: 1; }
.bcd-content { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; min-width: 0; }
.bcd-content-title { margin: 0 0 0.85rem; font-size: 0.95rem; font-weight: 600; }
.bcd-footnote { margin: 0.9rem 0 0; font-size: 0.75rem; color: var(--bcd-muted); }
.bcd-content-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; min-height: 220px; }
.bcd-spinner {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 3px solid var(--bcd-accent-soft);
  border-top-color: var(--bcd-accent);
  animation: bcd-spin 800ms linear infinite;
}
@keyframes bcd-spin { to { transform: rotate(360deg); } }
.bcd-qr-tile {
  width: 220px;
  height: 220px;
  padding: 10px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  display: grid;
  place-items: center;
}
.bcd-qr { width: 100%; height: 100%; }
.bcd-hint { margin: 0.85rem 0 0; font-size: 0.8rem; color: var(--bcd-muted); line-height: 1.4; }
.bcd-link { color: var(--bcd-accent); text-decoration: none; }
.bcd-link:hover { text-decoration: underline; }
.bcd-error { color: var(--bcd-danger); font-size: 0.88rem; }
.bcd-uri {
  width: 100%;
  margin-top: 0.85rem;
  padding: 0.5rem 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--bcd-border);
  background: var(--bcd-surface);
  color: var(--bcd-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.72rem;
  box-sizing: border-box;
}
.bcd-copy {
  margin-top: 0.6rem;
  width: 100%;
  padding: 0.55rem;
  border-radius: 10px;
  border: none;
  background: var(--bcd-accent);
  color: #ffffff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: filter 120ms ease;
}
.bcd-copy:hover { filter: brightness(1.08); }
@media (max-width: 420px) {
  .bcd-body { flex-direction: column; }
  .bcd-panel:not(.bcd-panel--picker-only) .bcd-methods { width: 100%; flex-direction: row; }
  .bcd-method-hint { display: none; }
}
`
