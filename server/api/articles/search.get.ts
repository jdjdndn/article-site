import { defineEventHandler, getQuery, createError } from 'h3'
import { sql } from 'drizzle-orm'
import { useDb, ensureFts } from '../../utils/db'
import { searchLogs } from '../../db/schema'

// GET /api/articles/search?q=xxx&limit=20
// FTS5 全文搜索（trigram，中文子串匹配），长词走 MATCH，短词（<3 字）降级 LIKE
// 过滤：仅 published 且未过期（排除 deleted / expired）
// 顺带记录搜索词（search_logs，量小；cron 定期清理）
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const keyword = typeof q.q === 'string' ? q.q.trim() : ''
  const limit = Math.min(Number(q.limit) || 20, 50)
  if (!keyword) return { list: [], hasMore: false }
  if (keyword.length > 50) throw createError({ statusCode: 400, statusMessage: '关键词过长' })

  const db = useDb()
  await ensureFts()

  // 记录搜索词（不阻塞主查询）
  try {
    await db.insert(searchLogs).values({ q: keyword.slice(0, 50), createdAt: new Date().toISOString() })
  } catch { /* 记录失败不影响搜索 */ }

  // 过滤条件：已发布 + 未过期
  const base = `a.status = 'published' AND (a.expires_at IS NULL OR a.expires_at > datetime('now'))`

  let rows: any[]
  if (keyword.length >= 3) {
    // trigram 子串匹配（引号包短语，去掉可能破坏 MATCH 语法的字符）
    const safe = keyword.replace(/"/g, '')
    const res = await db.run(
      sql`SELECT a.id, a.title, a.summary, a.category, a.expires_at, a.updated_at, a.content,
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
      sql`SELECT a.id, a.title, a.summary, a.category, a.expires_at, a.updated_at, a.content
          FROM articles a
          WHERE ${sql.raw(base)} AND (a.title LIKE ${like} OR a.summary LIKE ${like})
          ORDER BY a.updated_at DESC
          LIMIT ${limit}`,
    )
    rows = res.results as any[]
  }

  // 提取首图，content 不返回
  const list = rows.map((r: any) => {
    let firstImage = ''
    try {
      const c = typeof r.content === 'string' ? JSON.parse(r.content) : r.content
      if (Array.isArray(c)) {
        const b = c.find((x: any) => x?.type === 'image' && x?.url)
        if (b?.url) firstImage = b.url
      }
    } catch { /* 结构异常忽略 */ }
    const { content, ...rest } = r
    return { ...rest, firstImage }
  })

  return { list, hasMore: rows.length >= limit }
})
