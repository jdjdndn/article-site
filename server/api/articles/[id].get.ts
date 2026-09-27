import { defineEventHandler, getRouterParam, getQuery, createError } from 'h3'
import { eq, and, sql, desc } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { articles, favorites } from '../../db/schema'

// GET /api/articles/:id
// 返回完整文章 + related（6.2 判定：related_ids → 标签重叠 → 同分类兜底）+ 收藏状态（?fp= 可选）
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'missing id' })
  const db = useDb()

  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, id), eq(articles.status, 'published'), sql`(expires_at IS NULL OR expires_at > datetime('now'))`))
    .limit(1)

  if (!article) throw createError({ statusCode: 404, message: '文章不存在或已下架' })

  // 收藏统计 + 当前设备是否已收藏
  const [fav] = await db
    .select({ n: sql<number>`count(*)` })
    .from(favorites)
    .where(eq(favorites.articleId, id))
  const q = getQuery(event)
  const fp = typeof q.fp === 'string' && q.fp ? q.fp.slice(0, 128) : ''
  let favorited = false
  if (fp) {
    const [mine] = await db
      .select({ id: favorites.id })
      .from(favorites)
      .where(and(eq(favorites.articleId, id), eq(favorites.deviceFp, fp)))
      .limit(1)
    favorited = !!mine
  }

  // 相关文章：related_ids 优先
  let related: any[] = []
  try {
    const ids = JSON.parse(article.relatedIds || '[]')
    if (ids.length) {
      related = await db
        .select({ id: articles.id, title: articles.title, summary: articles.summary })
        .from(articles)
        .where(and(sql`id IN (${ids.map((i: string) => `'${i}'`).join(',')})`, eq(articles.status, 'published')))
        .limit(6)
    }
  } catch { /* related_ids 解析失败则走兜底 */ }

  // 兜底：同分类最新
  if (!related.length) {
    related = await db
      .select({ id: articles.id, title: articles.title, summary: articles.summary })
      .from(articles)
      .where(and(eq(articles.category, article.category), eq(articles.status, 'published'), sql`id != ${article.id}`))
      .orderBy(desc(articles.updatedAt))
      .limit(6)
  }

  // JSON 字段还原为对象
  const parsed = {
    ...article,
    content: safeJson(article.content),
    tags: safeJson(article.tags),
    links: safeJson(article.links),
    friendLinks: safeJson(article.friendLinks),
    relatedIds: safeJson(article.relatedIds),
    faq: safeJson(article.faq),
  }

  return { article: parsed, related, favoriteCount: fav?.n ?? 0, favorited }
})

function safeJson(s: string | null, fallback: any = []) {
  if (!s) return fallback
  try { return JSON.parse(s) } catch { return fallback }
}
