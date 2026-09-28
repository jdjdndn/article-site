// 内容工具：JSON 字段解析 + 首图提取（列表/收藏接口共用，避免各接口重复实现）

export function safeJson(s: string | null, fallback: any = []): any {
  if (!s) return fallback
  try { return JSON.parse(s) } catch { return fallback }
}

// 从 content 块数组提取第一个 image 块 URL（无图返回 ''）
export function firstImageOf(content: any): string {
  if (!Array.isArray(content)) return ''
  const b = content.find((x: any) => x?.type === 'image' && x?.url)
  return b?.url || ''
}

// 行记录 → 列表输出（优先 first_image 列，旧数据无列值时退回解析 content）
export function toListItem(r: any): any {
  const { content, ...rest } = r
  return { ...rest, firstImage: r.firstImage || (content ? firstImageOf(safeJson(content)) : '') }
}
