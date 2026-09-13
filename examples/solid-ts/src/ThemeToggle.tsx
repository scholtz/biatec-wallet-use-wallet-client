import { createSignal } from 'solid-js'

const THEME_STORAGE_KEY = 'biatec-example-theme'

type Theme = 'light' | 'dark'

function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * A small light/dark toggle for this example page. The inline script in index.html's <head>
 * already applied any stored choice before Solid mounted (no flash on reload); this component
 * just renders the button and keeps `<html data-theme>` (and localStorage) in sync with it.
 *
 * The adapter's own built-in connect dialog (src/connect-dialog.ts in the adapter package)
 * reads the same `data-theme` attribute, so it always matches whatever this page is showing.
 */
export function ThemeToggle() {
  const [theme, setTheme] = createSignal<Theme>(currentTheme())

  const toggle = () => {
    const next = theme() === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem(THEME_STORAGE_KEY, next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        'flex-shrink': 0,
        padding: '0.4rem 0.6rem',
        border: 'none',
        'border-radius': '999px',
        background: 'var(--accent-soft)',
        color: 'var(--text)',
        'font-size': '1rem',
        'line-height': 1,
        cursor: 'pointer'
      }}
    >
      {theme() === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
