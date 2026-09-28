import { defineEventHandler, getRouterParam, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { reports } from '../../../db/schema'

// PUT /api/admin/reports/:id（Bearer 鉴权） —— 标记已处理
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, statusMessage: 'missing id' })
  const db = useDb()

  const [exist] = await db.select({ id: reports.id }).from(reports).where(eq(reports.id, id)).limit(1)
  if (!exist) throw createError({ statusCode: 404, statusMessage: '反馈不存在' })
  await db.update(reports).set({ status: 'done', updatedAt: new Date().toISOString() }).where(eq(reports.id, id))
  return { ok: true }
})
