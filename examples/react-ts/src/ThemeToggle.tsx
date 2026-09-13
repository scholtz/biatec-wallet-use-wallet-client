import { useEffect, useState } from 'react'

const THEME_STORAGE_KEY = 'biatec-example-theme'

type Theme = 'light' | 'dark'

function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * A small light/dark toggle for this example page. The inline script in index.html's <head>
 * already applied any stored choice before React mounted (no flash on reload); this component
 * just renders the button and keeps `<html data-theme>` (and localStorage) in sync with it.
 *
 * The adapter's own built-in connect dialog (src/connect-dialog.ts in the adapter package)
 * reads the same `data-theme` attribute, so it always matches whatever this page is showing.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        flexShrink: 0,
        padding: '0.4rem 0.6rem',
        border: 'none',
        borderRadius: 999,
        background: 'var(--accent-soft)',
        color: 'var(--text)',
        fontSize: '1rem',
        lineHeight: 1,
        cursor: 'pointer'
      }}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
