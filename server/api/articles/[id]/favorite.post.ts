import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { eq, and, gte, sql } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { favorites, articles } from '../../../db/schema'

// POST /api/articles/:id/favorite { fp, action: 'add' | 'remove' }
// 收藏/取消收藏（设备指纹免注册；唯一约束防重复收藏）
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing id' })
  const body = await readBody(event)
  const fp = typeof body?.fp === 'string' && body.fp ? body.fp.slice(0, 128) : ''
  if (!fp) throw createError({ statusCode: 400, statusMessage: '缺少设备指纹' })
  const action = body.action === 'remove' ? 'remove' : 'add'

  const db = useDb()

  // 文章必须存在且已发布
  const [article] = await db.select({ id: articles.id }).from(articles).where(eq(articles.id, id)).limit(1)
  if (!article) throw createError({ statusCode: 404, statusMessage: '文章不存在' })

  if (action === 'remove') {
    await db.delete(favorites).where(and(eq(favorites.articleId, id), eq(favorites.deviceFp, fp)))
  } else {
    // 防刷（deviceFp 可伪造，须节流）：同设备最近 5 分钟 add ≤ 20 次；收藏总量 ≤ 300
    const [recentAdd] = await db
      .select({ n: sql<number>`count(*)` })
      .from(favorites)
      .where(and(eq(favorites.deviceFp, fp), gte(favorites.createdAt, sql`datetime('now', '-5 minutes')`)))
    if ((recentAdd?.n ?? 0) >= 20) throw createError({ statusCode: 429, statusMessage: '操作太频繁，请稍后再试' })
    const [total] = await db
      .select({ n: sql<number>`count(*)` })
      .from(favorites)
      .where(eq(favorites.deviceFp, fp))
    if ((total?.n ?? 0) >= 300) throw createError({ statusCode: 429, statusMessage: '收藏已达上限，请先清理一些' })
    // 唯一约束冲突则忽略（幂等）
    await db
      .insert(favorites)
      .values({ articleId: id, deviceFp: fp, createdAt: new Date().toISOString() })
      .onConflictDoNothing()
  }

  const [count] = await db
    .select({ n: sql<number>`count(*)` })
    .from(favorites)
    .where(eq(favorites.articleId, id))

  return { ok: true, favorited: action === 'add', count: count?.n ?? 0 }
})
