import { defineEventHandler, getQuery, createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { reports } from '../../../db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'

// GET /api/admin/reports?key=&status=open|all&page=1&size=50 —— 用户纠错反馈
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const q = getQuery(event)
  const status = typeof q.status === 'string' && q.status === 'all' ? undefined : 'open'
  const page = Math.max(1, Number(q.page) || 1)
  const size = Math.min(100, Math.max(1, Number(q.size) || 50))
  const offset = (page - 1) * size

  const db = useDb()
  const where = status ? and(eq(reports.status, status)) : undefined
  const list = await db
    .select({
      id: reports.id,
      articleId: reports.articleId,
      content: reports.content,
      status: reports.status,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .where(where)
    .orderBy(desc(reports.id))
    .limit(size)
    .offset(offset)

  const [cnt] = await db.select({ n: sql<number>`count(*)` }).from(reports).where(where)
  return { ok: true, list, page, size, total: cnt?.n ?? 0 }
})
