import { defineEventHandler, readBody } from 'h3'
import { useDb } from '../../utils/db'
import { clickLogs } from '../../db/schema'

// POST /api/track/click —— 链接点击异步上报（sendBeacon，不拦截跳转，不改链接地址）
// body: { articleId, linkId, domain }
// 公开接口只做 INSERT（无害、量级小），不查询校验以节省 D1 读取
export default defineEventHandler(async (event) => {
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
