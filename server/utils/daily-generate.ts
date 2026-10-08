import { and, eq, gte, ne, sql } from 'drizzle-orm'
import { useDb } from './db'
import { articles, runLogs } from '../db/schema'
import { fetchPendingSeeds, insertSeedsDirect, markSeedDone, markSeedFailed, batchCreateArticlesDirect, insertRunLog } from './pipeline'
import { aiSystemPrompt, aiSuggestPrompt, applyLinkPool } from '../../shared/ai-prompts.mjs'
import { extractJson } from '../../shared/ai-utils.mjs'
import { createPipeline, createBindingFallbackClient, getSiteDefaultModel, FREE_TEXT_MODELS, OPENROUTER_FREE_MODELS, cnTodayStartISO, type PipelineDB } from 'ai-article-pipeline'
import { runPublishOnSchedule } from './publish-on-schedule'

// 云端兜底流水线（B 方案）：
// - 本地 8:00 任务失败 / 电脑关机时，由 */5 cron 在窗口内轮询自动补生成；
// - 与本地脚本共用线上业务逻辑（seeds 入池 / 文章入库含安全审核 / run-logs 上报），
//   仅 AI 来源不同：Cloudflare Workers AI 开源模型（零成本、不依赖本地网关）。
// - 提示词与 scripts/scheduled-generate.mjs 保持同步（勿单侧修改）。
//
// 库复用（auto-ai-article → npm file:../auto-ai-article）：
// - createPipeline：AI 选题（suggestTopics，带重试 + JSON 解析）
// - extractJson：JSON 提取（经 shared/ai-utils.mjs re-export）
// - checkArticleSafety：内容安全（经 batchCreateArticlesDirect 调用，经 utils/content-safety.ts re-export）
// article-site 特有逻辑保留：
// - 兜底窗口 / [ai-down] 标记 / hasLocalRunToday / 日志清理
// - 链接池 applyLinkPool（AI 输出 ref，URL 由 links-data.json 解析）
// - publishAt 定时发布 + needsReview + 链接表入库（batchCreateArticlesDirect）
//
// 重要：不能通过公网域名 https://www.wcbblll.cc 调用自身 API —— Cloudflare 对
// Worker fetch 自身 custom domain 返回 404 空响应（防自调用/循环保护），因此改为
// 直连 D1 + 复用 pipeline 业务函数（与 API 行为同构）。

const MODEL = getSiteDefaultModel()
const TARGET = 3
const WINDOW_START_MIN = 40 // UTC 00:40 = 北京 08:40（给本地 8:00 任务留足完成时间，压掉并发竞态窗口）
const WINDOW_END_MIN = 120 // UTC 02:00 = 北京 10:00

const log = (...a: any[]) => console.log(new Date().toISOString(), '[daily-generate]', ...a)

// 云端 AI 服务不可用（额度/模型类错误）：本轮窗口放弃，不再空转重试
class AiFatalError extends Error {}

// CF 多模型降级 + OpenRouter 兜底（统一由库 createBindingFallbackClient 处理）
async function createWorkersAiClient() {
  const ai: any = (process.env as any).AI
  if (!ai) throw new AiFatalError('AI binding 未配置（云端兜底需在 wrangler.jsonc 配置 Workers AI binding）')
  const openRouterKey: string | undefined = (globalThis as any).__env__?.OPENROUTER_API_KEY || (process.env as any).OPENROUTER_API_KEY
  return createBindingFallbackClient({
    binding: ai,
    models: FREE_TEXT_MODELS,
    openrouter: openRouterKey ? { apiKey: openRouterKey, models: OPENROUTER_FREE_MODELS } : undefined,
  })
}

async function publishedTodayCount(): Promise<number> {
  const db = useDb()
  // 北京时间今天 0 点（UTC 前一天 16:00）——正确日界，草稿发布（updatedAt 更新）也计入
  const from = cnTodayStartISO()
  const rows = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.status, 'published'), gte(articles.updatedAt, from)))
    .limit(TARGET + 1)
  return rows.length
}

// 今天是否有本地流水线的成功记录（model 非云端模型且成功数 ≥1）。
// 有 → 本地 8:00 任务已产文，云端信任本地、全天跳过，
// 避免"本地运行中/已完成 + 云端窗口"并发双跑导致超发。
// （本地网关离线转云端时脚本上报 ok=0，不影响本判定。）
async function hasLocalRunToday(): Promise<boolean> {
  const db = useDb()
  const from = cnTodayStartISO()
  const rows = await db
    .select({ id: runLogs.id, ok: runLogs.ok })
    .from(runLogs)
    .where(and(ne(runLogs.model, MODEL), gte(runLogs.ok, 1), gte(runLogs.runAt, from)))
    .limit(1)
  return rows.length > 0
}

// 今天是否已标记"云端 AI 服务不可用"（额度/模型故障 → 窗口剩余轮次跳过，避免空转）
async function hasAiDownToday(): Promise<boolean> {
  const db = useDb()
  const from = cnTodayStartISO()
  const rows = await db
    .select({ id: runLogs.id })
    .from(runLogs)
    .where(and(sql`${runLogs.error} LIKE '%[ai-down]%'`, gte(runLogs.runAt, from)))
    .limit(1)
  return rows.length > 0
}

// 日志定期清理（90 天前；每天窗口内幂等执行——90 天前数据删空后 DELETE 0 行，零成本）
async function cleanupOldLogs() {
  const db = useDb()
  await db.run(sql`DELETE FROM click_logs WHERE created_at < datetime('now', '-90 days')`)
  await db.run(sql`DELETE FROM search_logs WHERE created_at < datetime('now', '-90 days')`)
  await db.run(sql`DELETE FROM run_logs WHERE run_at < datetime('now', '-90 days')`)
  await db.run(sql`DELETE FROM reports WHERE created_at < datetime('now', '-90 days') AND status = 'done'`)
  await db.run(sql`DELETE FROM rate_limits WHERE datetime(reset_at) < datetime('now')`)
}

export async function runDailyGenerate(opts: { forceWindow?: boolean; forceQuota?: boolean } = {}) {
  const db = useDb()
  const now = new Date()
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
  if (!opts.forceWindow && (mins < WINDOW_START_MIN || mins > WINDOW_END_MIN)) {
    log('不在兜底窗口（北京 08:25-10:00），跳过')
    return { skipped: 'window' }
  }
  // 优先发草稿：先发布到期草稿（手动触发路径未经过 alarm onAlarm，需在此补齐；
  // alarm 路径幂等重复执行无碍），发布数计入下方 done（updatedAt 口径）
  try { await runPublishOnSchedule() } catch (e: any) { log('发布到期草稿失败：', e.message) }
  // 日志表定期清理（点击/搜索/运行/已处理反馈，90 天前）
  try { await cleanupOldLogs() } catch (e: any) { log('日志清理失败：', e.message) }
  const done = await publishedTodayCount()
  if (done >= TARGET && !opts.forceQuota) {
    log(`当天已发满 ${done} 篇，跳过`)
    return { skipped: 'quota', done }
  }
  if (!opts.forceWindow) {
    // 竞态防护：今天已有本地流水线成功记录 → 信任本地，云端跳过（手动触发不受此限）
    if (await hasLocalRunToday()) {
      log('今天已有本地流水线成功记录，云端信任本地，跳过')
      return { skipped: 'local-run' }
    }
    // 额度/模型故障标记 → 放弃窗口剩余轮次，避免每 5 分钟空转
    if (await hasAiDownToday()) {
      log('今天已标记云端 AI 服务不可用，跳过')
      return { skipped: 'ai-down' }
    }
  }

  log(`当天已发布 ${done}/${TARGET} 篇，剩余 ${Math.max(0, TARGET - done)} 篇由生成补足（模型 ${MODEL}）`)
  let aiClient: (messages: Array<{ role: string; content: string }>) => Promise<string>
  try {
    aiClient = await createWorkersAiClient()
  } catch (e: any) {
    if (e instanceof AiFatalError) {
      const msg = `[ai-down] ${e.message}，当天窗口放弃`
      try {
        await insertRunLog(db, { runAt: new Date().toISOString(), model: MODEL, dryRun: false, total: 0, ok: 0, fail: 1, error: msg.slice(0, 200) })
      } catch { /* noop */ }
      log(msg)
      return { skipped: 'ai-down' }
    }
    throw e
  }

  // 库管线：仅用 suggestTopics（AI 选题，带重试）；生成/入库走 article-site 特有流程
  // （链接池 applyLinkPool + publishAt 定时发布 + needsReview + 链接表，库的 GeneratedArticle 不透传 publishAt）
  const pipelineDB: PipelineDB = {
    async fetchPendingSeeds() { return [] },
    async insertSeeds() { return { added: 0 } },
    async markSeedDone() {},
    async markSeedFailed() {},
    async insertArticles() { return { total: 0, created: 0, failed: 0, results: [] } },
    async insertRunLog() {},
  }
  const pipeline = createPipeline(pipelineDB, {
    target: Math.max(0, TARGET - done),
    ai: { client: aiClient, model: MODEL },
    systemPrompt: aiSystemPrompt(),
    suggestPrompt: aiSuggestPrompt(),
    sanitizeUrls: false, // 链接池模式：AI 输出 ref 而非 URL，不走占位 URL 清洗
    safetyAction: 'draft',
  })

  const need = Math.max(0, TARGET - done) // 剩余目标：到目标数即可，不足才补
  let list = await fetchPendingSeeds(db, 10)
  const have = list?.length || 0
  if (have < need) {
    try {
      const topics = await pipeline.suggestTopics()
      if (topics.length) {
        const r = await insertSeedsDirect(
          db,
          topics.map((tp) => ({ raw: `选题：${tp.title}\n思路：${tp.angle}\n分类建议：${tp.category}`, category: tp.category })),
          'ai',
        )
        log(`AI 选题已入素材池：${r.added} 条`)
        list = await fetchPendingSeeds(db, 10)
      }
    } catch (e: any) {
      if (e instanceof AiFatalError) {
        const msg = `[ai-down] 云端 AI 选题失败（${e.message}），当天窗口放弃`
        try {
          await insertRunLog(db, { runAt: new Date().toISOString(), model: MODEL, dryRun: false, total: 0, ok: 0, fail: 1, error: msg.slice(0, 200) })
        } catch { /* noop */ }
        log(msg)
        return { skipped: 'ai-down' }
      }
      log('AI 选题失败：', e.message)
    }
  }
  if (!list || !list.length) {
    log('素材池没有待处理素材')
    return { ok: 0, fail: 0, total: 0 }
  }
  // 重复素材防护：仍 pending 但已关联文章（上次 done 失败残留）→ 补 done，不重复生成
  const linked = list.filter((s: any) => s.articleId)
  if (linked.length) {
    for (const s of linked) {
      await markSeedDone(db, s.id, s.articleId).catch(() => log(`补 done 失败 seed#${s.id}`))
    }
    list = list.filter((s: any) => !s.articleId)
    log(`清理 ${linked.length} 条已关联文章的残留 pending 素材`)
  }
  const targets = list.slice(0, need)
  const results = await Promise.allSettled(targets.map(async (s: any) => {
    const raw = String(s.raw || '')
    if (raw.length < 8) {
      await markSeedFailed(db, s.id, '素材过短').catch(() => {})
      throw new Error('素材过短')
    }
    const text = await aiClient([
      { role: 'system', content: aiSystemPrompt() },
      { role: 'user', content: `原始信息：\n${JSON.stringify(raw)}` },
    ])
    const a = extractJson(text)
    if (!a) throw new Error('AI 返回无法解析为 JSON')
    // 链接池解析：AI 只输出 ref/id，URL 由 links-data.json 提供；池外链接丢弃
    const a2 = applyLinkPool(a)
    const item = {
      title: String(a2.title || '').trim(),
      summary: String(a2.summary || ''),
      content: Array.isArray(a2.content) ? a2.content : [],
      template: ['deal', 'guide', 'faq'].includes(a2.template) ? a2.template : (s.template && s.template !== 'auto' ? s.template : 'deal'),
      category: s.category && s.category !== 'auto' ? s.category : (a2.category || '优惠'),
      tags: Array.isArray(a2.tags) ? a2.tags : [],
      faq: Array.isArray(a2.faq) ? a2.faq : [],
      links: Array.isArray(a2.links) ? a2.links : [],
      expiresAt: a2.expiresAt || s.expiresAt || null,
      publishAt: s.publishAt || null,
      status: s.publishAt ? 'draft' : 'published',
    }
    if (!item.title || !item.content.length) throw new Error('AI 结果缺 title/content')
    // 内容充实度兜底：块数过少 / 正文过短视为生成失败（标 failed 可重试，不入库低质文）
    const contentChars = JSON.stringify(item.content).length
    if (item.content.length < 3 || contentChars < 250) {
      throw new Error(`AI 内容过短（${item.content.length} 块 / ${contentChars} 字），请重试`)
    }
    const r = await batchCreateArticlesDirect(db, [item])
    const res = r.results?.[0]
    // 只有真正入库成功才标记 done（失败标 failed 可重试，避免残留 pending 丢记录）
    if (res?.ok && res.id) {
      await markSeedDone(db, s.id, res.id)
      return { title: item.title, articleId: res.id }
    }
    await markSeedFailed(db, s.id, res?.error || '入库失败')
    throw new Error(res?.error || '入库失败')
  }))
  const ok = results.filter((x) => x.status === 'fulfilled').length
  const fail = results.length - ok
  // 额度/模型故障：全部失败且均为致命错误 → 标记 [ai-down]，窗口剩余轮次跳过
  const fatal = results.length > 0 && results.every((x) => x.status === 'rejected' && x.reason instanceof AiFatalError)
  if (fatal) {
    const msg = `[ai-down] 云端 AI 服务不可用（${(results[0] as any)?.reason?.message || ''}），当天窗口放弃`
    try {
      await insertRunLog(db, { runAt: new Date().toISOString(), model: MODEL, dryRun: false, total: results.length, ok: 0, fail: results.length, error: msg.slice(0, 200) })
    } catch { /* noop */ }
    log(msg)
    return { skipped: 'ai-down', fail: results.length }
  }
  try {
    await insertRunLog(db, { runAt: new Date().toISOString(), model: MODEL, dryRun: false, total: results.length, ok, fail })
  } catch { /* 上报失败不阻塞 */ }
  log(`完成：成功 ${ok}，失败 ${fail}`)
  return { ok, fail, total: results.length }
}
