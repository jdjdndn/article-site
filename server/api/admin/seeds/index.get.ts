import { defineEventHandler, getQuery, createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { seeds } from '../../../db/schema'
import { and, eq, desc, sql } from 'drizzle-orm'

// GET /api/admin/seeds?key=xxx&status=pending|done|failed|all&page=1&size=50
// 素材池列表（脚本用 status=pending 拉取待处理）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const q = getQuery(event)
  const status = typeof q.status === 'string' && q.status !== 'all' ? q.status : undefined
  const page = Math.max(1, Number(q.page) || 1)
  const size = Math.min(200, Math.max(1, Number(q.size) || 50))
  const offset = (page - 1) * size

  const db = useDb()
  const where = status ? and(eq(seeds.status, status)) : undefined
  const list = await db
    .select({
      id: seeds.id,
      raw: seeds.raw,
      category: seeds.category,
      template: seeds.template,
      status: seeds.status,
      publishAt: seeds.publishAt,
      expiresAt: seeds.expiresAt,
      articleId: seeds.articleId,
      error: seeds.error,
      source: seeds.source,
      fp: seeds.fp,
      createdAt: seeds.createdAt,
      updatedAt: seeds.updatedAt,
    })
    .from(seeds)
    .where(where)
    .orderBy(desc(seeds.id))
    .limit(size)
    .offset(offset)

  const [cnt] = await db
    .select({ n: sql<number>`count(*)` })
    .from(seeds)
    .where(where)

  return { ok: true, list, page, size, total: cnt?.n ?? 0 }
})
