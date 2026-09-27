import { defineTask } from 'nitropack/runtime/task'
import { and, eq, lte } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { articles } from '../db/schema'

// 每分钟执行（CF Cron Trigger）：
// 1) 到期的定时文章（draft + publish_at <= now）→ published
// 2) 过期的已发布文章（published + expires_at <= now）→ expired
export default defineTask({
  meta: { name: 'publish-due', description: '发布到期定时文章 / 标记过期文章' },
  async run() {
    const db = useDb()
    const now = new Date().toISOString()

    // 定时发布
    const due = await db.update(articles)
      .set({ status: 'published', updatedAt: now })
      .where(and(eq(articles.status, 'draft'), lte(articles.publishAt, now)))
      .returning({ id: articles.id })

    // 到期过期（对前台列表查询的补充降权）
    const expired = await db.update(articles)
      .set({ status: 'expired', updatedAt: now })
      .where(and(eq(articles.status, 'published'), lte(articles.expiresAt, now)))
      .returning({ id: articles.id })

    return { result: { published: due.length, expired: expired.length } }
  },
})
