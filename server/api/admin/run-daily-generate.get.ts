import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { runDailyGenerate } from '../../utils/daily-generate'

// GET /api/admin/run-daily-generate（Bearer 鉴权） 云端兜底入口（手动/脚本触发）：
// 本地网关离线时由本地脚本 cloudFallback 触发，或后台手动触发。
// 触发式：立即返回 { status:'triggered' }，生成经 event.waitUntil 在后台继续执行
// （不依赖客户端连接；Cloudflare Workers 保证 waitUntil 任务跑完），结果见 run-logs。
// 幂等：忽略窗口限制；默认保留当天防重（已发满 3 篇返回 skipped:quota）。
// ?forceQuota=1 → 允许补发（如删除低质文后重新生成，超发当天额度）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const q = getQuery(event)
  const forceQuota = q?.forceQuota === '1' || q?.forceQuota === 'true'
  const task = runDailyGenerate({ forceWindow: true, forceQuota })

  if (typeof event.waitUntil === 'function') {
    // 触发式：后台执行，立即返回（云端侧异步 + 幂等防重，本地脚本 15s 触发超时足够）
    event.waitUntil(task.catch((e: any) => console.error('[rdg] 后台执行失败：', e?.stack || e?.message || e)))
    return { ok: true, status: 'triggered', message: '已触发云端生成（异步执行，结果见 run-logs）' }
  }

  // 非 waitUntil 环境（本地 dev / 非 CF 部署）退化为同步等待
  try {
    const r = await task
    return { ok: true, ...r }
  } catch (e: any) {
    console.error('[rdg] ERROR:', e?.stack || e?.message || e)
    return {
      ok: false,
      error: String(e?.stack || e?.message || e).slice(0, 1000),
    }
  }
})
