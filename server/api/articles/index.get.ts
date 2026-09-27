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
    })
    .from(articles)
    .where(and(...conds))
    .orderBy(desc(articles.updatedAt))
    .limit(limit + 1)

  const hasMore = list.length > limit
  const rows = hasMore ? list.slice(0, limit) : list
  const nextCursor = hasMore && rows.length ? rows[rows.length - 1].updatedAt : null

  return { list: rows, nextCursor, hasMore }
})
