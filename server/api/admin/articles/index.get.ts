import { defineEventHandler, getQuery, createError } from 'h3'
import { and, eq, ne, desc, lt, gte, sql } from 'drizzle-orm'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { articles } from '../../../db/schema'

// GET /api/admin/articles?key=xxx&status=&needsReview=1&cursor=&limit=
// 后台文章列表：全部状态（不含已删，回收站走 /api/admin/trash），游标分页
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const q = getQuery(event)
  const status = typeof q.status === 'string' && q.status ? q.status : ''
  const needsReview = q.needsReview === '1'
  const from = typeof q.from === 'string' && q.from ? q.from.slice(0, 10) : ''
  const cursor = typeof q.cursor === 'string' ? q.cursor : ''
  const limit = Math.min(Number(q.limit) || 20, 100)
  const db = useDb()

  const conds = [ne(articles.status, 'deleted')]
  if (status) conds.push(eq(articles.status, status))
  if (needsReview) conds.push(eq(articles.needsReview, 1))
  if (cursor) conds.push(lt(articles.updatedAt, cursor))
  if (from) conds.push(gte(articles.updatedAt, from + 'T00:00:00.000Z'))

  const list = await db
    .select({
      id: articles.id,
      title: articles.title,
      category: articles.category,
      status: articles.status,
      needsReview: articles.needsReview,
      expiresAt: articles.expiresAt,
      updatedAt: articles.updatedAt,
      clicks: sql<number>`COALESCE((SELECT count(*) FROM click_logs c WHERE c.article_id = ${articles.id}), 0)`,
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
