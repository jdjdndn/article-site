import { defineEventHandler, getQuery, createError } from 'h3'
import { eq, desc, and, sql } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { favorites, articles } from '../db/schema'
import { toListItem } from '../utils/content'

// GET /api/favorites?fp=xxx —— 某设备指纹的收藏列表（仅已发布未过期）
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

  const list = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      category: articles.category,
      expiresAt: articles.expiresAt,
      content: articles.content,
      favoritedAt: favorites.createdAt,
    })
    .from(favorites)
    .innerJoin(articles, eq(favorites.articleId, articles.id))
    .where(and(
      eq(favorites.deviceFp, fp),
      eq(articles.status, 'published'),
      sql`(articles.expires_at IS NULL OR articles.expires_at > datetime('now'))`,
    ))
    .orderBy(desc(favorites.createdAt))
    .limit(100)

  return { list: list.map((r: any) => {
    const { content, ...rest } = r
    return toListItem({ ...rest, content })
  }) }
})
