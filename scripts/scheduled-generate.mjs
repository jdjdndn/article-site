#!/usr/bin/env node
/**
 * 定时 AI 流水线（Windows 任务计划每天 08:00 触发）
 *
 * 从线上素材池拉取 pending 素材 → 本地 AI 网关（localhost:3456，免费网页版模型）
 * 去 AI 味 + 结构化 → 线上批量入库 → 标记 done（失败标 failed，可后台重试）。
 *
 * 素材管理在后台「素材队列」tab（云端 D1，不再用本地 JSON 文件）。
 *
 * 用法：
 *   node scripts/scheduled-generate.mjs                 # 默认模型 deepseek-chat
 *   node scripts/scheduled-generate.mjs --model kimi     # 指定模型（网关 webauth 过即可用）
 *   node scripts/scheduled-generate.mjs --dry-run        # 只生成不入库不标记
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { aiSystemPrompt, aiSuggestPrompt, applyLinkPool } from '../shared/ai-prompts.mjs'
import { extractJson } from '../shared/ai-utils.mjs'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dir, '..')
const KEY_FILE = path.join(ROOT, '.env.manage-key')
const TFG = 'http://localhost:3456/v1'
const SITE = 'https://www.wcbblll.cc'

const args = process.argv.slice(2)
const model = (args.find((a) => a.startsWith('--model=')) || '').split('=')[1] || 'deepseek-chat'
const dryRun = args.includes('--dry-run')

// 提示词（aiSystemPrompt / aiSuggestPrompt / dateContext）统一来自 shared/ai-prompts.mjs，
// 与云端 server/utils/daily-generate.ts 共用单一来源，修改提示词只改共享文件。

function log(...a) { console.log(new Date().toISOString(), ...a) }

// —— 网关调用（带慢启动重试：本地网关刚拉起/浏览器繁忙时避免一次失败就中断） ——
async function callChat(payload) {
  const delays = [15000, 30000]
  let lastErr = null
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      log(`[网关] 第 ${i + 1} 次重试（等 ${Math.round(delays[i - 1] / 1000)}s）…`)
      await new Promise((r) => setTimeout(r, delays[i - 1]))
    }
    try {
      const res = await fetch(`${TFG}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(180000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`AI 网关 HTTP ${res.status}`)
      const data = await res.json()
      return data?.choices?.[0]?.message?.content || ''
    } catch (e) {
      lastErr = e
      log(`[网关] 第 ${i + 1} 次失败：${e.message}`)
    }
  }
  throw lastErr || new Error('AI 网关调用失败')
}

// 空素材池时：AI 自动出选题 → 入素材池(source='ai') → 复用生成流程
async function aiSuggestTopics() {
  const text = await callChat({
    model,
    messages: [
      { role: 'system', content: aiSuggestPrompt() },
      { role: 'user', content: '请输出 3 个选题 JSON 数组。' },
    ],
    stream: false,
  })
  const parsed = extractJson(text)
  if (!parsed) throw new Error('AI 选题返回无法解析为 JSON')
  let arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.topics) ? parsed.topics : null)
  if (!arr || !arr.length) throw new Error('AI 选题返回空数组')
  return arr.slice(0, 3).map((x) => ({
    title: String(x.title || '').trim(),
    angle: String(x.angle || '').trim(),
    category: ['优惠', '攻略', '好物', '副业'].includes(x.category) ? x.category : 'auto',
  }))
}
async function insertSeeds(items) {
  return apiFetch('/api/admin/seeds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, source: 'ai' }),
  })
}

// —— 工具 ——
function getKey() {
  const raw = readFileSync(KEY_FILE, 'utf-8').trim()
  return raw.replace(/^MANAGE_KEY=/, '')
}
async function aiGenerate(raw) {
  const text = await callChat({
    model,
    messages: [
      { role: 'system', content: aiSystemPrompt() },
      { role: 'user', content: `原始信息：\n${JSON.stringify(raw, null, 2)}` },
    ],
    stream: false,
  })
  const parsed = extractJson(text)
  if (!parsed) throw new Error('AI 返回无法解析为 JSON')
  return parsed
}
async function apiFetch(pathname, opts = {}) {
  const key = getKey()
  // 密钥走 Authorization header（与 server 端 requireAdmin 一致，不再拼 ?key=）
  // 加 60s 超时：避免云端兜底异常时 fetch 无限挂起，导致计划任务 30 分钟超时被终止（Last Result 267014）
  const res = await fetch(`${SITE}${pathname}`, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(60000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`API HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
  return data
}
async function batchCreate(list) {
  return apiFetch('/api/admin/articles/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articles: list }),
  })
}

// —— 运行日志上报（失败不阻塞流水线） ——
async function reportRun(payload) {
  try {
    await apiFetch('/api/admin/run-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runAt: new Date().toISOString(), model, dryRun, ...payload }),
    })
  } catch (e) { log('[warn] 运行日志上报失败：', e.message) }
}

// —— 主流程 ——
const TARGET = 3 // 每轮目标篇数：素材不足时由 AI 选题补足
async function main() {
  const runStarted = new Date().toISOString()
  // 预检：本地 AI 网关在线 → 走本地全流程（DeepSeek 高质量）；离线 → 整轮转云端兜底
  // （Workers AI 跑完整流程：选题→生成→入库→防重，不做本地一段+云端一段的接力）
  let localAi = false
  const probeGateway = async (timeoutMs = 10000) => {
    try {
      const probe = await fetch(`${TFG}/models`, { signal: AbortSignal.timeout(timeoutMs) })
      return probe.ok
    } catch { return false }
  }
  localAi = await probeGateway()
  if (!localAi) {
    // 自愈：网关守护进程可能已退出（浏览器关闭/进程被杀等），先尝试拉起再重探测，
    // 避免 07:50 自启失败后 08:00 发文整轮转云端兜底。auto-start.ps1 幂等（探测+启动）。
    log('[auto] 本地 AI 网关离线，尝试自动拉起（auto-start.ps1）…')
    try {
      const { execFile } = await import('node:child_process')
      const { promisify } = await import('node:util')
      const run = promisify(execFile)
      await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, '..', 'token-free-gateway', 'auto-start.ps1')], { timeout: 30000, windowsHide: true })
        .catch((e) => log('[auto] 拉起命令异常（忽略，继续重探测）：', e.message))
    } catch (e) { log('[auto] 拉起失败（忽略）：', e.message) }
    for (let i = 0; i < 9 && !localAi; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      localAi = await probeGateway(5000)
    }
    if (localAi) log('[auto] 网关自动拉起成功，继续本地流程')
  }
  if (!localAi) {
    if (dryRun) {
      log('[auto] 本地 AI 网关(localhost:3456)离线，dry-run 不转云端（避免预览误入库），请先启动网关')
      return
    }
    const msg = '本地 AI 网关(localhost:3456)离线，转云端兜底（Workers AI）执行'
    log('[auto] ' + msg)
    try {
      const r = await apiFetch('/api/admin/run-daily-generate', {})
      log('[cloud] 云端兜底结果：', JSON.stringify(r))
      await reportRun({ runAt: runStarted, total: 0, ok: 0, fail: 0, error: msg + '，云端结果 ' + JSON.stringify(r).slice(0, 140) })
    } catch (e) {
      log('[cloud] 云端兜底调用失败：', e.message)
      await reportRun({ runAt: runStarted, total: 0, ok: 0, fail: 0, error: msg + '，且云端兜底失败：' + e.message.slice(0, 120) })
    }
    return
  }
  log(`[auto] 本地 AI 网关在线，使用本地模型 ${model}`)
  // 防重：当天已发满 TARGET 篇则跳过（"开机补跑"幂等，避免与 8 点任务重复发）
  const todayCN = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
  const dayRes = await apiFetch(`/api/admin/articles?status=published&from=${todayCN}&limit=100`)
  const publishedToday = (dayRes.list || []).length
  if (publishedToday >= TARGET) {
    log(`[skip] 今天（${todayCN}）已发布 ${publishedToday} 篇，跳过本次`)
    await reportRun({ runAt: runStarted, total: 0, ok: 0, fail: 0, error: `当天已发布 ${publishedToday} 篇，跳过` })
    return
  }
  log(`[auto] 今天（${todayCN}）已发布 ${publishedToday}/${TARGET} 篇，继续生成`)
  let { list } = await apiFetch('/api/admin/seeds?status=pending&size=10')
  const have = list?.length || 0
  const need = TARGET - have
  if (need > 0) {
    log(`[auto] 素材池 ${have} 条，不足 ${TARGET} 条，AI 自动补 ${need} 条选题…`)
    try {
      const topics = await aiSuggestTopics()
      if (dryRun) {
        log('[dry-run] AI 选题预览（不入库）：')
        for (const tp of topics) log(`  · ${tp.title}（${tp.category}）| ${tp.angle}`)
      } else {
        const items = topics.map((tp) => ({
          raw: `选题：${tp.title}\n思路：${tp.angle}\n分类建议：${tp.category}`,
          category: tp.category,
        }))
        const r = await insertSeeds(items)
        log(`[auto] AI 选题已入素材池：${r.added} 条`)
        const again = await apiFetch('/api/admin/seeds?status=pending&size=10')
        list = again.list || []
      }
    } catch (e) {
      log('[auto] AI 选题失败：', e.message)
      await reportRun({ runAt: runStarted, total: 0, ok: 0, fail: 0, error: 'AI 选题失败: ' + e.message.slice(0, 200) })
      return
    }
  }
  if (!list || !list.length) {
    log('[skip] 素材池没有待处理素材')
    await reportRun({ runAt: runStarted, total: 0, ok: 0, fail: 0, error: '素材池为空' })
    return
  }
  log(`拉取 ${list.length} 条 pending 素材，模型 ${model}，dry-run=${dryRun}`)

  let created = 0
  let failed = 0
  try {
  for (const s of list) {
    const raw = s.raw || ''
    if (!raw || raw.length < 8) {
      if (!dryRun) await apiFetch(`/api/admin/seeds/${s.id}/fail`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '素材过短' }) })
      failed++
      continue
    }
    try {
      log(`[#${s.id}] AI 生成中…`)
      const aRaw = await aiGenerate(raw)
      // 链接池解析：AI 只输出 ref/id，URL 由 links-data.json 提供；池外链接丢弃
      const a = applyLinkPool(aRaw)
      // 自动分类：素材显式指定优先，否则用 AI 判断结果
      const category = s.category && s.category !== 'auto' ? s.category : (a.category || '优惠')
      const template = s.template && s.template !== 'auto' ? s.template : (a.template || 'deal')
      const item = {
        title: String(a.title || '').trim(),
        summary: String(a.summary || ''),
        content: Array.isArray(a.content) ? a.content : [],
        template,
        category,
        tags: Array.isArray(a.tags) ? a.tags : [],
        faq: Array.isArray(a.faq) ? a.faq : [],
        links: Array.isArray(a.links) ? a.links : [],
        expiresAt: a.expiresAt || s.expiresAt || null,
        publishAt: s.publishAt || null,
        status: s.publishAt ? 'draft' : 'published',
      }
      if (!item.title || !item.content.length) throw new Error('AI 结果缺 title/content')
      // 内容充实度兜底：块数过少 / 正文过短视为生成失败（标 failed 可重试，不入库低质文）
      const contentChars = JSON.stringify(item.content).length
      if (item.content.length < 3 || contentChars < 250) {
        throw new Error(`AI 内容过短（${item.content.length} 块 / ${contentChars} 字），请重试`)
      }
      if (dryRun) {
        log(`[#${s.id}] [dry-run] 将生成：${item.title}`)
        created++
        continue
      }
      const r = await batchCreate([item])
      if (r.safetyHits?.length) log(`[#${s.id}] ⚠ 命中内容安全规则转待审`)
      const articleId = r.results?.[0]?.id
      await apiFetch(`/api/admin/seeds/${s.id}/done`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleId }) })
      created++
      log(`[#${s.id}] ✓ ${item.title} → ${articleId}`)
    } catch (e) {
      failed++
      log(`[#${s.id}] ✗ ${e.message}`)
      if (!dryRun) {
        await apiFetch(`/api/admin/seeds/${s.id}/fail`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) }).catch(() => {})
      }
    }
  }
  log(`完成：成功 ${created}，失败 ${failed}${dryRun ? '（dry-run 未入库）' : ''}`)
  await reportRun({ runAt: runStarted, total: list.length, ok: created, fail: failed })
  } catch (e) {
    log('[fatal]', e.message)
    await reportRun({ runAt: runStarted, total: list.length, ok: created, fail: failed + 1, error: e.message.slice(0, 300) })
    throw e
  }
}

main().catch((e) => { console.error('[fatal]', e); process.exit(1) })
