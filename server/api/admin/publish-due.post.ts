import { defineEventHandler } from 'h3'
import { and, eq, lte, count } from 'drizzle-orm'
import { requireAdmin } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { articles } from '../../db/schema'

// POST /api/admin/publish-due（Bearer 鉴权）
// 发布到期草稿（draft + publish_at <= now → published），返回本次发布数。
// 本地脚本（库 runner 的 publishDueDrafts）在生成前调用，实现"优先发草稿"：
// 草稿先发布并计入当日已发布口径，剩余目标（dailyTarget - 已发布）由生成补足。
// 幂等：仅 draft 且到期才发布，重复调用不产生新发布。
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const db = useDb()
  const now = new Date().toISOString()
  const [before] = await db
    .select({ n: count() })
    .from(articles)
    .where(and(eq(articles.status, 'draft'), lte(articles.publishAt, now)))
  const published = before?.n || 0
  if (published > 0) {
    await db
      .update(articles)
      .set({ status: 'published', updatedAt: now })
      .where(and(eq(articles.status, 'draft'), lte(articles.publishAt, now)))
  }
  return { ok: true, published }
})
