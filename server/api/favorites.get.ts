import { defineEventHandler, getQuery, createError } from 'h3'
import { eq, desc, and, lt, or, sql } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { favorites, articles } from '../db/schema'
import { toListItem } from '../utils/content'

// GET /api/favorites?fp=xxx —— 某设备指纹的收藏列表（仅已发布未过期）
// ?category=优惠 —— 按分类过滤（收藏页分类 tab，服务端过滤配合游标分页，避免"前端过滤+分页错位"）
// ?cursor=createdAt|id&limit=30 —— 游标分页（createdAt desc, id desc 复合游标；收藏页"加载更多"）
// ?idsOnly=1 —— 只返回收藏的文章 id（首页列表星标状态用，轻量；上限 300 与收藏防刷上限一致）
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const fp = typeof q.fp === 'string' && q.fp ? q.fp.slice(0, 128) : ''
  if (!fp) throw createError({ statusCode: 400, statusMessage: '缺少设备指纹' })

  const db = useDb()

  if (q.idsOnly === '1' || q.idsOnly === 1 || q.idsOnly === true) {
    const rows = await db
      .select({ articleId: favorites.articleId })
      .from(favorites)
      .where(eq(favorites.deviceFp, fp))
      .orderBy(desc(favorites.createdAt))
      .limit(300)
    return { ids: rows.map((r) => r.articleId) }
  }

  const category = typeof q.category === 'string' && q.category ? q.category : ''
  const cursor = typeof q.cursor === 'string' ? q.cursor : ''
  const limit = Math.min(Number(q.limit) || 30, 50)

  const conds = [
    eq(favorites.deviceFp, fp),
    eq(articles.status, 'published'),
    sql`(articles.expires_at IS NULL OR datetime(articles.expires_at) > datetime('now'))`,
  ]
  if (category) conds.push(eq(articles.category, category))
  if (cursor) {
    const [c, i] = cursor.split('|')
    if (c && i) {
      conds.push(or(lt(favorites.createdAt, c), and(eq(favorites.createdAt, c), lt(favorites.id, Number(i)))))
    }
  }

  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      category: articles.category,
      expiresAt: articles.expiresAt,
      firstImage: articles.firstImage,
      favoritedAt: favorites.createdAt,
      favId: favorites.id,
    })
    .from(favorites)
    .innerJoin(articles, eq(favorites.articleId, articles.id))
    .where(and(...conds))
    .orderBy(desc(favorites.createdAt), desc(favorites.id))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore && page.length ? `${page[page.length - 1].favoritedAt}|${page[page.length - 1].favId}` : null

  return { list: page.map((r: any) => toListItem(r)), hasMore, nextCursor }
})
