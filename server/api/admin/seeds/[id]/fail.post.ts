import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { seeds } from '../../../../db/schema'

// POST /api/admin/seeds/:id/fail（Bearer 鉴权） —— 脚本处理失败：标记 failed + 原因（可重试）
// body: { error }
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, statusMessage: 'missing id' })
  const body = await readBody(event)

  const db = useDb()
  await db.update(seeds).set({
    status: 'failed',
    error: typeof body?.error === 'string' ? body.error.slice(0, 500) : '未知错误',
    updatedAt: new Date().toISOString(),
  }).where(eq(seeds.id, id))
  return { ok: true }
})
