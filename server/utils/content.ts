// 内容工具 — 复用 auto-ai-article 库（npm file:../auto-ai-article）
// safeJson / normalizeJson / firstImageOf 与库一致，从库 re-export；
// toListItem 为 article-site 列表输出特有逻辑，保留本地。
export { safeJson, normalizeJson, firstImageOf } from 'ai-article-pipeline'
import { firstImageOf, safeJson } from 'ai-article-pipeline'

// 行记录 → 列表输出（优先 first_image 列，旧数据无列值时退回解析 content）
export function toListItem(r: any): any {
  const { content, ...rest } = r
  return { ...rest, firstImage: r.firstImage || (content ? firstImageOf(safeJson(content)) : '') }
}
