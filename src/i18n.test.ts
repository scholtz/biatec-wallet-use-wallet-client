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
