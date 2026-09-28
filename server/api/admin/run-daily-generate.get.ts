import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { runDailyGenerate } from '../../utils/daily-generate'

// GET /api/admin/run-daily-generate?key=xxx
// 云端兜底入口（手动/脚本触发）：本地网关离线时由本地脚本调用，或后台手动触发。
// 忽略窗口限制，保留当天防重（已发满 3 篇返回 skipped:quota）。幂等。
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const r = await runDailyGenerate({ forceWindow: true })
  return { ok: true, ...r }
})
