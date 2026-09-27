import { defineEventHandler, getRouterParam, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { articles } from '../../../../db/schema'
import { purgeArticle } from '../../../../utils/cache'

// DELETE /api/admin/articles/:id/permanent?key=xxx —— 真删除（物理删除，仅回收站内文章）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing id' })
  const db = useDb()

  const [exist] = await db.select({ id: articles.id, status: articles.status }).from(articles).where(eq(articles.id, id)).limit(1)
  if (!exist) throw createError({ statusCode: 404, statusMessage: '文章不存在' })
  if (exist.status !== 'deleted') throw createError({ statusCode: 400, statusMessage: '仅回收站内的文章可永久删除' })

  await db.delete(articles).where(eq(articles.id, id))
  await purgeArticle(id)
  return { id, ok: true, permanent: true }
})
