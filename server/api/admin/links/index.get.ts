import { defineEventHandler, getQuery, createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { listLinks } from '../../../utils/links'

// GET /api/admin/links（Bearer 鉴权） —— 后台链接管理列表
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const q = getQuery(event)
  const status = typeof q.status === 'string' ? q.status : 'all'
  const page = Math.max(1, Number(q.page) || 1)
  const size = Math.min(100, Math.max(1, Number(q.size) || 50))
  const articleId = typeof q.articleId === 'string' && q.articleId ? q.articleId : undefined

  const db = useDb()
  const offset = (page - 1) * size
  const list = await listLinks(db, { offset, limit: size, status, articleId })
  return { ok: true, list, page, size, total: list.length }
})
