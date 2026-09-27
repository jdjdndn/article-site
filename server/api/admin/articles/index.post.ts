import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { articles } from '../../../db/schema'

// POST /api/admin/articles?key=xxx —— 手动新增文章（表单 → JSON → 入库）
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

  const db = useDb()
  await db.insert(articles).values({
    id,
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
    createdAt: now,
    updatedAt: now,
  })

  return { id, ok: true }
})

function normalizeJson(v: any): string | null {
  if (v == null || v === '') return '[]'
  if (typeof v === 'string') {
    try { return JSON.stringify(JSON.parse(v)) } catch { return null }
  }
  try { return JSON.stringify(v) } catch { return null }
}
