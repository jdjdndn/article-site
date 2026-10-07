import { and, eq, lte, sql } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { articles, clickLogs, searchLogs, runLogs } from '../db/schema'

// 定时发布/过期处理（原 */5 cron 的 publish-on-schedule 职责）：
// 1) 到期的定时文章（draft + publish_at <= now）→ published
// 2) 过期的已发布文章（published + expires_at <= now）→ expired
// 3) 清理 90 天前的点击/搜索日志（走索引，通常 0 行）
// 原挂 cloudflare:scheduled hook（随 */5 cron 删除而废弃），现由 durable-alarm.ts 在 DO alarm
// 触发时调用 runPublishOnSchedule()（每日一次）。逻辑保持幂等不变。
export async function runPublishOnSchedule() {
  const db = useDb()
  const now = new Date().toISOString()
  try {
    await db.update(articles)
      .set({ status: 'published', updatedAt: now })
      .where(and(eq(articles.status, 'draft'), lte(articles.publishAt, now)))
    await db.update(articles)
      .set({ status: 'expired', updatedAt: now })
      .where(and(eq(articles.status, 'published'), lte(articles.expiresAt, now)))
    await db.delete(clickLogs).where(sql`datetime(created_at) < datetime('now', '-90 days')`)
    await db.delete(searchLogs).where(sql`datetime(created_at) < datetime('now', '-90 days')`)
    await db.delete(runLogs).where(sql`datetime(run_at) < datetime('now', '-90 days')`)
  } catch (err) {
    console.error('[scheduled-publish] error:', err)
  }
}
