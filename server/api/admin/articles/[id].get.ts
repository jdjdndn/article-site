import { defineEventHandler, getRouterParam, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { articles } from '../../../db/schema'
import { getAllArticleLinks } from '../../../utils/links'
import { readArticleContent } from '../../../utils/r2'

// GET /api/admin/articles/:id（Bearer 鉴权） —— 后台详情（任意状态，供编辑回填）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing id' })
  const db = useDb()

  const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1)
  if (!article) throw createError({ statusCode: 404, statusMessage: '文章不存在' })

  const linkRows = await getAllArticleLinks(db, id)
  const r2Body = await readArticleContent(id).catch(() => null)
  return {
    article: {
      ...article,
      content: safeJson(r2Body?.content ?? null),
      tags: safeJson(article.tags),
      links: linkRows,
      friendLinks: safeJson(r2Body?.friendLinks ?? null),
      relatedIds: safeJson(r2Body?.relatedIds ?? null),
      faq: safeJson(r2Body?.faq ?? null),
    },
  }
})

function safeJson(s: string | null, fallback: any = []) {
  if (!s) return fallback
  try { return JSON.parse(s) } catch { return fallback }
}
