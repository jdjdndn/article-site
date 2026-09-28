import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { articles, clickLogs, seeds, searchLogs, reports } from '../../db/schema'
import { sql } from 'drizzle-orm'

// GET /api/admin/stats?key=xxx —— 后台看板（聚合查询，admin-only，量级小）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const db = useDb()

  const [total] = await db.select({ n: sql<number>`count(*)` }).from(articles)
  const byStatus = await db
    .select({ status: articles.status, n: sql<number>`count(*)` })
    .from(articles)
    .groupBy(articles.status)
  const byCategory = await db
    .select({ category: articles.category, n: sql<number>`count(*) as n` })
    .from(articles)
    .where(sql`status = 'published'`)
    .groupBy(articles.category)
    .orderBy(sql`n DESC`)
    .limit(10)

  const [clicks] = await db.select({ n: sql<number>`count(*)` }).from(clickLogs)
  const [todayClicks] = await db
    .select({ n: sql<number>`count(*)` })
    .from(clickLogs)
    .where(sql`created_at >= date('now')`)
  const [pendingSeeds] = await db
    .select({ n: sql<number>`count(*)` })
    .from(seeds)
    .where(sql`status = 'pending'`)

  // 文章级点击 Top10（join 文章信息）
  const topRes = await db.run(sql`
    SELECT c.article_id, count(*) AS n, MAX(a.title) AS title, MAX(a.category) AS category
    FROM click_logs c LEFT JOIN articles a ON a.id = c.article_id
    GROUP BY c.article_id ORDER BY n DESC LIMIT 10`)
  const topClicks = (topRes.results || []) as { article_id: string; n: number; title: string | null; category: string | null }[]

  // 搜索词统计（今日）
  const [todaySearches] = await db
    .select({ n: sql<number>`count(*)` })
    .from(searchLogs)
    .where(sql`created_at >= date('now')`)
  const searchRes = await db.run(sql`
    SELECT q, count(*) AS n FROM search_logs
    WHERE created_at >= date('now')
    GROUP BY q ORDER BY n DESC LIMIT 10`)
  const topSearches = (searchRes.results || []) as { q: string; n: number }[]

  // 即将过期（7 天内到期的已发布文章；引流文无 expires_at 天然不在内）
  const expRes = await db.run(sql`
    SELECT id, title, expires_at FROM articles
    WHERE status = 'published' AND expires_at IS NOT NULL
      AND expires_at <= datetime('now', '+7 days')
    ORDER BY expires_at ASC LIMIT 20`)
  const expiringSoon = (expRes.results || []) as { id: string; title: string; expires_at: string }[]

  // 链接级点击 Top15（引流文归因：哪条软文链接被点得多）
  const linkRes = await db.run(sql`
    SELECT c.link_id, count(*) AS n, MAX(l.label) AS label, MAX(c.domain) AS domain, MAX(l.url) AS url
    FROM click_logs c LEFT JOIN links l ON l.id = c.link_id
    WHERE c.link_id IS NOT NULL
    GROUP BY c.link_id ORDER BY n DESC LIMIT 15`)
  const topLinks = (linkRes.results || []) as { link_id: number; n: number; label: string | null; domain: string | null; url: string | null }[]

  // 收藏 Top10（运营反馈：哪些内容值得收藏/复访）
  const favRes = await db.run(sql`
    SELECT f.article_id, count(*) AS n, MAX(a.title) AS title, MAX(a.category) AS category
    FROM favorites f LEFT JOIN articles a ON a.id = f.article_id
    GROUP BY f.article_id ORDER BY n DESC LIMIT 10`)
  const topFavorites = (favRes.results || []) as { article_id: string; n: number; title: string | null; category: string | null }[]

  // 待补链接文章数（已发布且没有任何链接的引流文——运营提醒）
  const [pendingLinksRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(articles)
    .where(sql`status = 'published' AND NOT EXISTS (SELECT 1 FROM links l WHERE l.article_id = articles.id)`)

  // 待处理反馈数
  const [openReports] = await db
    .select({ n: sql<number>`count(*)` })
    .from(reports)
    .where(sql`status = 'open'`)

  const statusMap: Record<string, number> = {}
  for (const r of byStatus) statusMap[r.status || '?'] = r.n

  return {
    ok: true,
    total: total?.n ?? 0,
    byStatus: statusMap,
    byCategory,
    clicks: clicks?.n ?? 0,
    todayClicks: todayClicks?.n ?? 0,
    pendingSeeds: pendingSeeds?.n ?? 0,
    topClicks,
    topLinks,
    topFavorites,
    todaySearches: todaySearches?.n ?? 0,
    topSearches,
    expiringSoon,
    pendingLinks: pendingLinksRow?.n ?? 0,
    openReports: openReports?.n ?? 0,
  }
})
