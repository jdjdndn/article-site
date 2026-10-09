import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { articles } from '../../../db/schema'
import { checkArticleSafety } from '../../../utils/content-safety'
import { buildLinkStatements } from '../../../utils/links'
import { purgeArticle } from '../../../utils/cache'
import { firstImageOf, safeJson, normalizeJson } from '../../../utils/content'
import { writeArticleContent } from '../../../utils/r2'

// PUT /api/admin/articles/:id（Bearer 鉴权） —— 修改文章（整篇覆盖，表单回填）
// R2+D1 架构：D1 存元数据，正文 content/friendLinks/faq/relatedIds 存 R2
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
  const safety = checkArticleSafety({
    title: body.title, summary: body.summary, content,
    faq: body.faq, tags: body.tags, links: body.links, friendLinks: body.friendLinks,
  })
  const safetyHits = safety.hits.length > 0 && status === 'published' ? safety.hits : []
  const needsReview = safetyHits.length > 0 ? 1 : 0
  if (safetyHits.length > 0) status = 'draft'

  // D1：元数据 only
  const updateStmt = db.update(articles).set({
    title: body.title.trim(),
    summary: typeof body.summary === 'string' ? body.summary : '',
    firstImage: firstImageOf(safeJson(content)) || '',
    template: ['deal', 'guide', 'faq'].includes(body.template) ? body.template : 'default',
    category: body.category,
    tags: normalizeJson(body.tags) ?? '[]',
    status: status === 'published' ? 'published' : 'draft',
    needsReview,
    publishAt,
    expiresAt: body.expiresAt ? String(body.expiresAt) : null,
    updatedAt: now,
  }).where(eq(articles.id, id))
  const linkStmts = buildLinkStatements(db, id, Array.isArray(body.links) ? body.links : [], now)
  await db.batch([updateStmt, ...linkStmts])

  // R2：正文数据
  await writeArticleContent(id, {
    content,
    friendLinks: normalizeJson(body.friendLinks) ?? '[]',
    faq: normalizeJson(body.faq) ?? '[]',
    relatedIds: normalizeJson(body.relatedIds) ?? '[]',
  }).catch(() => {})

  // 定点失效边缘缓存（详情页 + 首页），失败最多延迟 TTL
  await purgeArticle(id)

  return { id, ok: true, safetyHits }
})
