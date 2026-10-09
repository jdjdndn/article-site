import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { articles } from '../../../db/schema'
import { checkArticleSafety } from '../../../utils/content-safety'
import { buildLinkStatements } from '../../../utils/links'
import { firstImageOf, safeJson, normalizeJson } from '../../../utils/content'
import { getSiteId, writeArticleContent } from '../../../utils/r2'

// POST /api/admin/articles（Bearer 鉴权） —— 手动新增文章（表单 → JSON → 入库）
// R2+D1 架构：D1 存元数据，正文 content/friendLinks/faq/relatedIds 存 R2
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  if (!body || typeof body.title !== 'string' || !body.title.trim()) {
    throw createError({ statusCode: 400, statusMessage: '标题必填' })
  }
  if (!body.category) {
    throw createError({ statusCode: 400, statusMessage: '分类必填' })
  }
  // content 必须为合法 JSON 数组（段落：text/ad）
  const content = normalizeJson(body.content)
  if (content === null) {
    throw createError({ statusCode: 400, statusMessage: 'content 必须是合法 JSON（段落数组）' })
  }

  const now = new Date().toISOString()
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const id = `a-${ymd}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`

  // 定时发布：publishAt 已到 → 直接发布；未到 → 强制草稿（等 cron 到点发布）
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

  const db = useDb()
  // D1：元数据 only
  const articleStmt = db.insert(articles).values({
    id,
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
    siteId: getSiteId(),
    createdAt: now,
    updatedAt: now,
  })
  const linkStmts = buildLinkStatements(db, id, Array.isArray(body.links) ? body.links : [], now)
  await db.batch([articleStmt, ...linkStmts])

  // R2：正文数据
  await writeArticleContent(id, {
    content,
    friendLinks: normalizeJson(body.friendLinks) ?? '[]',
    faq: normalizeJson(body.faq) ?? '[]',
    relatedIds: normalizeJson(body.relatedIds) ?? '[]',
  }).catch(() => {})

  return { id, ok: true, safetyHits }
})
