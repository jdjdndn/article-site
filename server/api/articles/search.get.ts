import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { sql } from 'drizzle-orm'
import { useDb, ensureFts } from '../../utils/db'
import { searchLogs } from '../../db/schema'
import { toListItem } from '../../utils/content'
import { rateLimit } from '../../utils/ratelimit'

// GET /api/articles/search?q=xxx&page=1&limit=20
// FTS5 全文搜索（trigram，中文子串匹配），长词走 MATCH，短词（<3 字）降级 LIKE
// 分页：OFFSET 翻页（文章量级小，浅翻页足够；返回 hasMore + nextPage 供"加载更多"）
// 过滤：仅 published 且未过期（排除 deleted / expired）
// 顺带记录搜索词（search_logs，量小；cron 定期清理）
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const keyword = typeof q.q === 'string' ? q.q.trim() : ''
  const limit = Math.min(Number(q.limit) || 20, 50)
  const page = Math.max(1, Number(q.page) || 1)
  const offset = (page - 1) * limit
  if (!keyword) return { list: [], hasMore: false, nextPage: null }
  if (keyword.length > 50) throw createError({ statusCode: 400, statusMessage: '关键词过长' })

  // IP 限频兜底（防脚本刷 search_logs / 拖垮 FTS 查询；本地/dev 无 CF 头则跳过）
  const ip = getRequestHeader(event, 'cf-connecting-ip') || ''
  if (ip && !(await rateLimit('ip:' + ip + ':search', 3600e3, 300))) {
    throw createError({ statusCode: 429, statusMessage: '搜索太频繁，请稍后再试' })
  }

  const db = useDb()
  await ensureFts()

  // 记录搜索词（不阻塞主查询）
  try {
    await db.insert(searchLogs).values({ q: keyword.slice(0, 50), createdAt: new Date().toISOString() })
  } catch { /* 记录失败不影响搜索 */ }

  // 过滤条件：已发布 + 未过期
  const base = `a.status = 'published' AND (a.expires_at IS NULL OR datetime(a.expires_at) > datetime('now'))`

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
          LIMIT ${limit} OFFSET ${offset}`,
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
          LIMIT ${limit} OFFSET ${offset}`,
    )
    rows = res.results as any[]
  }

  // 提取首图，content 不返回
  const list = rows.map((r: any) => toListItem(r))

  const hasMore = rows.length >= limit
  return { list, hasMore, nextPage: hasMore ? page + 1 : null }
})
