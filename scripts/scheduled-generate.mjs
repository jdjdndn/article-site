#!/usr/bin/env node
/**
 * 定时 AI 流水线（Windows 任务计划每天 08:00 触发）
 *
 * v2（2026-10-08）：收编进 ai-article-pipeline 库，改为调用 execute()。
 * - 网关健康探测（TFG /health 语义 + 非 TFG /models 回退）、自愈拉起（离线→auto-start.ps1，
 *   degraded→chrome start）、单请求超时（280s 对齐 TFG requestTimeoutSec=300）、模型发现均由库负责；
 * - 提示词仍用 shared/ai-prompts.mjs（增强版：链接池目录/黑话禁令/原创性/时效性），经
 *   systemPrompt/suggestPrompt 覆盖库默认值，与云端 server/utils/daily-generate.ts 保持单一来源；
 * - 链接池解析（applyLinkPool：AI 只输出 ref，URL 由 links-data.json 提供）经 resolveLinks 注入；
 * - 发布模式 publishMode='seed'：素材有 publishAt → 文章 draft 定时发布；无 → published 立即发布；
 * - 离线且未配置云端 key 时整轮转 /api/admin/run-daily-generate（cloudFallback，不做本地+云端接力）。
 *
 * 用法：
 *   node scripts/scheduled-generate.mjs                 # 默认模型 deepseek-chat
 *   node scripts/scheduled-generate.mjs --model kimi     # 指定模型（网关 webauth 过即可用）
 *   node scripts/scheduled-generate.mjs --dry-run        # 只生成不入库不标记
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { execute } from 'ai-article-pipeline'
import { aiSystemPrompt, aiSuggestPrompt, applyLinkPool } from '../shared/ai-prompts.mjs'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dir, '..')
const KEY_FILE = path.join(ROOT, '.env.manage-key')
const TFG = 'http://localhost:3456/v1'
// token-free-gateway 已 fork 进 auto-ai-article/third_party/token-free-gateway（2026-10-08）
const TFG_EXE = path.join(ROOT, '..', 'auto-ai-article', 'third_party', 'token-free-gateway', 'token-free-gateway.exe')
const AUTO_START = path.join(ROOT, '..', 'auto-ai-article', 'third_party', 'token-free-gateway', 'auto-start.ps1')
const SITE = 'https://www.wcbblll.cc'

const args = process.argv.slice(2)
const model = (args.find((a) => a.startsWith('--model=')) || '').split('=')[1] || 'deepseek-chat'
const dryRun = args.includes('--dry-run')
const TARGET = 3 // 每轮目标篇数：素材不足时由 AI 选题补足

function log(...a) { console.log(new Date().toISOString(), ...a) }

// —— 工具 ——
function getKey() {
  const raw = readFileSync(KEY_FILE, 'utf-8').trim()
  return raw.replace(/^MANAGE_KEY=/, '')
}
async function apiFetch(pathname, opts = {}) {
  const key = getKey()
  // 密钥走 Authorization header（与 server 端 requireAdmin 一致）；60s 超时防挂起
  const res = await fetch(`${SITE}${pathname}`, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(60000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`API HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
  return data
}

// —— 云端兜底：本地网关离线且无云端 key 时，整轮转线上 run-daily-generate ——
async function cloudFallback() {
  const msg = '本地 AI 网关(localhost:3456)离线，转云端兜底（Workers AI）执行'
  log('[auto] ' + msg)
  try {
    const r = await apiFetch('/api/admin/run-daily-generate', {})
    log('[cloud] 云端兜底结果：', JSON.stringify(r))
    return { ok: true, message: msg + '，云端结果 ' + JSON.stringify(r).slice(0, 140) }
  } catch (e) {
    log('[cloud] 云端兜底调用失败：', e.message)
    return { ok: false, message: msg + '，且云端兜底失败：' + e.message.slice(0, 120) }
  }
}

// —— 线上 API 的 PipelineDB adapter（dry-run 时所有副作用落空/落内存，不入库不标记） ——
function createDbAdapter() {
  const memSeeds = [] // dry-run 内存种子池：AI 选题补足时可完整预览生成链路
  return {
    async fetchPendingSeeds(size) {
      if (dryRun && memSeeds.length) return memSeeds.slice(0, size)
      const { list } = await apiFetch(`/api/admin/seeds?status=pending&size=${size}`)
      return list || []
    },
    async insertSeeds(items, source) {
      if (dryRun) {
        let id = -1
        const now = new Date().toISOString()
        for (const it of items) {
          memSeeds.push({
            id: id--,
            raw: it.raw,
            category: it.category || 'auto',
            template: it.template || 'auto',
            status: 'pending',
            publishAt: it.publishAt || null,
            expiresAt: it.expiresAt || null,
            articleId: null,
            error: null,
            source,
            fp: '',
            createdAt: now,
            updatedAt: now,
          })
        }
        return { added: items.length }
      }
      const r = await apiFetch('/api/admin/seeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, source }),
      })
      return { added: r?.added || 0 }
    },
    async markSeedDone(id, articleId) {
      if (dryRun) return
      await apiFetch(`/api/admin/seeds/${id}/done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: articleId || null }),
      }).catch(() => {})
    },
    async markSeedFailed(id, error) {
      if (dryRun) return
      await apiFetch(`/api/admin/seeds/${id}/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: String(error || '未知错误') }),
      }).catch(() => {})
    },
    async insertArticles(articles) {
      if (dryRun) {
        return {
          total: articles.length,
          created: articles.length,
          failed: 0,
          results: articles.map((a, i) => ({ id: `dry-run-${i}`, ok: true })),
        }
      }
      const r = await apiFetch('/api/admin/articles/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles }),
      })
      return { total: r.total, created: r.created, failed: r.failed, results: r.results || [] }
    },
    // 运行日志由 execute() 的 reportRun 统一上报（带 dryRun 字段）；此处 no-op 避免重复
    async insertRunLog() {},
  }
}

// —— 今日已发布篇数（防重："开机补跑"幂等，避免与 8 点任务重复发） ——
async function getPublishedToday() {
  const todayCN = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
  const dayRes = await apiFetch(`/api/admin/articles?status=published&from=${todayCN}&limit=100`)
  return (dayRes.list || []).length
}

// —— 运行日志上报（失败不阻塞流水线） ——
async function reportRun(payload) {
  try {
    await apiFetch('/api/admin/run-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) { log('[warn] 运行日志上报失败：', e.message) }
}

// —— 主流程（委托库 execute()） ——
async function main() {
  const db = createDbAdapter()
  const result = await execute(db, {
    dailyTarget: TARGET,
    localGateway: TFG,
    localModel: model,
    // 对齐 TFG config.json requestTimeoutSec=300，留 20s 余量
    localTimeoutMs: 280000,
    // 离线 → 自愈拉起网关；degraded（browser disconnected）→ 拉起浏览器
    localGatewayStartCommand: `powershell -NoProfile -ExecutionPolicy Bypass -File "${AUTO_START}"`,
    localChromeStartCommand: `"${TFG_EXE}" chrome start`,
    autoStartWaitMs: 45000,
    cloudFallback,
    dryRun,
    getPublishedToday,
    reportRun,
    logger: log,
    // 提示词：覆盖库默认值，与云端共用 shared/ai-prompts.mjs 单一来源（含链接池目录）
    systemPrompt: aiSystemPrompt(),
    suggestPrompt: aiSuggestPrompt(),
    // 链接池解析：AI 只输出 ref，URL 由 links-data.json 提供，池外链接丢弃
    resolveLinks: applyLinkPool,
    // 发布模式：素材有 publishAt → draft 定时发布；无 → published 立即发布（与 v1 一致）
    publishMode: 'seed',
    // TFG 是浏览器驱动的网页网关，并发长请求（默认 3）偶发返回异常内容；保持 v1 顺序生成
    concurrency: 1,
    // 网关重启后浏览器会话有短暂不稳定窗口（HTTP 200 但内容不合格），生成重试兜底（最多 3 次）
    generateRetries: 2,
    // 本地模型轮换：deepseek-chat 会话不可用（网络/HTTP 错误）时自动切 deepseek-reasoner
    localModels: ['deepseek-chat', 'deepseek-reasoner'],
    // 跨站互斥锁：多站同机用本地网关时串行化（各站配同一路径；后到站等待 3 分钟，超时本轮跳过由云端兜底）
    localLockFile: path.join(ROOT, '..', '.ai-local-gateway.lock'),
  })

  log(`[auto] 执行结果：mode=${result.mode}${result.reason ? `，原因：${result.reason}` : ''}`)
  if (result.pipeline) {
    log(`[auto] 完成：成功 ${result.pipeline.ok}，失败 ${result.pipeline.fail}${dryRun ? '（dry-run 未入库）' : ''}`)
    for (const e of result.pipeline.errors) log(`[auto] 错误：${e}`)
  }
}

main().catch((e) => { console.error('[fatal]', e); process.exit(1) })
