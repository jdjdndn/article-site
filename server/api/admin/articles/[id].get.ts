import { defineEventHandler, getRouterParam, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { articles } from '../../../db/schema'
import { getAllArticleLinks } from '../../../utils/links'

// GET /api/admin/articles/:id（Bearer 鉴权） —— 后台详情（任意状态，供编辑回填）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing id' })
  const db = useDb()

  const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1)
  if (!article) throw createError({ statusCode: 404, statusMessage: '文章不存在' })

  const linkRows = await getAllArticleLinks(db, id)
  return {
    article: {
      ...article,
      content: safeJson(article.content),
      tags: safeJson(article.tags),
      links: linkRows,
      friendLinks: safeJson(article.friendLinks),
      relatedIds: safeJson(article.relatedIds),
      faq: safeJson(article.faq),
    },
  }
})

function safeJson(s: string | null, fallback: any = []) {
  if (!s) return fallback
  try { return JSON.parse(s) } catch { return fallback }
}
