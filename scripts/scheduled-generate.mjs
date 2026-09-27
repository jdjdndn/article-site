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
可用块对象类型：text（段落，字段 text）/ h2（小标题，字段 text）/ list（要点列表，字段 items:[]）/ quote（提示框，字段 text,tone:"warn"|"info"）/ ad（软文块，字段 label,text,link?）/ price（价格卡，仅 deal 用）/ image（网络图片，字段 url,alt?,caption?）/ video（网络视频，字段 url,title?）。
内容要求：template 为 guide → 至少 2 个 h2、步骤化 list、含避坑点；faq → text 段落为主、faq 至少 3 条且口语化；default → 2-3 个 text 段落 + 可 1 个 h2 + 1 个 list；deal → 选购攻略式（怎么选、适合谁、注意事项）+ 1 个 price 块 + 1 个 ad 软文块。文章结尾放 1 个 ad 软文块（label 如"去看看"，link 用素材里给的跳转链接；素材无链接就不放 ad）。
links 保留素材给的全部跳转链接（label 可用"去看看/了解详情"等，不要堆"领券/抢购"这类带货词）。tags 3-5 个，faq 2-4 条。
过期时间：引流文不写 expiresAt（攻略/经验类文章不过期）；仅当素材含明确的限时信息（如"活动截止 10 月 31 日"）才写 expiresAt。
图片与视频：一律使用网络资源 URL（素材里给的图片/视频链接优先），渲染时标注来源网络；素材没有相关 URL 时**绝不编造图片或视频地址**（编造的死链会直接损坏阅读体验），宁可不放图也不放假链接。
合规红线：禁止出现"最/第一/全网唯一/绝无仅有/百分百/绝对"等极限词与绝对化承诺，禁止夸大功效、编造用户评价或虚假折扣信息；涉及价格只写素材里有的，不做"保价/最低价"承诺；不涉及医疗功效、金融收益、赌博、违禁品、运营商号卡套餐等高风险内容。`
}

function log(...a) { console.log(new Date().toISOString(), ...a) }

// —— 时间背景（AI 选题用：当前日期 + 近 45 天节日/节气 + 当月时令） ——
function dateContext() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  const events = [
    [1, 1, '元旦'], [2, 14, '情人节'], [3, 8, '妇女节'], [4, 5, '清明'], [5, 1, '劳动节'],
    [6, 1, '儿童节'], [8, 1, '建军节'], [9, 10, '教师节'], [10, 1, '国庆'],
    [10, 23, '霜降'], [10, 31, '万圣节'], [11, 7, '立冬'], [11, 11, '双十一'],
    [12, 21, '冬至'], [12, 24, '平安夜'], [12, 31, '跨年'],
  ]
  const upcoming = []
  for (const [em, ed, name] of events) {
    const dt = new Date(y, em - 1, ed)
    const diff = Math.round((dt - now) / 86400000)
    if (diff >= 0 && diff <= 45) upcoming.push(`${name}(${em}月${ed}日，还有${diff}天)`)
  }
  const season = {
    1: ['年货采买', '冬季保暖', '元旦假期'],
    2: ['春节年货', '走亲访友礼品', '早春换季'],
    3: ['春装上新', '春季出游', '开学季'],
    4: ['春游露营', '春季护肤', '防晒预热'],
    5: ['初夏清凉', '五一出行', '夏季小家电'],
    6: ['年中大促', '夏季防晒', '消暑冷饮'],
    7: ['暑期出行', '夏季清凉家居', '防暑降温'],
    8: ['开学季文具箱包', '夏末清仓', '秋装预热'],
    9: ['秋季时令(大闸蟹/柚子/板栗/柿子)', '秋装换季', '开学季尾巴', '国庆出行准备'],
    10: ['国庆假期', '秋季润燥食补', '换季护肤', '双十一预热'],
    11: ['双十一', '冬季保暖(羽绒/秋裤)', '火锅食材', '取暖设备'],
    12: ['双十二', '年货', '冬至', '圣诞跨年'],
  }
  const seas = (season[m] || []).join('、')
  return `今天是 ${y} 年 ${m} 月 ${d} 日。近 45 天的重要节日/节气：${upcoming.join('、') || '无'}。当前时令话题（${m} 月）：${seas}。`
}

// —— AI 自动选题（素材池不足时补足；选题贴合近期日期，合规可落地） ——
function aiSuggestPrompt() {
  return `你是中文内容选题策划。站点定位：省钱/好物/攻略/副业类引流文——干货主体 + 自然软文链接，不做硬广，文章不写具体优惠截止时间。
请基于下面的时间背景，策划 3 个贴合近期时间、读者愿意看的引流文选题：
时间背景：${dateContext()}
要求：
1) 紧扣近期时令/节日/热点，选题带时间感（如"国庆出行前""秋季换季"），但不要承诺具体优惠截止时间；
2) 合法合规：不涉及医疗功效、金融理财收益、赌博、违禁品、运营商号卡套餐等高风险品类；
3) 每篇有明确干货角度（读者能学到什么），并提示软文挂载点（正文哪个位置可自然放第三方推广链接）；
4) 只输出一个 JSON 数组（不要多余文字、不要 markdown 代码块），每个元素：
{"title":"选题标题(≤18字)","angle":"干货角度+软文挂载点提示(60-120字)","category":"优惠/攻略/好物/副业之一"}`
}

// 空素材池时：AI 自动出选题 → 入素材池(source='ai') → 复用生成流程
async function aiSuggestTopics() {
  const res = await fetch(`${TFG}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(180000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: aiSuggestPrompt() },
        { role: 'user', content: '请输出 3 个选题 JSON 数组。' },
      ],
      stream: false,
    }),
  })
  if (!res.ok) throw new Error(`AI 网关 HTTP ${res.status}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content || ''
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
  await reportRun({ runAt: runStarted, total: list.length, ok: created, fail: failed })
  } catch (e) {
    log('[fatal]', e.message)
    await reportRun({ runAt: runStarted, total: list.length, ok: created, fail: failed + 1, error: e.message.slice(0, 300) })
    throw e
  }
}

main().catch((e) => { console.error('[fatal]', e); process.exit(1) })
