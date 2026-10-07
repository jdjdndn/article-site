// Nitro 插件：处理 DO alarm 事件，触发文章生成（定时主路径，参考 auto-ai-article ArticleScheduler）
// Cloudflare DO alarm 是一次性的：init 时设置首次，触发后必须重设下一次，否则次日起不再自动发文。
import { runDailyGenerate } from '../utils/daily-generate'
import { runPublishOnSchedule } from './publish-on-schedule'

// 统一 alarm 时间常量（UTC 分钟）：0 = 北京 08:00；article-site 用 40 = 北京 08:40（兜底窗口起点，与 WINDOW_START_MIN 一致）
const ALARM_UTC_MINUTES = 40

function nextAlarmTime(from = new Date()): number {
  const target = new Date()
  target.setUTCHours(0, ALARM_UTC_MINUTES, 0, 0)
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
  // DO 初始化时设置 alarm
  nitroApp.hooks.hook('cloudflare:durable:init', async (durable: any, { state }: any) => {
    const existing = await state.storage.getAlarm()
    if (!existing) {
      const target = nextAlarmTime()
      await state.storage.setAlarm(target)
      console.log(`[alarm] 首次 alarm 设置: ${new Date(target).toISOString()}`)
    }
  })

  nitroApp.hooks.hook('cloudflare:durable:alarm', async (durable: any) => {
    console.log(`[alarm] 触发: ${new Date().toISOString()}`)

    // alarm 路径 Nitro 不会自动设置 process.env，手动补上
    applyEnv((durable as any).env)

    // 先处理到期草稿发布 / 过期文章标记 / 日志清理（原 */5 cron 的 publish-on-schedule 职责，
    // cron 删除后改由 DO alarm 每日承担一次；内部已 try/catch，不影响后续生成）
    try {
      await runPublishOnSchedule()
      console.log(`[alarm] 定时发布/过期处理完成`)
    } catch (e: any) {
      console.error(`[alarm] 定时发布/过期处理失败:`, e.message)
    }

    try {
      const result = await runDailyGenerate()
      console.log(`[alarm] 完成:`, result)
    } catch (e: any) {
      console.error(`[alarm] 失败:`, e.message)
    }

    // 一次性 alarm，触发后重设下一次
    try {
      const target = nextAlarmTime()
      await (durable as any).ctx.storage.setAlarm(target)
      console.log(`[alarm] 下次: ${new Date(target).toISOString()}`)
    } catch (e: any) {
      console.error(`[alarm] 重设失败:`, e.message)
    }
  })
})
