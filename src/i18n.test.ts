import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, TRANSLATIONS, resolveLocale } from './i18n'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SUPPORTED_LOCALES / TRANSLATIONS', () => {
  it('has a translation for every supported locale, and every locale is complete', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const translation = TRANSLATIONS[locale]
      expect(translation).toBeDefined()
      expect(translation.title).toBeTruthy()
      expect(translation.methodLabel.walletconnect).toBeTruthy()
      expect(translation.methodLabel.liquid).toBeTruthy()
      expect(translation.methodInstructions.walletconnect).toContain('<strong>')
      expect(translation.methodInstructions.liquid).toContain('<strong>')
      // Biatec Direct (popup) strings, all really translated (not left empty).
      expect(translation.methodLabel.direct).toBe('Biatec Direct')
      expect(translation.methodHint.direct).toBeTruthy()
      expect(translation.methodInstructions.direct).toContain('<strong>')
      expect(translation.openWallet).toContain('Biatec Wallet')
      expect(translation.popupBlocked).toBeTruthy()
      expect(translation.waitingForWallet).toBeTruthy()
    }
  })
})

describe('Biatec Direct strings', () => {
  it('are translated in every non-English locale (differ from the English text)', () => {
    const en = TRANSLATIONS.en
    for (const locale of SUPPORTED_LOCALES.filter((l) => l !== 'en')) {
      const t = TRANSLATIONS[locale]
      expect(t.methodHint.direct, locale).not.toBe(en.methodHint.direct)
      expect(t.methodInstructions.direct, locale).not.toBe(en.methodInstructions.direct)
      expect(t.openWallet, locale).not.toBe(en.openWallet)
      expect(t.popupBlocked, locale).not.toBe(en.popupBlocked)
      expect(t.waitingForWallet, locale).not.toBe(en.waitingForWallet)
    }
  })

  it('never embed markup other than <strong> in the instructions', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const stripped = TRANSLATIONS[locale].methodInstructions.direct.replace(/<\/?strong>/g, '')
      expect(stripped, locale).not.toMatch(/[<>]/)
    }
  })
})

describe('resolveLocale', () => {
  it('returns an explicit supported locale, matching the base language of a region tag', () => {
    expect(resolveLocale('sk')).toBe('sk')
    expect(resolveLocale('sk-SK')).toBe('sk')
    expect(resolveLocale('RU')).toBe('ru')
  })

  it('falls back to the default locale for an unsupported explicit locale', () => {
    expect(resolveLocale('fr')).toBe(DEFAULT_LOCALE)
    expect(resolveLocale('ja-JP')).toBe(DEFAULT_LOCALE)
  })

  it('picks the first supported locale out of an explicit preference list', () => {
    expect(resolveLocale(['fr', 'sk', 'en'])).toBe('sk')
  })

  it('falls back to navigator.languages when no explicit locale is given', () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR', 'cs-CZ'], language: 'fr-FR' })
    expect(resolveLocale()).toBe('cs')
  })

  it('defaults to English when nothing matches', () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR'], language: 'fr-FR' })
    expect(resolveLocale()).toBe(DEFAULT_LOCALE)
  })
})
