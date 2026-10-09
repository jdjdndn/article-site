import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { batchCreateArticlesDirect } from '../../../utils/pipeline'

// POST /api/admin/articles/batch（Bearer 鉴权） —— 批量新增文章（AI 批量流水线产物）
// body: { articles: Array<ArticleInput>, category?, template? }
// 单篇必填 title/category；content/tags/links/faq 等 JSON 字段同单篇校验规则。
// 返回: { ok: true, results: [{ id, ok, error? }] } —— 部分成功不会整体失败
// 实现：与云端兜底共用 utils/pipeline.ts 的 batchCreateArticlesDirect（含内容安全 + 链接整组重写 + R2 正文）
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  const list = Array.isArray(body?.articles) ? body.articles : null
  if (!list || list.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'articles 数组必填且不能为空' })
  }
  if (list.length > 200) {
    throw createError({ statusCode: 400, statusMessage: '单次批量最多 200 篇，请分批' })
  }

  const db = useDb()
  const result = await batchCreateArticlesDirect(db, list)

  // 新文章不影响旧详情缓存，但首页列表缓存 60s 自然过期，无需逐个 purge

  return result
})
