#!/usr/bin/env node
/**
 * 定时 AI 流水线（Windows 任务计划每天 08:00 触发）
 *
 * v3（2026-10-08）：改用库统一入口 runScheduledGenerate()（ai-article-pipeline/runner）。
 * - 线上 API adapter / 防重 / 运行日志 / 云端兜底（触发式）全部收编进库，站侧零重复；
 * - 网关健康探测、自愈拉起、模型轮换、单请求超时、跨站互斥锁均由库负责；
 * - 云端兜底为触发式：本地只触发 /api/admin/run-daily-generate（15s 超时不等结果），
 *   云端 waitUntil 后台执行 + 幂等防重，结果见 run-logs——消除旧版 60s 超时必然 abort；
 * - 提示词仍用 shared/ai-prompts.mjs（与云端 server/utils/daily-generate.ts 单一来源）。
 *
 * 用法：
 *   node scripts/scheduled-generate.mjs                 # 默认模型 deepseek-chat
 *   node scripts/scheduled-generate.mjs --model kimi     # 指定模型（网关 webauth 过即可用）
 *   node scripts/scheduled-generate.mjs --dry-run        # 只生成不入库不标记
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { runScheduledGenerate } from 'ai-article-pipeline'
import { aiSystemPrompt, aiSuggestPrompt, applyLinkPool } from '../shared/ai-prompts.mjs'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dir, '..')
const TFG = 'http://localhost:3456/v1'
// token-free-gateway 已 fork 进 auto-ai-article/third_party/token-free-gateway（2026-10-08）
const TFG_EXE = path.join(ROOT, '..', 'auto-ai-article', 'third_party', 'token-free-gateway', 'token-free-gateway.exe')
const AUTO_START = path.join(ROOT, '..', 'auto-ai-article', 'third_party', 'token-free-gateway', 'auto-start.ps1')

const args = process.argv.slice(2)
const model = (args.find((a) => a.startsWith('--model=')) || '').split('=')[1] || 'deepseek-chat'
const dryRun = args.includes('--dry-run')

function log(...a) { console.log(new Date().toISOString(), ...a) }

async function main() {
  const result = await runScheduledGenerate({
    site: 'article-site',
    adminBase: 'https://www.wcbblll.cc',
    adminKeyFile: path.join(ROOT, '.env.manage-key'),
    dailyTarget: 3,
    localGateway: TFG,
    localModel: model,
    // 对齐 TFG config.json requestTimeoutSec=300，留 20s 余量
    localTimeoutMs: 280000,
    // 离线 → 自愈拉起网关；degraded（browser disconnected）→ 拉起浏览器
    localGatewayStartCommand: `powershell -NoProfile -ExecutionPolicy Bypass -File "${AUTO_START}"`,
    localChromeStartCommand: `"${TFG_EXE}" chrome start`,
    autoStartWaitMs: 45000,
    dryRun,
    // 提示词：与云端共用 shared/ai-prompts.mjs 单一来源（含链接池目录）
    systemPrompt: aiSystemPrompt(),
    suggestPrompt: aiSuggestPrompt(),
    // 链接池解析：AI 只输出 ref，URL 由 links-data.json 提供，池外链接丢弃
    resolveLinks: applyLinkPool,
    // 发布模式：素材有 publishAt → draft 定时发布；无 → published 立即发布
    publishMode: 'seed',
    // TFG 是浏览器驱动的网页网关，并发长请求（默认 3）偶发返回异常内容；保持顺序生成
    concurrency: 1,
    // 网关重启后浏览器会话有短暂不稳定窗口（HTTP 200 但内容不合格），生成重试兜底（最多 3 次）
    generateRetries: 2,
    // 本地模型轮换：deepseek-chat 会话不可用（网络/HTTP 错误）时自动切 deepseek-reasoner
    localModels: ['deepseek-chat', 'deepseek-reasoner'],
    // 跨站互斥锁：多站同机用本地网关时串行化（各站配同一路径；后到站等待 3 分钟，超时本轮跳过由云端兜底）
    localLockFile: path.join(ROOT, '..', '.ai-local-gateway.lock'),
    logger: log,
  })

  log(`[auto] 执行结果：mode=${result.mode}${result.reason ? `，原因：${result.reason}` : ''}`)
  if (result.pipeline) {
    log(`[auto] 完成：成功 ${result.pipeline.ok}，失败 ${result.pipeline.fail}${dryRun ? '（dry-run 未入库）' : ''}`)
    for (const e of result.pipeline.errors) log(`[auto] 错误：${e}`)
  }
}

main().catch((e) => { console.error('[fatal]', e); process.exit(1) })
