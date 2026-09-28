import { defineEventHandler, getQuery, createError } from 'h3'
import { eq, desc, lt, and } from 'drizzle-orm'
import { requireAdmin } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { articles } from '../../db/schema'

// GET /api/admin/trash（Bearer 鉴权） —— 回收站（status = deleted）
// 回收站内再次删除即真删（permanent）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const q = getQuery(event)
  const cursor = typeof q.cursor === 'string' ? q.cursor : ''
  const limit = Math.min(Number(q.limit) || 20, 100)
  const db = useDb()

  const conds = [eq(articles.status, 'deleted')]
  if (cursor) conds.push(lt(articles.updatedAt, cursor))

  const list = await db
    .select({
      id: articles.id,
      title: articles.title,
      category: articles.category,
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
