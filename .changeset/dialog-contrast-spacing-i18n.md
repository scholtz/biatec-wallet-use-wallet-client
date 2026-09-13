---
'biatec-wallet-use-wallet-client': minor
---

Fixed low-contrast text on the built-in connect dialog's "Copy link" button in dark mode (bright teal background with white text). The button now uses a dedicated `--bcd-accent-contrast` token per theme instead of hardcoded white.

Widened the dialog's layout on desktop viewports (≥640px): more padding, a wider method sidebar, and a larger max width, so the picker + QR layout doesn't feel cramped next to all the extra screen space.

Localized the dialog into every language Biatec Wallet itself ships — Afrikaans, Czech, English, Spanish, Hungarian, Italian, Dutch, Russian, Slovak, and Turkish — auto-detected from the browser (`navigator.languages`) and overridable with the new `locale` option on `biatec({ ... })`. `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `BiatecLocale`, and `resolveLocale()` are exported for building a language switcher of your own.
