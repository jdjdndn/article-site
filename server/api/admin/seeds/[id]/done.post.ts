import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { seeds } from '../../../../db/schema'

// POST /api/admin/seeds/:id/done（Bearer 鉴权） —— 脚本处理成功：标记 done + 关联文章
// body: { articleId }
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, statusMessage: 'missing id' })
  const body = await readBody(event)
  const articleId = typeof body?.articleId === 'string' ? body.articleId : null

  const db = useDb()
  await db.update(seeds).set({
    status: 'done',
    articleId,
    error: null,
    updatedAt: new Date().toISOString(),
  }).where(eq(seeds.id, id))
  return { ok: true }
})
