import type { SignClientTypes } from '@walletconnect/types'

const EMPTY_METADATA: SignClientTypes.Metadata = {
  name: '',
  description: '',
  url: '',
  icons: []
}

/**
 * Best-effort dApp metadata derived from the current document (title, meta tags,
 * favicon links, origin). Adapted from @walletconnect/utils `getWindowMetadata` so
 * the full utils package is not required as a dependency.
 *
 * Returns empty metadata outside a browser (SSR, tests).
 */
export function getWindowMetadata(): SignClientTypes.Metadata {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return EMPTY_METADATA
  }

  const doc = document
  const loc = window.location

  const metaContent = (...names: string[]): string => {
    const tags = doc.getElementsByTagName('meta')
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i]
      const matches = ['itemprop', 'property', 'name']
        .map((attr) => tag.getAttribute(attr))
        .some((value) => value !== null && names.includes(value))
      if (matches) {
        const content = tag.getAttribute('content')
        if (content) return content
      }
    }
    return ''
  }

  const icons: string[] = []
  const links = doc.getElementsByTagName('link')
  for (let i = 0; i < links.length; i++) {
    const link = links[i]
    const rel = link.getAttribute('rel')?.toLowerCase() ?? ''
    const href = link.getAttribute('href')
    if (!rel.includes('icon') || !href) continue
    try {
      icons.push(new URL(href, loc.href).toString())
    } catch {
      icons.push(href)
    }
  }

  const name = metaContent('name', 'og:site_name', 'og:title', 'twitter:title') || doc.title
  const description = metaContent(
    'description',
    'og:description',
    'twitter:description',
    'keywords'
  )

  return {
    name,
    description,
    url: loc.origin,
    icons
  }
}
