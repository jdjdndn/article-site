import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { articles, clickLogs, seeds } from '../../db/schema'
import { sql } from 'drizzle-orm'

// GET /api/admin/stats?key=xxx —— 后台最小看板（聚合查询，admin-only，量级小）
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
  }
})
