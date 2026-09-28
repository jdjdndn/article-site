import { defineEventHandler, readBody } from 'h3'
import { useDb } from '../../utils/db'
import { clickLogs } from '../../db/schema'

// POST /api/track/click —— 链接点击异步上报（sendBeacon，不拦截跳转，不改链接地址）
// body: { articleId, linkId, domain }
// 防刷：IP 级滑动窗口限频（worker 实例内存，足够挡单点刷写；超限静默丢弃，sendBeacon 无感知）
const RATE_LIMIT = { windowMs: 60000, max: 30 }
const hits = new Map<string, { ts: number; n: number }>()

function clientIp(event: any): string {
  const h = event.node?.req?.headers || {}
  return String(h['cf-connecting-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
}

export default defineEventHandler(async (event) => {
  const ip = clientIp(event)
  const now = Date.now()
  const rec = hits.get(ip)
  if (!rec || now - rec.ts > RATE_LIMIT.windowMs) {
    hits.set(ip, { ts: now, n: 1 })
  } else if (rec.n >= RATE_LIMIT.max) {
    return { ok: true } // 超限静默丢弃，不写库
  } else {
    rec.n++
  }
  // 内存表上限保护：只保留近 5 分钟活跃 IP（防内存膨胀）
  if (hits.size > 10000) {
    for (const [k, v] of hits) { if (now - v.ts > 300000) hits.delete(k) }
  }

  const body = await readBody(event).catch(() => null)
  const articleId = typeof body?.articleId === 'string' ? body.articleId.slice(0, 64) : null
  const linkId = Number.isInteger(body?.linkId) ? body.linkId : null
  const domain = typeof body?.domain === 'string' ? body.domain.slice(0, 128) : ''
  if (!articleId && !linkId) return { ok: true }
  await useDb().insert(clickLogs).values({
    articleId,
    linkId,
    domain: domain || null,
    createdAt: new Date().toISOString(),
  })
  return { ok: true }
})
