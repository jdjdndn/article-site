// 内容安全审核（轻量，Cloudflare D1/Worker 内运行，无外部依赖）
// 覆盖法律与平台明确禁止的通用违规类别；命中即提示转人工审核。
// 注意：仅用于内容合规兜底，不替代人工审核；后台仍可强制发布。
const RULES: Array<{ cat: string; label: string; words: string[] }> = [
  {
    cat: 'porn',
    label: '色情低俗',
    words: ['色情', '淫秽', '裸聊', '约炮', '一夜情', '援交', '嫖娼', '卖淫', 'AV在线', '成人影片', '黄色网站', '福利姬', '裸贷'],
  },
  {
    cat: 'gambling',
    label: '赌博',
    words: ['赌博', '博彩', '六合彩', '时时彩', '赌球', '百家乐', '老虎机', '棋牌赚钱', '澳门赌场', '线上赌场', '下注返利'],
  },
  {
    cat: 'drug',
    label: '毒品',
    words: ['毒品', '冰毒', '海洛因', '大麻', '摇头丸', '止咳水', '笑气', '迷药', '催情水', '毒品代购'],
  },
  {
    cat: 'fraud',
    label: '诈骗引流',
    words: ['刷单返利', '杀猪盘', '电信诈骗', '虚假中奖', '兼职刷单', '博彩套利', '资金盘', '庞氏骗局', '拉人头返现', '高回报理财'],
  },
  {
    cat: 'weapon',
    label: '暴恐武器',
    words: ['枪支', '弹药', '自制炸药', '雷管', '管制刀具', '爆炸物制作', '恐怖袭击', '袭击教程', '杀伤性武器'],
  },
  {
    cat: 'illegal-trade',
    label: '违禁交易',
    words: ['违禁品', '走私', '代购处方药', '假币', '假证', '伪造证件', '发票代开', '枪支配件'],
  },
  {
    cat: 'minor',
    label: '未成年相关',
    words: ['未成年色情', '幼女', '恋童', '儿童色情', '未成年裸聊'],
  },
]

export interface SafetyHit { cat: string; label: string; word: string }
export interface SafetyResult { ok: boolean; hits: SafetyHit[] }

// 对一段文本做类别关键词扫描
export function scanText(text: string): SafetyHit[] {
  const hits: SafetyHit[] = []
  if (!text) return hits
  for (const rule of RULES) {
    for (const w of rule.words) {
      if (text.includes(w)) {
        hits.push({ cat: rule.cat, label: rule.label, word: w })
        break // 每类最多记一个命中词，避免刷屏
      }
    }
  }
  return hits
}

// 对文章字段整体扫描：标题/摘要/正文原文（content 为 JSON 块数组或 JSON 字符串）
export function checkArticleSafety(input: { title?: string; summary?: string; content?: any }): SafetyResult {
  const texts: string[] = []
  if (input.title) texts.push(input.title)
  if (input.summary) texts.push(input.summary)
  if (input.content != null) {
    if (typeof input.content === 'string') texts.push(input.content)
    else if (Array.isArray(input.content)) {
      for (const block of input.content) {
        if (!block || typeof block !== 'object') continue
        if (typeof block.text === 'string') texts.push(block.text)
        if (Array.isArray(block.items)) texts.push(block.items.join(' '))
        if (typeof block.label === 'string') texts.push(block.label)
      }
    }
  }
  const seen = new Map<string, SafetyHit>()
  for (const t of texts) {
    for (const h of scanText(t)) {
      if (!seen.has(h.cat)) seen.set(h.cat, h)
    }
  }
  const hits = [...seen.values()]
  return { ok: hits.length === 0, hits }
}
