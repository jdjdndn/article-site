import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { and, eq, gte, sql } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { reports } from '../../../db/schema'

// POST /api/articles/:id/report { fp, content }
// 用户纠错反馈（信息有误/链接失效）；同设备同文章 10 分钟限 1 条防刷
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing id' })
  const body = await readBody(event)
  const fp = typeof body?.fp === 'string' && body.fp ? body.fp.slice(0, 128) : ''
  if (!fp) throw createError({ statusCode: 400, statusMessage: '缺少设备标识' })
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!content || content.length < 2) throw createError({ statusCode: 400, statusMessage: '请填写反馈内容' })
  if (content.length > 500) throw createError({ statusCode: 400, statusMessage: '反馈最多 500 字' })

  const db = useDb()
  const now = new Date().toISOString()

  // 同设备同文章 10 分钟内已提交过 → 拒绝
  const recent = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(
      eq(reports.articleId, id),
      eq(reports.fp, fp),
      gte(reports.createdAt, sql`datetime('now', '-10 minutes')`),
    ))
    .limit(1)
  if (recent.length) throw createError({ statusCode: 429, statusMessage: '已收到你的反馈，请稍后再试' })

  // 全局限频（防刷）：同设备 24h ≤ 10 条
  const [dayCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(reports)
    .where(and(eq(reports.fp, fp), gte(reports.createdAt, sql`datetime('now', '-1 day')`)))
  if ((dayCount?.n ?? 0) >= 10) throw createError({ statusCode: 429, statusMessage: '今日反馈已达上限，感谢支持' })

  await db.insert(reports).values({
    articleId: id,
    fp,
    content,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  })
  return { ok: true }
})
