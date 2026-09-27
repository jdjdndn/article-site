import { defineEventHandler, getQuery, createError } from 'h3'
import { eq, desc, and, sql } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { favorites, articles } from '../db/schema'

// GET /api/favorites?fp=xxx —— 某设备指纹的收藏列表（仅已发布未过期）
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const fp = typeof q.fp === 'string' && q.fp ? q.fp.slice(0, 128) : ''
  if (!fp) throw createError({ statusCode: 400, statusMessage: '缺少设备指纹' })

  const db = useDb()
  const list = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      category: articles.category,
      expiresAt: articles.expiresAt,
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

  return { list }
})
