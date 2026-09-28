import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { articles } from '../db/schema'

// GET /feed.xml —— RSS 2.0（仅 published 且未过期，取最近 20 篇；边缘缓存 1h，零持续 D1 开销）
// GEO/订阅：RSS 是内容站被收录与订阅的重要信号（搜索引擎 + 阅读器）
const SITE = 'https://www.wcbblll.cc'

export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db
    .select({ id: articles.id, title: articles.title, summary: articles.summary, category: articles.category, updatedAt: articles.updatedAt, expiresAt: articles.expiresAt })
    .from(articles)
    .where(eq(articles.status, 'published'))
    .orderBy(articles.updatedAt)
    .limit(20)

  const now = Date.now()
  const items = rows
    .filter((r) => !r.expiresAt || new Date(r.expiresAt).getTime() > now)
    .map((r) => {
      const url = `${SITE}/article/${escapeXml(r.id)}`
      const pubDate = r.updatedAt ? new Date(r.updatedAt).toUTCString() : ''
      return `  <item>
    <title>${escapeXml(r.title)}</title>
    <link>${url}</link>
    <guid isPermaLink="true">${url}</guid>
    <description>${escapeXml(r.summary || '')}</description>
    <category>${escapeXml(r.category || '文章')}</category>${pubDate ? `\n    <pubDate>${pubDate}</pubDate>` : ''}
  </item>`
    })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI 文章站</title>
    <link>${SITE}</link>
    <description>优惠攻略、好物推荐、副业指南，每日更新。</description>
    <language>zh-CN</language>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
})

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
