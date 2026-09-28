import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { articles } from '../../db/schema'
import { sql } from 'drizzle-orm'

// GET /api/admin/export（Bearer 鉴权） —— 内容批量导出（完整 JSON，含 content/faq/links/tags）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const q = getQuery(event)
  const status = typeof q.status === 'string' && q.status ? q.status : 'published'

  const db = useDb()
  const res = await db.run(sql`
    SELECT id, title, summary, content, category, template, tags, faq, links, status,
           publish_at, expires_at, created_at, updated_at, related_ids
    FROM articles WHERE status = ${status} ORDER BY updated_at DESC`)
  const list = res.results || []

  const stamp = new Date().toISOString().slice(0, 10)
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="articles-${status}-${stamp}.json"`)
  return { exportedAt: new Date().toISOString(), status, count: list.length, articles: list }
})
