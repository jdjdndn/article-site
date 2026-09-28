import { defineEventHandler, getRouterParam, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { seeds } from '../../../db/schema'

// DELETE /api/admin/seeds/:id（Bearer 鉴权） —— 删除素材（任何状态）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, statusMessage: 'missing id' })
  const db = useDb()

  const [exist] = await db.select({ id: seeds.id }).from(seeds).where(eq(seeds.id, id)).limit(1)
  if (!exist) throw createError({ statusCode: 404, statusMessage: '素材不存在' })
  await db.delete(seeds).where(eq(seeds.id, id))
  return { ok: true, deleted: id }
})
