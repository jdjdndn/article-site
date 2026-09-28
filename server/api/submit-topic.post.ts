import { defineEventHandler, readBody, createError, getRequestHeader } from 'h3'
import { and, eq, sql } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { seeds } from '../db/schema'
import { rateLimit } from '../utils/ratelimit'

// POST /api/submit-topic —— 用户搜索无结果时提交选题，进素材队列（source=user），8 点流水线自动生成引流文
// body: { fp, topic }
// 防刷（代码级，无需 Cloudflare 面板配置）：
//   - 同 fp 24h 最多 5 条（429）
//   - 同 fp 同 topic 24h 内去重（409）
//   - IP 兜底：同 IP 24h 最多 20 条（fp 可伪造，IP 维度防批量换 fp 刷，rate_limits 表）
//   - topic 长度 4-60
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const fp = typeof body?.fp === 'string' ? body.fp.trim().slice(0, 128) : ''
  const topic = typeof body?.topic === 'string' ? body.topic.trim() : ''
  if (!fp) throw createError({ statusCode: 400, statusMessage: '缺少设备标识' })
  if (topic.length < 4) throw createError({ statusCode: 400, statusMessage: '选题至少 4 个字' })
  if (topic.length > 60) throw createError({ statusCode: 400, statusMessage: '选题最多 60 个字' })

  // IP 兜底（CF 直连头；本地/dev 无此头则跳过）
  const ip = getRequestHeader(event, 'cf-connecting-ip') || ''
  if (ip && !(await rateLimit('ip:' + ip + ':submit-topic', 24 * 3600e3, 20))) {
    throw createError({ statusCode: 429, statusMessage: '提交太频繁，请稍后再试' })
  }

  const db = useDb()
  const dayAgo = sql`datetime('now', '-1 day')`
  const [cnt] = await db
    .select({ n: sql<number>`count(*)` })
    .from(seeds)
    .where(and(eq(seeds.source, 'user'), eq(seeds.fp, fp), sql`datetime(created_at) >= ${dayAgo}`))
  if ((cnt?.n ?? 0) >= 5) throw createError({ statusCode: 429, statusMessage: '今日投稿已达上限（5 条），明天再来' })

  const [dup] = await db
    .select({ id: seeds.id })
    .from(seeds)
    .where(and(eq(seeds.source, 'user'), eq(seeds.fp, fp), eq(seeds.raw, `用户投稿：${topic}（写一篇实用攻略/干货引流文）`), sql`datetime(created_at) >= ${dayAgo}`))
    .limit(1)
  if (dup) throw createError({ statusCode: 409, statusMessage: '这个选题已经收到过，正在排队生成' })

  const now = new Date().toISOString()
  await db.insert(seeds).values({
    raw: `用户投稿：${topic}（写一篇实用攻略/干货引流文）`,
    category: 'auto',
    template: 'auto',
    status: 'pending',
    source: 'user',
    fp,
    createdAt: now,
    updatedAt: now,
  } as any)
  return { ok: true, message: '选题已收到，每天 8 点自动生成' }
})
