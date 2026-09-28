import { and, eq, gte, ne, sql } from 'drizzle-orm'
import { useDb } from './db'
import { articles, runLogs, clickLogs, searchLogs, reports } from '../db/schema'
import { useRuntimeConfig } from '#imports'

// 云端兜底流水线（B 方案）：
// - 本地 8:00 任务失败 / 电脑关机时，由 */5 cron 在窗口内轮询自动补生成；
// - 与本地脚本共用线上 admin API（seeds 入池 / 文章入库含安全审核 / run-logs 上报），
//   仅 AI 来源不同：Cloudflare Workers AI 开源模型（零成本、不依赖本地网关）。
// - 提示词与 scripts/scheduled-generate.mjs 保持同步（勿单侧修改）。

const SITE = 'https://www.wcbblll.cc'
const MODEL = '@cf/qwen/qwen2.5-7b-instruct'
const TARGET = 3
const WINDOW_START_MIN = 40 // UTC 00:40 = 北京 08:40（给本地 8:00 任务留足完成时间，压掉并发竞态窗口）
const WINDOW_END_MIN = 120 // UTC 02:00 = 北京 10:00

const log = (...a: any[]) => console.log(new Date().toISOString(), '[daily-generate]', ...a)

// —— 时间背景（AI 选题用：当前日期 + 近 45 天节日/节气 + 当月时令） ——
function dateContext() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  const events: [number, number, string][] = [
    [1, 1, '元旦'], [2, 14, '情人节'], [3, 8, '妇女节'], [4, 5, '清明'], [5, 1, '劳动节'],
    [6, 1, '儿童节'], [8, 1, '建军节'], [9, 10, '教师节'], [10, 1, '国庆'],
    [10, 23, '霜降'], [10, 31, '万圣节'], [11, 7, '立冬'], [11, 11, '双十一'],
    [12, 21, '冬至'], [12, 24, '平安夜'], [12, 31, '跨年'],
  ]
  const upcoming: string[] = []
  for (const [em, ed, name] of events) {
    const dt = new Date(y, em - 1, ed)
    const diff = Math.round((dt.getTime() - now.getTime()) / 86400000)
    if (diff >= 0 && diff <= 45) upcoming.push(`${name}(${em}月${ed}日，还有${diff}天)`)
  }
  const season: Record<number, string[]> = {
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

// —— AI 自动选题（素材池不足时补足；选题贴合近期日期，合规可落地） ——
function aiSuggestPrompt() {
  return `你是中文内容选题策划。站点定位：省钱/好物/攻略/副业类引流文——干货主体 + 自然软文链接，不做硬广，文章不写具体优惠截止时间。
请基于下面的时间背景，策划 3 个贴合近期时间、读者愿意看的引流文选题：
时间背景：${dateContext()}
要求：
1) 紧扣近期时令/节日/热点，但标题**避免"即将/马上/倒计时/XX前/XX后"等强时效词**，写成过三个月再读依然成立的话题（如把"国庆出行前"写成"出行行李收纳"）；也不要承诺具体优惠截止时间；
2) **3 个选题必须分属 3 个不同 category**（优惠/攻略/好物/副业各用一次），避免同一天主题同质化；
3) 合法合规：不涉及医疗功效、金融理财收益、赌博、违禁品、运营商号卡套餐等高风险品类；
4) 每篇有明确干货角度（读者能学到什么），并提示软文挂载点（正文哪个位置可自然放第三方推广链接）；
5) 只输出一个 JSON 数组（不要多余文字、不要 markdown 代码块），每个元素：
{"title":"选题标题(≤18字)","angle":"干货角度+软文挂载点提示(60-120字)","category":"优惠/攻略/好物/副业之一"}`
}

function extractJson(text: string): any {
  const t = text.trim()
  try { return JSON.parse(t) } catch { /* fallthrough */ }
  const mc = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (mc) { try { return JSON.parse(mc[1].trim()) } catch { /* fallthrough */ } }
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) { try { return JSON.parse(t.slice(start, end + 1)) } catch { /* fallthrough */ } }
  return null
}

// 云端 AI 服务不可用（额度/模型类错误）：本轮窗口放弃，不再空转重试
class AiFatalError extends Error {}

async function aiChat(messages: { role: string; content: string }[]): Promise<string> {
  const ai: any = (process.env as any).AI
  if (!ai) throw new AiFatalError('AI binding 未配置（云端兜底需在 wrangler.jsonc 配置 Workers AI binding）')
  try {
    const out: any = await ai.run(MODEL, { messages, max_tokens: 4096 })
    return String(out?.response ?? out?.text ?? '')
  } catch (e: any) {
    const m = String(e?.message || e || '')
    if (/limit|quota|429|not\s*\.?\s*found|model|AI|credit/i.test(m)) throw new AiFatalError(m)
    throw e
  }
}

async function apiFetch(pathname: string, opts: any = {}) {
  const cfg: any = useRuntimeConfig()
  const key = cfg.manageKey || ''
  const url = pathname.includes('?') ? `${SITE}${pathname}&key=${key}` : `${SITE}${pathname}?key=${key}`
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`API HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
  return data
}

async function publishedTodayCount(): Promise<number> {
  const db = useDb()
  const todayCN = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
  const from = todayCN + 'T00:00:00.000Z'
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
  const todayCN = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
  const from = todayCN + 'T00:00:00.000Z'
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
  const todayCN = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
  const from = todayCN + 'T00:00:00.000Z'
  const rows = await db
    .select({ id: runLogs.id })
    .from(runLogs)
    .where(and(sql`${runLogs.error} LIKE '%[ai-down]%'`, gte(runLogs.runAt, from)))
    .limit(1)
  return rows.length > 0
}

async function aiSuggestTopics(): Promise<{ title: string; angle: string; category: string }[]> {
  const text = await aiChat([
    { role: 'system', content: aiSuggestPrompt() },
    { role: 'user', content: '请输出 3 个选题 JSON 数组。' },
  ])
  const parsed = extractJson(text)
  let arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.topics) ? parsed.topics : null)
  if (!arr || !arr.length) throw new Error('AI 选题返回空数组')
  return arr.slice(0, 3).map((x: any) => ({
    title: String(x.title || '').trim(),
    angle: String(x.angle || '').trim(),
    category: ['优惠', '攻略', '好物', '副业'].includes(x.category) ? x.category : 'auto',
  }))
}

// 日志定期清理（90 天前；每天窗口内幂等执行——90 天前数据删空后 DELETE 0 行，零成本）
async function cleanupOldLogs() {
  const db = useDb()
  await db.run(sql`DELETE FROM click_logs WHERE created_at < datetime('now', '-90 days')`)
  await db.run(sql`DELETE FROM search_logs WHERE created_at < datetime('now', '-90 days')`)
  await db.run(sql`DELETE FROM run_logs WHERE run_at < datetime('now', '-90 days')`)
  await db.run(sql`DELETE FROM reports WHERE created_at < datetime('now', '-90 days') AND status = 'done'`)
}

export async function runDailyGenerate(opts: { forceWindow?: boolean } = {}) {
  const now = new Date()
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
  if (!opts.forceWindow && (mins < WINDOW_START_MIN || mins > WINDOW_END_MIN)) {
    log('不在兜底窗口（北京 08:25-10:00），跳过')
    return { skipped: 'window' }
  }
  // 日志表定期清理（点击/搜索/运行/已处理反馈，90 天前）
  try { await cleanupOldLogs() } catch (e: any) { log('日志清理失败：', e.message) }
  const done = await publishedTodayCount()
  if (done >= TARGET) {
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
  log(`当天已发布 ${done}/${TARGET} 篇，开始兜底（模型 ${MODEL}）`)
  let { list } = await apiFetch('/api/admin/seeds?status=pending&size=10')
  const have = list?.length || 0
  if (have < TARGET) {
    try {
      const topics = await aiSuggestTopics()
      if (topics.length) {
        const r = await apiFetch('/api/admin/seeds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: topics.map((tp) => ({ raw: `选题：${tp.title}\n思路：${tp.angle}\n分类建议：${tp.category}`, category: tp.category })),
            source: 'ai',
          }),
        })
        log(`AI 选题已入素材池：${r.added} 条`)
        const again = await apiFetch('/api/admin/seeds?status=pending&size=10')
        list = again.list || []
      }
    } catch (e: any) {
      if (e instanceof AiFatalError) {
        const msg = `[ai-down] 云端 AI 选题失败（${e.message}），当天窗口放弃`
        try {
          await apiFetch('/api/admin/run-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runAt: new Date().toISOString(), model: MODEL, dryRun: false, total: 0, ok: 0, fail: 1, error: msg.slice(0, 200) }),
          })
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
  const linked = list.filter((s: any) => s.article_id)
  if (linked.length) {
    for (const s of linked) {
      await apiFetch(`/api/admin/seeds/${s.id}/done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: s.article_id }),
      }).catch(() => log(`补 done 失败 seed#${s.id}`))
    }
    list = list.filter((s: any) => !s.article_id)
    log(`清理 ${linked.length} 条已关联文章的残留 pending 素材`)
  }
  const targets = list.slice(0, TARGET)
  const results = await Promise.allSettled(targets.map(async (s: any) => {
    const raw = String(s.raw || '')
    if (raw.length < 8) {
      await apiFetch(`/api/admin/seeds/${s.id}/fail`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '素材过短' }) }).catch(() => {})
      throw new Error('素材过短')
    }
    const text = await aiChat([
      { role: 'system', content: aiSystemPrompt() },
      { role: 'user', content: `原始信息：\n${JSON.stringify(raw)}` },
    ])
    const a = extractJson(text)
    if (!a) throw new Error('AI 返回无法解析为 JSON')
    const item = {
      title: String(a.title || '').trim(),
      summary: String(a.summary || ''),
      content: Array.isArray(a.content) ? a.content : [],
      template: ['deal', 'guide', 'faq'].includes(a.template) ? a.template : (s.template && s.template !== 'auto' ? s.template : 'deal'),
      category: s.category && s.category !== 'auto' ? s.category : (a.category || '优惠'),
      tags: Array.isArray(a.tags) ? a.tags : [],
      faq: Array.isArray(a.faq) ? a.faq : [],
      links: Array.isArray(a.links) ? a.links : [],
      expiresAt: a.expiresAt || s.expiresAt || null,
      publishAt: s.publishAt || null,
      status: s.publishAt ? 'draft' : 'published',
    }
    if (!item.title || !item.content.length) throw new Error('AI 结果缺 title/content')
    const r = await apiFetch('/api/admin/articles/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles: [item] }),
    })
    const articleId = r.results?.[0]?.id
    await apiFetch(`/api/admin/seeds/${s.id}/done`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId }),
    })
    return { title: item.title, articleId }
  }))
  const ok = results.filter((x) => x.status === 'fulfilled').length
  const fail = results.length - ok
  // 额度/模型故障：全部失败且均为致命错误 → 标记 [ai-down]，窗口剩余轮次跳过
  const fatal = results.length > 0 && results.every((x) => x.status === 'rejected' && x.reason instanceof AiFatalError)
  if (fatal) {
    const msg = `[ai-down] 云端 AI 服务不可用（${(results[0] as any)?.reason?.message || ''}），当天窗口放弃`
    try {
      await apiFetch('/api/admin/run-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runAt: new Date().toISOString(), model: MODEL, dryRun: false, total: results.length, ok: 0, fail: results.length, error: msg.slice(0, 200) }),
      })
    } catch { /* noop */ }
    log(msg)
    return { skipped: 'ai-down', fail: results.length }
  }
  try {
    await apiFetch('/api/admin/run-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runAt: new Date().toISOString(), model: MODEL, dryRun: false, total: results.length, ok, fail }),
    })
  } catch { /* 上报失败不阻塞 */ }
  log(`完成：成功 ${ok}，失败 ${fail}`)
  return { ok, fail, total: results.length }
}
