import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { articles } from '../../../db/schema'

// PUT /api/admin/articles/:id?key=xxx —— 修改文章（整篇覆盖，表单回填）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing id' })
  const body = await readBody(event)
  if (!body || typeof body.title !== 'string' || !body.title.trim()) {
    throw createError({ statusCode: 400, statusMessage: '标题必填' })
  }
  const content = normalizeJson(body.content)
  if (content === null) throw createError({ statusCode: 400, statusMessage: 'content 必须是合法 JSON（段落数组）' })

  const db = useDb()
  const [exist] = await db.select({ id: articles.id }).from(articles).where(eq(articles.id, id)).limit(1)
  if (!exist) throw createError({ statusCode: 404, statusMessage: '文章不存在' })

  await db.update(articles).set({
    title: body.title.trim(),
    summary: typeof body.summary === 'string' ? body.summary : '',
    content,
    category: body.category,
    tags: normalizeJson(body.tags) ?? '[]',
    status: body.status === 'published' ? 'published' : 'draft',
    expiresAt: body.expiresAt ? String(body.expiresAt) : null,
    links: normalizeJson(body.links) ?? '[]',
    friendLinks: normalizeJson(body.friendLinks) ?? '[]',
    relatedIds: normalizeJson(body.relatedIds) ?? '[]',
    faq: normalizeJson(body.faq) ?? '[]',
    updatedAt: new Date().toISOString(),
  }).where(eq(articles.id, id))

  return { id, ok: true }
})

function normalizeJson(v: any): string | null {
  if (v == null || v === '') return '[]'
  if (typeof v === 'string') {
    try { return JSON.stringify(JSON.parse(v)) } catch { return null }
  }
  try { return JSON.stringify(v) } catch { return null }
}
