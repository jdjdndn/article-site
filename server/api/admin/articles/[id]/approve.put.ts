import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { articles } from '../../../../db/schema'

// PUT /api/admin/articles/:id/approve?key=xxx —— 人工审核通过
// body: { status?: 'published' | 'draft' }（默认保持当前状态，仅清除待审标记）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing id' })
  const body = await readBody(event).catch(() => ({}))

  const db = useDb()
  const [exist] = await db
    .select({ id: articles.id, status: articles.status })
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1)
  if (!exist) throw createError({ statusCode: 404, statusMessage: '文章不存在' })

  // 仅待审文章可被"通过"，防止误操作
  const now = new Date().toISOString()
  const nextStatus = body.status === 'published' ? 'published' : body.status === 'draft' ? 'draft' : exist.status

  await db
    .update(articles)
    .set({ needsReview: 0, status: nextStatus, updatedAt: now })
    .where(eq(articles.id, id))

  return { id, ok: true, status: nextStatus }
})
