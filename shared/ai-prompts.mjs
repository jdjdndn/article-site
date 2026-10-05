// AI 提示词单一来源（本地脚本 scripts/scheduled-generate.mjs 与云端 server/utils/daily-generate.ts 共用）
// 修改提示词只改这里；不要在其他文件再复制一份提示词，避免漂移。
// 链接池唯一来源：项目根目录 links-data.json（AI 只按 id 引用，URL 由 applyLinkPool 解析，禁止编造）。

import linksDataModule from '../links-data.json' with { type: 'json' }

const linksData = linksDataModule?.default ?? linksDataModule

// 合规红线品类：不给 AI 选（运营商号卡/信用卡等高风险）
const BLOCKED_LINK_CATS = new Set(['simcard', 'creditcard'])

function parseDeadline(dl) {
  if (!dl) return null
  const m = String(dl).match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function isExpired(dl) {
  const d = parseDeadline(dl)
  if (!d) return false
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return d.getTime() < today.getTime()
}

// 链接池（去掉占位/过期/禁用品类；缺 id 或 url 的丢弃）
function getLinkPool() {
  const raw = Array.isArray(linksData?.links) ? linksData.links : []
  return raw.filter((l) => l && l.id && l.url && !BLOCKED_LINK_CATS.has(l.category) && !isExpired(l.deadline))
}

// 提示词用紧凑目录：id｜分类｜名称(截止)｜说明（不塞长 URL，防抄错）
export function linkCatalogText() {
  const rows = getLinkPool()
  if (!rows.length) return '（链接池为空）'
  return rows
    .map((l) => {
      const dl = l.deadline ? `，截止${l.deadline}` : ''
      return `${l.id}｜${l.category || '-'}｜${l.name}${dl}｜${l.desc || ''}`
    })
    .join('\n')
}

// 把 AI 输出里的 ref/url 解析成链接池真实条目；池外一律丢弃
export function applyLinkPool(item) {
  const pool = getLinkPool()
  const byId = new Map(pool.map((l) => [String(l.id), l]))
  const byName = new Map(pool.map((l) => [String(l.name), l]))
  const byUrl = new Map(pool.map((l) => [String(l.url), l]))

  function resolve(ref) {
    if (ref == null || ref === '') return null
    const s = String(ref).trim()
    const hit = byId.get(s) || byName.get(s) || byUrl.get(s) || pool.find((l) => String(l.name).includes(s) && s.length >= 2)
    if (!hit?.url) return null
    return { label: String(hit.name || '').slice(0, 30), url: String(hit.url) }
  }

  const links = (Array.isArray(item?.links) ? item.links : [])
    .map((l) => {
      const r = resolve(l?.ref ?? l?.linkId ?? l?.url ?? l?.name)
      if (!r) return null
      return { label: String(l?.label || r.label).slice(0, 30) || r.label, url: r.url }
    })
    .filter(Boolean)
    .slice(0, 2)

  const content = (Array.isArray(item?.content) ? item.content : []).map((b) => {
    if (!b || typeof b !== 'object' || b.type !== 'ad') return b
    const r = resolve(b.ref ?? b.linkId ?? b.link)
    if (!r) {
      const { ref, linkId, link, ...rest } = b // 无有效池链接的 ad 块去掉跳转，保留文案
      return rest
    }
    return { ...b, link: r.url }
  })

  return { ...item, links, content }
}

// —— 时间背景（AI 选题用：当前日期 + 近 45 天节日/节气 + 当月时令） ——
export function dateContext() {
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
    const diff = Math.round((dt.getTime() - now.getTime()) / 86400000)
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

// —— AI 系统提示词（引流文：干货主体 + 软文链接 + 自动分类；引流文不写过期时间） ——
export function aiSystemPrompt() {
  const catalog = linkCatalogText()
  return `你是中文内容编辑，专职把原始素材（或链接池条目）写成"引流文"——以攻略、经验、干货、教程为主体，让读者觉得有用、愿意读完，再自然带出跳转链接（软文），不要写成硬邦邦的商品广告清单。
用户会给你一条或多条原始信息（可能凌乱、信息不全、有错别字）。请完成四件事：
1) 去 AI 味：自然口语化，删掉"首先/其次/值得一提的是/总的来说"等套话，避免对仗排比、每段首句总起的机器结构，多用短句和"你"；
2) 干货组织：把素材扩写成有实际阅读价值的内容——攻略给步骤/避坑/对比/清单，资讯给背景/要点/判断，问答贴近真实提问。可合理补充常识性建议，但不要编造参数、疗效、承诺或不存在的事实；
3) 内容充实度（硬要求）：content 至少 5 个块、正文字数合计不少于 400 字。guide → 至少 3 个 h2、步骤化 list、含避坑点；faq → text 段落为主、faq 至少 3 条且口语化；default → 3-5 个 text 段落 + 可 1 个 h2 + 1 个 list；deal → 选购攻略式（怎么选、适合谁、注意事项）+ 1 个 price 块 + 1 个 ad 软文块。每段写具体（给步骤、例子、数字、避坑、对比），禁止空洞概括、车轱辘话、只解释概念不教方法；
4) 自动分类：从 ["优惠","攻略","好物","副业"] 中选最合适的 category；从 ["guide","faq","default"] 中选 template（操作攻略→guide、答疑→faq、资讯/经验→default）。只有素材是纯商品清单（价格+卖点+链接）才选 "deal" 并按"选购攻略"写；
5) 结构化输出：只输出一个 JSON 对象（不要多余文字、不要 markdown 代码块），schema 如下：
{"title":"标题（18字内，突出价值点而非价格）","summary":"一句话摘要（突出能帮读者解决什么）","category":"优惠/攻略/好物/副业之一","template":"guide/faq/default/deal之一","content":[块对象],"tags":["标签1","标签2","标签3"],"faq":[{"q":"常见问题","a":"简短回答"}],"links":[{"label":"按钮文字","ref":"链接池id"}]}
可用块对象类型：text（段落，字段 text）/ h2（小标题，字段 text）/ list（要点列表，字段 items:[]）/ quote（提示框，字段 text,tone:"warn"|"info"）/ ad（软文块，字段 label,text,ref）/ price（价格卡，仅 deal 用）/ image（网络图片，字段 url,alt?,caption?）/ video（网络视频，字段 url,title?）。
链接池用法（重要）：系统提供「链接池」目录（格式：id｜分类｜名称｜说明）。
- 正文跳转链接**只能从链接池中挑选**，禁止使用池外任何 URL，禁止编造 example.com / test.com / yourlink.com 等虚构或占位链接；素材自带的外链一律不采用。
- 每篇优先挑 1 条与主题最相关的链接（最多 2 条）。分类对齐参考：优惠/好物→ecommerce、food；攻略/出行→travel、cloud、miniprogram；副业/资源→app、netdisk、member。
- links 输出 [{"label":"按钮文字","ref":"链接池中的id"}]，ref 必须原样使用池中 id，不要自己写 URL。
- 正文结尾放 1 个 ad 软文块：{"type":"ad","label":"推荐","text":"自然口吻推荐语","ref":"同一个id"}。
- 池中确实没有与主题相关的链接时：links 输出 []，正文不放 ad 块。
- **可直接按链接池写文**：当素材过短/信息不足，或素材本身就指向某类服务/会场时，可从链接池挑 1 条作为选题主体来写（按其 category 与 desc 展开：怎么用、适合谁、注意事项、避坑）。此时标题与正文围绕该链接的真实用途，价格/参数只写链接 desc 里有的，没有的不编造；links/ad 仍引用该 id。
防重复（硬要求）：同一链接池条目可以写多篇，但每篇**角度/结构/切入点必须明显不同**——禁止几乎相同的标题、相同的段落顺序、相同的清单条目。可用不同场景、不同人群、不同步骤拆解、FAQ 与攻略互换等写法拉开差异；禁止把同一条链接的说明文案原样扩写成多篇。
链接池：
${catalog}
过期时间：引流文不写 expiresAt（攻略/经验类文章不过期）；仅当素材含明确的限时信息（如"活动截止 10 月 31 日"）才写 expiresAt。
图片与视频：一律使用网络资源 URL（素材里给的图片/视频链接优先），渲染时标注来源网络；素材没有相关 URL 时**绝不编造图片或视频地址**（编造的死链会直接损坏阅读体验），宁可不放图也不放假链接。
合规红线：禁止出现"最/第一/全网唯一/绝无仅有/百分百/绝对"等极限词与绝对化承诺，禁止夸大功效、编造用户评价或虚假折扣信息；涉及价格只写素材里有的，不做"保价/最低价"承诺；不涉及医疗功效、金融收益、赌博、违禁品、运营商号卡套餐等高风险内容。`
}

// —— AI 自动选题（素材池不足时补足；可结合链接池写选题；选题贴合近期日期，合规可落地） ——
export function aiSuggestPrompt() {
  const catalog = linkCatalogText()
  return `你是中文内容选题策划。站点定位：省钱/好物/攻略/副业类引流文——干货主体 + 自然软文链接，不做硬广，文章不写具体优惠截止时间。
请基于下面的时间背景与链接池，策划 3 个贴合近期时间、读者愿意看的引流文选题：
时间背景：${dateContext()}
链接池（可直接按其中条目出选题，格式：id｜分类｜名称｜说明）：
${catalog}
要求：
1) 紧扣近期时令/节日/热点，但标题**避免"即将/马上/倒计时/XX前/XX后"等强时效词**，写成过三个月再读依然成立的话题（如把"国庆出行前"写成"出行行李收纳"）；也不要承诺具体优惠截止时间；
2) **3 个选题必须分属 3 个不同 category**（优惠/攻略/好物/副业各用一次），避免同一天主题同质化；
3) 合法合规：不涉及医疗功效、金融理财收益、赌博、违禁品、运营商号卡套餐等高风险品类；
4) 每篇有明确干货角度（读者能学到什么）：angle 里写清 3-5 个可落地的具体知识点（如具体步骤、避坑点、对比维度、清单），并提示软文挂载点（正文哪个位置可自然放第三方推广链接）；禁止只有空泛概念没有可写内容。**至少 1 个选题直接以链接池某条为主体**（把 id 写进 angle，便于成文时引用）；
5) **防重复**：优先选尚未写过的角度/场景/人群；同一条链接不要连续出多篇同构选题，角度必须明显不同；
6) 只输出一个 JSON 数组（不要多余文字、不要 markdown 代码块），每个元素：
{"title":"选题标题(≤18字)","angle":"干货角度+软文挂载点提示(80-160字，含链接池id如有)","category":"优惠/攻略/好物/副业之一"}`
}
