import { defineEventHandler, getQuery } from 'h3'
import { and, eq, lt, desc, sql } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { articles } from '../../db/schema'

// GET /api/articles?category=xx&cursor=xxx&limit=20
// 列表只回摘要（性能），游标分页（避免 OFFSET）
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const category = typeof q.category === 'string' ? q.category : ''
  const cursor = typeof q.cursor === 'string' ? q.cursor : ''
  const limit = Math.min(Number(q.limit) || 20, 50)
  const db = useDb()

  const conds = [
    eq(articles.status, 'published'),
    // 未过期
    sql`(expires_at IS NULL OR expires_at > datetime('now'))`,
  ]
  if (category) conds.push(eq(articles.category, category))
  if (cursor) conds.push(lt(articles.updatedAt, cursor))

  const list = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      category: articles.category,
      tags: articles.tags,
      expiresAt: articles.expiresAt,
      updatedAt: articles.updatedAt,
      content: articles.content,
    })
    .from(articles)
    .where(and(...conds))
    .orderBy(desc(articles.updatedAt))
    .limit(limit + 1)

  const hasMore = list.length > limit
  const rows = hasMore ? list.slice(0, limit) : list
  const nextCursor = hasMore && rows.length ? rows[rows.length - 1].updatedAt : null

  // 提取首图（content 里第一个 image 块），供列表缩略图；content 不返回给前端
  const withImg = rows.map((r: any) => {
    let firstImage = ''
    try {
      const c = typeof r.content === 'string' ? JSON.parse(r.content) : r.content
      if (Array.isArray(c)) {
        const b = c.find((x: any) => x?.type === 'image' && x?.url)
        if (b?.url) firstImage = b.url
      }
    } catch { /* 结构异常忽略 */ }
    const { content, ...rest } = r
    return { ...rest, firstImage }
  })

  return { list: withImg, nextCursor, hasMore }
})
