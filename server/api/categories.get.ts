import { defineEventHandler, getQuery } from 'h3'
import { useDb } from '../utils/db'
import { articles } from '../db/schema'
import { sql } from 'drizzle-orm'

// GET /api/categories —— 各分类已发布文章数（首页 tab 空分类置灰）
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const db = useDb()
  const res = await db.run(sql`
    SELECT category, count(*) AS n FROM articles
    WHERE status = 'published'
    GROUP BY category ORDER BY n DESC`)
  const counts = (res.results || []) as { category: string; n: number }[]
  const map: Record<string, number> = {}
  for (const r of counts) map[r.category] = r.n
  return { ok: true, counts: map }
})
