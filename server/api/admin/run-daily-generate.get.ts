import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { runDailyGenerate } from '../../utils/daily-generate'

// GET /api/admin/run-daily-generate（Bearer 鉴权） 云端兜底入口（手动/脚本触发）：本地网关离线时由本地脚本调用，或后台手动触发。
// 忽略窗口限制；默认保留当天防重（已发满 3 篇返回 skipped:quota）。幂等。
// ?forceQuota=1 → 允许补发（如删除低质文后重新生成，超发当天额度）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const q = getQuery(event)
  try {
    const r = await runDailyGenerate({ forceWindow: true, forceQuota: q?.forceQuota === '1' || q?.forceQuota === 'true' })
    return { ok: true, ...r }
  } catch (e: any) {
    console.error('[rdg] ERROR:', e?.stack || e?.message || e)
    return {
      ok: false,
      error: String(e?.stack || e?.message || e).slice(0, 1000),
    }
  }
})
