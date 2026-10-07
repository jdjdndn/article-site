// Nitro 插件：DO alarm 定时触发文章生成（替代原 */5 cron；参考 auto-ai-article ArticleScheduler）
// article-site 兜底窗口：北京 08:40-10:00（UTC 00:40-02:00），alarm 设在窗口起点，触发后重设次日
import { runDailyGenerate } from '../utils/daily-generate'

function nextWindowStart(from = new Date()): number {
  const target = new Date()
  target.setUTCHours(0, 40, 0, 0)
  if (target.getTime() <= from.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1)
  }
  return target.getTime()
}

function applyEnv(env: any) {
  if (!env) return
  ;(globalThis as any).__env__ = env
  if (env.DB) (process.env as any).DB = env.DB
  if (env.AI) (process.env as any).AI = env.AI
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:durable:init', async (durable: any, { state }: any) => {
    const existing = await state.storage.getAlarm()
    if (!existing) {
      const target = nextWindowStart()
      await state.storage.setAlarm(target)
      console.log(`[alarm] 首次 alarm 设置: ${new Date(target).toISOString()}`)
    }
  })

  nitroApp.hooks.hook('cloudflare:durable:alarm', async (durable: any) => {
    console.log(`[alarm] 触发: ${new Date().toISOString()}`)
    applyEnv((durable as any).env)
    try {
      const result = await runDailyGenerate()
      console.log(`[alarm] 完成:`, result)
    } catch (e: any) {
      console.error(`[alarm] 失败:`, e.message)
    }
    try {
      const target = nextWindowStart()
      await (durable as any).ctx.storage.setAlarm(target)
      console.log(`[alarm] 下次: ${new Date(target).toISOString()}`)
    } catch (e: any) {
      console.error(`[alarm] 重设失败:`, e.message)
    }
  })
})
