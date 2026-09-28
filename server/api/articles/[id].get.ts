import { defineEventHandler, getRouterParam, getQuery, createError } from 'h3'
import { eq, and, sql, desc } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { articles, favorites } from '../../db/schema'
import { getArticleLinks } from '../../utils/links'

// GET /api/articles/:id
// 返回完整文章 + 有效链接（links 独立表，active 且未过期）+ related + 收藏状态
// expired/deleted → 返回 { status: 'gone', article, related }（前端渲染下架页 + noindex），仅 id 不存在才 404
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'missing id' })
  const db = useDb()

  const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1)

  if (!article) throw createError({ statusCode: 404, message: '文章不存在' })

  const gone = article.status === 'expired' || article.status === 'deleted'

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

  // 相关文章：related_ids 优先 → 同分类兜底
  // related_ids 用参数绑定（drizzle 数组展开为占位符），不做字符串拼接
  let related: any[] = []
  try {
    const ids = JSON.parse(article.relatedIds || '[]')
    if (Array.isArray(ids) && ids.length) {
      const idList = ids.slice(0, 6).map((i: any) => String(i)).filter(Boolean)
      if (idList.length) {
        related = await db
          .select({ id: articles.id, title: articles.title, summary: articles.summary })
          .from(articles)
          .where(and(
            sql`id IN (${idList})`,
            eq(articles.status, 'published'),
            sql`id != ${article.id}`,
            sql`(expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
          ))
          .limit(6)
      }
    }
  } catch { /* related_ids 解析失败则走兜底 */ }

  if (!related.length) {
    related = await db
      .select({ id: articles.id, title: articles.title, summary: articles.summary })
      .from(articles)
      .where(and(
        eq(articles.category, article.category),
        eq(articles.status, 'published'),
        sql`id != ${article.id}`,
        sql`(expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
      ))
      .orderBy(desc(articles.updatedAt))
      .limit(6)
  }

  // 有效链接（独立表）
  const linkRows = await getArticleLinks(db, id)

  const parsed = {
    ...article,
    content: safeJson(article.content),
    tags: safeJson(article.tags),
    links: linkRows,
    friendLinks: safeJson(article.friendLinks),
    relatedIds: safeJson(article.relatedIds),
    faq: safeJson(article.faq),
  }

  return { article: parsed, status: gone ? 'gone' : 'live', related, favoriteCount: fav?.n ?? 0, favorited }
})

function safeJson(s: string | null, fallback: any = []) {
  if (!s) return fallback
  try { return JSON.parse(s) } catch { return fallback }
}
