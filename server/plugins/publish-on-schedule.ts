import { defineNitroPlugin } from 'nitropack/runtime/plugin'
import { and, eq, lte, sql } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { articles, clickLogs, searchLogs } from '../db/schema'

// Cloudflare Cron Trigger（*/5 * * * *）每 5 分钟触发 scheduled 事件：
// 1) 到期的定时文章（draft + publish_at <= now）→ published
// 2) 过期的已发布文章（published + expires_at <= now）→ expired
// 3) 清理 90 天前的点击/搜索日志（走索引，通常 0 行）
// 不用 Nitro scheduledTasks（该机制在 cloudflare_module preset 下未生效），
// 直接挂 cloudflare:scheduled hook，逻辑与任务文件等价、幂等。
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', async () => {
    const db = useDb()
    const now = new Date().toISOString()
    try {
      await db.update(articles)
        .set({ status: 'published', updatedAt: now })
        .where(and(eq(articles.status, 'draft'), lte(articles.publishAt, now)))
      await db.update(articles)
        .set({ status: 'expired', updatedAt: now })
        .where(and(eq(articles.status, 'published'), lte(articles.expiresAt, now)))
      await db.delete(clickLogs).where(sql`created_at < datetime('now', '-90 days')`)
      await db.delete(searchLogs).where(sql`created_at < datetime('now', '-90 days')`)
    } catch (err) {
      console.error('[scheduled-publish] error:', err)
    }
  })
})
