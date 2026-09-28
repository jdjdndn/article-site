import { defineEventHandler, readBody, createError } from 'h3'
import { inArray } from 'drizzle-orm'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { updateLinks } from '../../../utils/links'
import { links } from '../../../db/schema'
import { purgeArticle } from '../../../utils/cache'

// POST /api/admin/links/batch（Bearer 鉴权） —— 批量操作链接（勾选停用/启用/批量设过期日期）
// body: { ids: number[], status?: 'active'|'inactive', expiresAt?: string|null }
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  const ids = Array.isArray(body?.ids) ? body.ids.filter((n: unknown) => Number.isInteger(n)) : []
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'ids 必填' })
  if (ids.length > 500) throw createError({ statusCode: 400, statusMessage: '单次最多 500 条' })

  const patch: { status?: string; expiresAt?: string | null } = {}
  if (body.status === 'active' || body.status === 'inactive') patch.status = body.status
  if (body.expiresAt !== undefined && body.expiresAt !== null) patch.expiresAt = String(body.expiresAt)
  if (!patch.status && patch.expiresAt === undefined) throw createError({ statusCode: 400, statusMessage: 'status 或 expiresAt 至少一项' })

  const db = useDb()
  // 受影响文章（用于 purge 详情缓存）
  const affected = await db
    .select({ articleId: links.articleId })
    .from(links)
    .where(inArray(links.id, ids as number[]))

  const n = await updateLinks(db, ids as number[], patch)
  for (const a of affected) await purgeArticle(a.articleId)
  return { ok: true, updated: n }
})
