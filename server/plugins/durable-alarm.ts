// Nitro 插件：DO alarm 定时触发文章生成——调度能力（时间计算/首次设置/重设/env 注入）来自 auto-ai-article
// Cloudflare DO alarm 是一次性的：init 时设置首次，触发后必须重设下一次，否则次日起不再自动发文。
import { initDoAlarm, rescheduleDoAlarm, applyWorkerEnv } from 'ai-article-pipeline'
import { runDailyGenerate } from '../utils/daily-generate'
import { runPublishOnSchedule } from './publish-on-schedule'

// 统一 alarm 时间（北京时间）：默认 08:00；article-site 用 08:40（兜底窗口起点，与 WINDOW_START_MIN 一致）
const ALARM_TIME = '08:40'

export default defineNitroPlugin((nitroApp) => {
  // DO 初始化时设置 alarm
  nitroApp.hooks.hook('cloudflare:durable:init', async (durable: any, { state }: any) => {
    await initDoAlarm(state.storage, ALARM_TIME)
  })

  nitroApp.hooks.hook('cloudflare:durable:alarm', async (durable: any) => {
    console.log(`[alarm] 触发: ${new Date().toISOString()}`)

    // alarm 路径 Nitro 不会自动设置 process.env，手动补上（库 applyWorkerEnv）
    applyWorkerEnv((durable as any).env)

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

    // 一次性 alarm，触发后重设下一次（库 rescheduleDoAlarm）
    try {
      await rescheduleDoAlarm((durable as any).ctx.storage, ALARM_TIME)
    } catch (e: any) {
      console.error(`[alarm] 重设失败:`, e.message)
    }
  })
})