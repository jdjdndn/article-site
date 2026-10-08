// Nitro 插件：DO alarm 定时触发文章生成——统一调度逻辑（首次设置/触发/重设/env 注入）
// 来自 ai-article-pipeline（auto-ai-article），站点仅注入生成函数、时间与额外处理。
import { createDailyAlarmPlugin } from 'ai-article-pipeline'
import { runDailyGenerate } from '../utils/daily-generate'
import { runPublishOnSchedule } from '../utils/publish-on-schedule'

export default defineNitroPlugin(createDailyAlarmPlugin({
  alarmTime: '08:40',
  generate: () => runDailyGenerate(),
  onAlarm: () => runPublishOnSchedule(),
}))
