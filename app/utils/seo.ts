import { SITE_CONFIG } from '../config/site'

type JsonLd = Record<string, any>

/** 统一 SEO head 设置：title/description/og/canonical/JSON-LD */
export function useSiteSeo(options: {
  title: string
  description: string
  path: string
  ogType?: string
  jsonLd?: JsonLd[]
  noindex?: boolean
}) {
  const runtimeConfig = useRuntimeConfig()
  const siteUrl = String(SITE_CONFIG.siteUrl || runtimeConfig.public.siteUrl || '').replace(/\/$/, '')
  const url = `${siteUrl}${options.path.startsWith('/') ? options.path : `/${options.path}`}`
  const jsonLd = options.jsonLd || []

  useHead({
    title: options.title,
    meta: [
      { name: 'description', content: options.description },
      { name: 'robots', content: options.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large' },
      { name: 'author', content: SITE_CONFIG.name },
      { property: 'og:type', content: options.ogType || 'website' },
      { property: 'og:site_name', content: SITE_CONFIG.name },
      { property: 'og:locale', content: 'zh_CN' },
      { property: 'og:title', content: options.title },
      { property: 'og:description', content: options.description },
      { property: 'og:url', content: url },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: options.title },
      { name: 'twitter:description', content: options.description },
    ],
    link: [{ rel: 'canonical', href: url }],
    script: jsonLd.map((item) => ({
      type: 'application/ld+json',
      innerHTML: JSON.stringify(item),
    })),
  })

  return { url, siteUrl }
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_CONFIG.name,
    description: SITE_CONFIG.description,
    url: SITE_CONFIG.siteUrl || undefined,
    sameAs: SITE_CONFIG.userUrl ? [SITE_CONFIG.userUrl] : undefined,
  }
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_CONFIG.name,
    description: SITE_CONFIG.description,
    inLanguage: 'zh-CN',
  }
}

export function faqJsonLd(items: Array<{ q: string; a: string }>) {
  if (!items?.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
}

/** 文章页 JSON-LD：Article + BreadcrumbList + FAQPage（可选） */
export function articleJsonLd(article: {
  id: string
  title: string
  summary?: string
  createdAt?: string
  updatedAt?: string
  category?: string
  faq?: Array<{ q: string; a: string }>
}) {
  const runtimeConfig = useRuntimeConfig()
  const siteUrl = String(SITE_CONFIG.siteUrl || runtimeConfig.public.siteUrl || '').replace(/\/$/, '')
  const url = `${siteUrl}/article/${article.id}`

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: article.title,
        description: article.summary || SITE_CONFIG.description,
        datePublished: article.createdAt || undefined,
        dateModified: article.updatedAt || article.createdAt || undefined,
        inLanguage: 'zh-CN',
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        author: { '@type': 'Organization', name: SITE_CONFIG.name },
        publisher: {
          '@type': 'Organization',
          name: SITE_CONFIG.name,
          logo: { '@type': 'ImageObject', url: `${siteUrl}/favicon.ico` },
        },
        articleSection: article.category || undefined,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: `${siteUrl}/` },
          { '@type': 'ListItem', position: 2, name: '文章', item: `${siteUrl}/articles` },
          { '@type': 'ListItem', position: 3, name: article.title, item: url },
        ],
      },
      ...(article.faq?.length
        ? [{
            '@type': 'FAQPage',
            mainEntity: article.faq.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          }]
        : []),
    ],
  }
}
