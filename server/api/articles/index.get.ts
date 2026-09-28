import { defineEventHandler, getQuery } from 'h3'
import { and, eq, lt, desc, sql, or } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { articles } from '../../db/schema'
import { toListItem } from '../../utils/content'

// GET /api/articles?category=xx&cursor=xxx&limit=20
// 列表只回摘要（性能），游标分页（避免 OFFSET）
// 游标为复合键 `${updatedAt}|${id}`（避免批量入库同秒时间戳导致的漏页）
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const category = typeof q.category === 'string' ? q.category : ''
  const cursor = typeof q.cursor === 'string' ? q.cursor : ''
  const limit = Math.min(Number(q.limit) || 20, 50)
  const db = useDb()

  const conds = [
    eq(articles.status, 'published'),
    // 未过期
    sql`(expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
  ]
  if (category) conds.push(eq(articles.category, category))
  if (cursor) {
    const [u, i] = cursor.split('|')
    if (u && i) {
      conds.push(or(lt(articles.updatedAt, u), and(eq(articles.updatedAt, u), lt(articles.id, i))))
    }
  }

  const list = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      category: articles.category,
      tags: articles.tags,
      expiresAt: articles.expiresAt,
      updatedAt: articles.updatedAt,
      firstImage: articles.firstImage,
    })
    .from(articles)
    .where(and(...conds))
    .orderBy(desc(articles.updatedAt), desc(articles.id))
    .limit(limit + 1)

  const hasMore = list.length > limit
  const rows = hasMore ? list.slice(0, limit) : list
  const nextCursor = hasMore && rows.length ? `${rows[rows.length - 1].updatedAt}|${rows[rows.length - 1].id}` : null

  // first_image 列已由写入端维护；存量 NULL 的行仍用 content 兜底解析（content 只在为空时拉取）
  const withImg = rows.map((r: any) => toListItem(r))

  return { list: withImg, nextCursor, hasMore }
})
