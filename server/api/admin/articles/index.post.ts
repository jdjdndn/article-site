import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { articles } from '../../../db/schema'
import { checkArticleSafety } from '../../../utils/content-safety'
import { buildLinkStatements } from '../../../utils/links'
import { firstImageOf, safeJson } from '../../../utils/content'

// POST /api/admin/articles（Bearer 鉴权） —— 手动新增文章（表单 → JSON → 入库）
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
  const safety = checkArticleSafety({ title: body.title, summary: body.summary, content })
  const safetyHits = safety.hits.length > 0 && status === 'published' ? safety.hits : []
  const needsReview = safetyHits.length > 0 ? 1 : 0
  if (safetyHits.length > 0) status = 'draft'

  const db = useDb()
  const articleStmt = db.insert(articles).values({
    id,
    title: body.title.trim(),
    summary: typeof body.summary === 'string' ? body.summary : '',
    content,
    firstImage: firstImageOf(safeJson(content)) || '',
    template: ['deal', 'guide', 'faq'].includes(body.template) ? body.template : 'default',
    category: body.category,
    tags: normalizeJson(body.tags) ?? '[]',
    status: status === 'published' ? 'published' : 'draft',
    needsReview,
    publishAt,
    expiresAt: body.expiresAt ? String(body.expiresAt) : null,
    links: '[]',
    friendLinks: normalizeJson(body.friendLinks) ?? '[]',
    relatedIds: normalizeJson(body.relatedIds) ?? '[]',
    faq: normalizeJson(body.faq) ?? '[]',
    createdAt: now,
    updatedAt: now,
  })
  const linkStmts = buildLinkStatements(db, id, Array.isArray(body.links) ? body.links : [], now)
  await db.batch([articleStmt, ...linkStmts])

  return { id, ok: true, safetyHits }
})

function normalizeJson(v: any): string | null {
  if (v == null || v === '') return '[]'
  if (typeof v === 'string') {
    try { return JSON.stringify(JSON.parse(v)) } catch { return null }
  }
  try { return JSON.stringify(v) } catch { return null }
}
