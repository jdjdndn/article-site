// 文章数据归一化 — 统一从 auto-ai-article 库导出
export { safeArticle, flattenToStrings, flattenFaq, flattenLinks } from 'ai-article-pipeline'
export { normalizeJson, safeJson, firstImageOf } from 'ai-article-pipeline'
import { firstImageOf, safeJson } from 'ai-article-pipeline'

// 行记录 → 列表输出（优先 first_image 列，旧数据无列值时退回解析 content）
export function toListItem(r: any): any {
  const { content, ...rest } = r
  return { ...rest, firstImage: r.firstImage || (content ? firstImageOf(safeJson(content)) : '') }
}
