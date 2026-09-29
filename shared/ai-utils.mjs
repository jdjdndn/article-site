// AI 工具函数单一来源（本地脚本 scripts/scheduled-generate.mjs 与云端 server/utils/daily-generate.ts 共用）

// 从模型输出文本中提取 JSON（容忍 markdown 代码块包裹 / 前后多余文字）
export function extractJson(text) {
  if (typeof text !== 'string') return null
  const t = text.trim()
  try { return JSON.parse(t) } catch { /* fallthrough */ }
  const mc = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (mc) {
    try { return JSON.parse(mc[1].trim()) } catch { /* fallthrough */ }
  }
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)) } catch { /* fallthrough */ }
  }
  return null
}
