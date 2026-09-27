import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { seeds } from '../../../db/schema'

// PUT /api/admin/seeds/:id?key=xxx —— 编辑素材（仅未处理可编辑）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, statusMessage: 'missing id' })
  const body = await readBody(event)
  const db = useDb()

  const [exist] = await db.select({ id: seeds.id, status: seeds.status }).from(seeds).where(eq(seeds.id, id)).limit(1)
  if (!exist) throw createError({ statusCode: 404, statusMessage: '素材不存在' })
  if (exist.status === 'done') throw createError({ statusCode: 400, statusMessage: '已生成的素材不可编辑' })

  const set: any = { updatedAt: new Date().toISOString() }
  if (typeof body.raw === 'string' && body.raw.trim().length >= 8) set.raw = body.raw.trim()
  if (typeof body.category === 'string' && body.category) set.category = body.category
  if (typeof body.template === 'string' && ['deal', 'guide', 'faq', 'default'].includes(body.template)) set.template = body.template
  if (body.publishAt !== undefined) set.publishAt = body.publishAt ? String(body.publishAt) : null
  if (body.expiresAt !== undefined) set.expiresAt = body.expiresAt ? String(body.expiresAt) : null
  if (body.status === 'failed' || body.status === 'pending') { set.status = body.status; set.error = null }

  await db.update(seeds).set(set).where(eq(seeds.id, id))
  return { ok: true }
})
