// Workers Cron Triggers（wrangler.jsonc crons）→ 每天 UTC 00:00（北京 08:00）自动生成
// 注意：项目已改用 DO alarm 定时（见 durable-alarm.ts），cron 触发器已从 wrangler.jsonc 移除；
// 本文件保留统一形态，仅在重新启用 cron 时生效。env 注入能力来自 auto-ai-article。
import { applyWorkerEnv } from 'ai-article-pipeline'
import { runDailyGenerate } from '../utils/daily-generate'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', async (payload: any) => {
    applyWorkerEnv(payload?.env)

    console.log('[scheduled] cron 触发:', new Date().toISOString())

    try {
      const result = await runDailyGenerate()
      console.log('[scheduled] 完成:', result)
      return result
    } catch (e: any) {
      console.error('[scheduled] 失败:', e.message)
      return { ok: false, error: e.message }
    }
  })
})