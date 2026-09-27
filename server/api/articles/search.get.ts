import { defineEventHandler, getQuery, createError } from 'h3'
import { sql } from 'drizzle-orm'
import { useDb, ensureFts } from '../../utils/db'

// GET /api/articles/search?q=xxx&limit=20
// FTS5 全文搜索（trigram，中文子串匹配），长词走 MATCH，短词（<3 字）降级 LIKE
// 过滤：仅 published 且未过期（排除 deleted / expired）
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const keyword = typeof q.q === 'string' ? q.q.trim() : ''
  const limit = Math.min(Number(q.limit) || 20, 50)
  if (!keyword) return { list: [], hasMore: false }
  if (keyword.length > 50) throw createError({ statusCode: 400, statusMessage: '关键词过长' })

  const db = useDb()
  await ensureFts()

  // 过滤条件：已发布 + 未过期
  const base = `a.status = 'published' AND (a.expires_at IS NULL OR a.expires_at > datetime('now'))`

  let rows: any[]
  if (keyword.length >= 3) {
    // trigram 子串匹配（引号包短语，去掉可能破坏 MATCH 语法的字符）
    const safe = keyword.replace(/"/g, '')
    const res = await db.run(
      sql`SELECT a.id, a.title, a.summary, a.category, a.expires_at, a.updated_at,
                 bm25(articles_fts) AS score
          FROM articles_fts f
          JOIN articles a ON a.rowid = f.rowid
          WHERE ${sql.raw(base)} AND articles_fts MATCH ${'"' + safe + '"'}
          ORDER BY score
          LIMIT ${limit}`,
    )
    rows = res.results as any[]
  } else {
    // 短词降级 LIKE（2 字中文常用词）
    const like = `%${keyword}%`
    const res = await db.run(
      sql`SELECT a.id, a.title, a.summary, a.category, a.expires_at, a.updated_at
          FROM articles a
          WHERE ${sql.raw(base)} AND (a.title LIKE ${like} OR a.summary LIKE ${like})
          ORDER BY a.updated_at DESC
          LIMIT ${limit}`,
    )
    rows = res.results as any[]
  }

  return { list: rows, hasMore: rows.length >= limit }
})
