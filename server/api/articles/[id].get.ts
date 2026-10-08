import { defineEventHandler, getRouterParam, getQuery, createError } from 'h3'
import { eq, and, sql, desc } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { articles, favorites } from '../../db/schema'
import { getArticleLinks } from '../../utils/links'
import { computeRelatedArticles } from 'ai-article-pipeline'

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
    // 相关文章公共能力（库 computeRelatedArticles）：相似（分类/tags/文本）+ 互补（同分类不同角度）评分
    // 候选池 = 最近发布的 30 篇已发布文章（含同分类与跨分类），评分排序取前 6
    const candRows = await db
      .select({ id: articles.id, title: articles.title, summary: articles.summary, category: articles.category, tags: articles.tags })
      .from(articles)
      .where(and(
        eq(articles.status, 'published'),
        sql`id != ${article.id}`,
        sql`(expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
      ))
      .orderBy(desc(articles.updatedAt))
      .limit(30)
    const ids = computeRelatedArticles(
      { title: article.title, summary: article.summary, category: article.category, tags: safeJson(article.tags) },
      candRows.map((r: any) => ({ id: r.id, title: r.title, summary: r.summary, category: r.category, tags: safeJson(r.tags) })),
      { limit: 6 },
    )
    if (ids.length) {
      const rows = await db
        .select({ id: articles.id, title: articles.title, summary: articles.summary })
        .from(articles)
        .where(and(sql`id IN (${ids})`, eq(articles.status, 'published')))
        .limit(6)
      const byId = new Map(rows.map((x) => [x.id, x]))
      related = ids.map((i: string) => byId.get(i)).filter(Boolean)
    }
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
