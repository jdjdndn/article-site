// Workers Cron Triggers 备用路径（cron 未启用时无效）——统一逻辑来自 ai-article-pipeline
import { createScheduledPlugin } from 'ai-article-pipeline'
import { runDailyGenerate } from '../utils/daily-generate'

export default defineNitroPlugin(createScheduledPlugin({
  generate: () => runDailyGenerate(),
}))
