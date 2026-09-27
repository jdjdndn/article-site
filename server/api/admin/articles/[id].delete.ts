import { defineEventHandler, getRouterParam, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { articles } from '../../../db/schema'

// DELETE /api/admin/articles/:id?key=xxx —— 软删除（status → deleted，进回收站）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing id' })
  const db = useDb()

  const [exist] = await db.select({ id: articles.id }).from(articles).where(eq(articles.id, id)).limit(1)
  if (!exist) throw createError({ statusCode: 404, statusMessage: '文章不存在' })

  await db.update(articles).set({ status: 'deleted', updatedAt: new Date().toISOString() }).where(eq(articles.id, id))
  return { id, ok: true, soft: true }
})
