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

const __dir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dir, '..')
const KEY_FILE = path.join(ROOT, '.env.manage-key')
const TFG = 'http://localhost:3456/v1'
const SITE = 'https://www.wcbblll.cc'

const args = process.argv.slice(2)
const model = (args.find((a) => a.startsWith('--model=')) || '').split('=')[1] || 'deepseek-chat'
const dryRun = args.includes('--dry-run')

// —— AI 系统提示词（引流文：干货主体 + 软文链接 + 自动分类；引流文不写过期时间）——
function aiSystemPrompt() {
  return `你是中文内容编辑，专职把原始素材写成"引流文"——以攻略、经验、干货、教程为主体，让读者觉得有用、愿意读完，再自然带出跳转链接（软文），不要写成硬邦邦的商品广告清单。
用户会给你一条或多条原始信息（可能凌乱、信息不全、有错别字）。请完成四件事：
1) 去 AI 味：自然口语化，删掉"首先/其次/值得一提的是/总的来说"等套话，避免对仗排比、每段首句总起的机器结构，多用短句和"你"；
2) 干货组织：把素材扩写成有实际阅读价值的内容——攻略给步骤/避坑/对比，资讯给背景/要点/判断，问答贴近真实提问。可合理补充常识性建议，但不要编造参数、疗效、承诺或不存在的事实；
3) 自动分类：从 ["优惠","攻略","好物","副业"] 中选最合适的 category；从 ["guide","faq","default"] 中选 template（操作攻略→guide、答疑→faq、资讯/经验→default）。只有素材是纯商品清单（价格+卖点+链接）才选 "deal" 并按"选购攻略"写；
4) 结构化输出：只输出一个 JSON 对象（不要多余文字、不要 markdown 代码块），schema 如下：
{"title":"标题（18字内，突出价值点而非价格）","summary":"一句话摘要（突出能帮读者解决什么）","category":"优惠/攻略/好物/副业之一","template":"guide/faq/default/deal之一","content":[块对象],"tags":["标签1","标签2","标签3"],"faq":[{"q":"常见问题","a":"简短回答"}],"links":[{"label":"按钮文字","url":"https://..."}]}
可用块对象类型：text（段落，字段 text）/ h2（小标题，字段 text）/ list（要点列表，字段 items:[]）/ quote（提示框，字段 text,tone:"warn"|"info"）/ ad（软文块，字段 label,text,link?）/ price（价格卡，仅 deal 用）。
内容要求：template 为 guide → 至少 2 个 h2、步骤化 list、含避坑点；faq → text 段落为主、faq 至少 3 条且口语化；default → 2-3 个 text 段落 + 可 1 个 h2 + 1 个 list；deal → 选购攻略式（怎么选、适合谁、注意事项）+ 1 个 price 块 + 1 个 ad 软文块。文章结尾放 1 个 ad 软文块（label 如"去看看"，link 用素材里给的跳转链接；素材无链接就不放 ad）。
links 保留素材给的全部跳转链接（label 可用"去看看/了解详情"等，不要堆"领券/抢购"这类带货词）。tags 3-5 个，faq 2-4 条。
过期时间：引流文不写 expiresAt（攻略/经验类文章不过期）；仅当素材含明确的限时信息（如"活动截止 10 月 31 日"）才写 expiresAt。`
}

function log(...a) { console.log(new Date().toISOString(), ...a) }

// —— 工具 ——
function getKey() {
  const raw = readFileSync(KEY_FILE, 'utf-8').trim()
  return raw.replace(/^MANAGE_KEY=/, '')
}
function extractJson(text) {
  const t = text.trim()
  try { return JSON.parse(t) } catch { /* fallthrough */ }
  const mc = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (mc) { try { return JSON.parse(mc[1].trim()) } catch { /* fallthrough */ } }
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) { try { return JSON.parse(t.slice(start, end + 1)) } catch { /* fallthrough */ } }
  return null
}
async function aiGenerate(raw) {
  const res = await fetch(`${TFG}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(180000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: aiSystemPrompt() },
        { role: 'user', content: `原始信息：\n${JSON.stringify(raw, null, 2)}` },
      ],
      stream: false,
    }),
  })
  if (!res.ok) throw new Error(`AI 网关 HTTP ${res.status}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content || ''
  const parsed = extractJson(text)
  if (!parsed) throw new Error('AI 返回无法解析为 JSON')
  return parsed
}
async function apiFetch(pathname, opts = {}) {
  const key = getKey()
  const url = pathname.includes('?') ? `${SITE}${pathname}&key=${key}` : `${SITE}${pathname}?key=${key}`
  const res = await fetch(url, opts)
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

// —— 主流程 ——
async function main() {
  const { list } = await apiFetch('/api/admin/seeds?status=pending&size=10')
  if (!list || !list.length) {
    log('[skip] 素材池没有待处理素材')
    return
  }
  log(`拉取 ${list.length} 条 pending 素材，模型 ${model}，dry-run=${dryRun}`)

  let created = 0
  let failed = 0
  for (const s of list) {
    const raw = s.raw || ''
    if (!raw || raw.length < 8) {
      if (!dryRun) await apiFetch(`/api/admin/seeds/${s.id}/fail`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '素材过短' }) })
      failed++
      continue
    }
    try {
      log(`[#${s.id}] AI 生成中…`)
      const a = await aiGenerate(raw)
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
}

main().catch((e) => { console.error('[fatal]', e); process.exit(1) })
