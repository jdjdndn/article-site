import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { articles } from '../db/schema'

// GET /sitemap.xml —— 动态生成（仅 published 且未过期），边缘缓存 1h，零持续 D1 开销
export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db
    .select({ id: articles.id, updatedAt: articles.updatedAt, expiresAt: articles.expiresAt, firstImage: articles.firstImage })
    .from(articles)
    .where(eq(articles.status, 'published'))

  const now = Date.now()
  const items = rows
    .filter((r) => !r.expiresAt || new Date(r.expiresAt).getTime() > now)
    .map((r) => {
      const lastmod = r.updatedAt ? new Date(r.updatedAt).toISOString().slice(0, 10) : undefined
      // 图片扩展：有 first_image 才输出，帮助搜索引擎/图搜收录正文图（GEO）
      const img = r.firstImage ? `<image:image><image:loc>${escapeXml(r.firstImage)}</image:loc></image:image>` : ''
      return `  <url><loc>https://www.wcbblll.cc/article/${escapeXml(r.id)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.8</priority>${img}</url>`
    })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url><loc>https://www.wcbblll.cc/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://www.wcbblll.cc/about</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>
${items.join('\n')}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  })
})

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
