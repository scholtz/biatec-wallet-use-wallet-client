<script setup lang="ts">
import { ref } from 'vue'

const THEME_STORAGE_KEY = 'biatec-example-theme'

type Theme = 'light' | 'dark'

function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * A small light/dark toggle for this example page. The inline script in index.html's <head>
 * already applied any stored choice before Vue mounted (no flash on reload); this component
 * just renders the button and keeps `<html data-theme>` (and localStorage) in sync with it.
 *
 * The adapter's own built-in connect dialog (src/connect-dialog.ts in the adapter package)
 * reads the same `data-theme` attribute, so it always matches whatever this page is showing.
 */
const theme = ref<Theme>(currentTheme())

function toggle() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme.value)
  localStorage.setItem(THEME_STORAGE_KEY, theme.value)
}
</script>

<template>
  <button
    type="button"
    class="toggle"
    :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggle"
  >
    {{ theme === 'dark' ? '☀️' : '🌙' }}
  </button>
</template>

<style scoped>
.toggle {
  flex-shrink: 0;
  padding: 0.4rem 0.6rem;
  border: none;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--text);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}
</style>
