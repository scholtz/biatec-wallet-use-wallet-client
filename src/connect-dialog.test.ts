import { describe, expect, it } from 'vitest'
import { escapeHtml } from './connect-dialog'

describe('escapeHtml', () => {
  it('escapes both quote styles, angle brackets and ampersands', () => {
    expect(escapeHtml(`a"b'c<d>&e`)).toBe('a&quot;b&#39;c&lt;d&gt;&amp;e')
  })

  it('escapes ampersands first so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})
