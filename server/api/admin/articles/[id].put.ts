import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { articles } from '../../../db/schema'
import { checkArticleSafety } from '../../../utils/content-safety'

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

  const now = new Date().toISOString()
  // 定时发布：publishAt 已到 → 发布；未到 → 草稿（等 cron）
  const publishAt = body.publishAt ? String(body.publishAt) : null
  let status = body.status === 'published' ? 'published' : 'draft'
  if (publishAt && publishAt > now) status = 'draft'

  // 内容安全兜底：命中违规词 → 强制草稿待人工审核
  const safety = checkArticleSafety({ title: body.title, summary: body.summary, content })
  const safetyHits = safety.hits.length > 0 && status === 'published' ? safety.hits : []
  const needsReview = safetyHits.length > 0 ? 1 : 0
  if (safetyHits.length > 0) status = 'draft'

  await db.update(articles).set({
    title: body.title.trim(),
    summary: typeof body.summary === 'string' ? body.summary : '',
    content,
    template: ['deal', 'guide', 'faq'].includes(body.template) ? body.template : 'default',
    category: body.category,
    tags: normalizeJson(body.tags) ?? '[]',
    status: status === 'published' ? 'published' : 'draft',
    needsReview,
    publishAt,
    expiresAt: body.expiresAt ? String(body.expiresAt) : null,
    links: normalizeJson(body.links) ?? '[]',
    friendLinks: normalizeJson(body.friendLinks) ?? '[]',
    relatedIds: normalizeJson(body.relatedIds) ?? '[]',
    faq: normalizeJson(body.faq) ?? '[]',
    updatedAt: now,
  }).where(eq(articles.id, id))

  return { id, ok: true, safetyHits }
})

function normalizeJson(v: any): string | null {
  if (v == null || v === '') return '[]'
  if (typeof v === 'string') {
    try { return JSON.stringify(JSON.parse(v)) } catch { return null }
  }
  try { return JSON.stringify(v) } catch { return null }
}
