import { defineNitroPlugin } from 'nitropack/runtime/plugin'
import { runDailyGenerate } from '../utils/daily-generate'

// 云端兜底（电脑关机场景）：*/5 cron 触发，北京 08:25-10:00 窗口内轮询，
// 本地 8:00 任务没有机会运行时自动补生成，当天发满 3 篇即停（幂等）。
// 若电脑开着：本地任务 8:00 先跑（DeepSeek），云端看到当天已满即跳过。
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', async () => {
    try {
      await runDailyGenerate()
    } catch (err) {
      console.error('[daily-generate] error:', err)
    }
  })
})
