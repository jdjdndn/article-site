import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { articles } from '../../../db/schema'
import { checkArticleSafety } from '../../../utils/content-safety'
import { buildLinkStatements } from '../../../utils/links'

// POST /api/admin/articles/batch?key=xxx —— 批量新增文章（AI 批量流水线产物）
// body: { articles: Array<ArticleInput>, category?, template? }
// 单篇必填 title/category；content/tags/links/faq 等 JSON 字段同单篇校验规则。
// 返回: { ok: true, results: [{ id, ok, error? }] } —— 部分成功不会整体失败
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

  const baseNow = Date.now()
  const now = new Date(baseNow).toISOString()
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const base = baseNow.toString().slice(-6)

  const db = useDb()
  const stmts: any[] = []
  const results: Array<{ id?: string; ok: boolean; error?: string }> = []
  const safetyHits: Array<{ id: string; hits: any[] }> = []

  list.forEach((a: any, i: number) => {
    try {
      if (!a || typeof a.title !== 'string' || !a.title.trim()) {
        throw new Error('标题必填')
      }
      if (!a.category) {
        throw new Error('分类必填')
      }
      const content = normalizeJson(a.content)
      if (content === null) {
        throw new Error('content 必须是合法 JSON（段落数组）')
      }
      const id = `a-${ymd}-${base}${String(i).padStart(2, '0')}`
      const publishAt = a.publishAt ? String(a.publishAt) : null
      let status = a.status === 'published' ? 'published' : 'draft'
      if (publishAt && publishAt > now) status = 'draft'

      // 内容安全兜底：命中违规词 → 强制草稿待人工审核，并回传命中信息
      const safety = checkArticleSafety({ title: a.title, summary: a.summary, content })
      const needsReview = safety.hits.length > 0 && status === 'published' ? 1 : 0
      if (safety.hits.length > 0 && status === 'published') {
        status = 'draft'
        safetyHits.push({ id, hits: safety.hits })
      }

      stmts.push(db.insert(articles).values({
        id,
        title: a.title.trim(),
        summary: typeof a.summary === 'string' ? a.summary : '',
        content,
        template: ['deal', 'guide', 'faq'].includes(a.template) ? a.template : 'default',
        category: a.category,
        tags: normalizeJson(a.tags) ?? '[]',
        status: status === 'published' ? 'published' : 'draft',
        needsReview,
        publishAt,
        expiresAt: a.expiresAt ? String(a.expiresAt) : null,
        links: '[]',
        friendLinks: normalizeJson(a.friendLinks) ?? '[]',
        relatedIds: normalizeJson(a.relatedIds) ?? '[]',
        faq: normalizeJson(a.faq) ?? '[]',
        createdAt: new Date(baseNow + i).toISOString(),
        updatedAt: new Date(baseNow + i).toISOString(),
      }))
      stmts.push(...buildLinkStatements(db, id, Array.isArray(a.links) ? a.links : [], now))
      results.push({ id, ok: true })
    } catch (e: any) {
      results.push({ ok: false, error: e?.message || '校验失败' })
    }
  })

  if (stmts.length > 0) {
    // D1 batch 原子提交；FTS 由 AFTER INSERT 触发器自动同步
    await db.batch(stmts as any)
  }

  // 新文章不影响旧详情缓存，但首页列表缓存 60s 自然过期，无需逐个 purge

  return { ok: true, total: list.length, created: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results, safetyHits }
})

function normalizeJson(v: any): string | null {
  if (v == null || v === '') return '[]'
  if (typeof v === 'string') {
    try { return JSON.stringify(JSON.parse(v)) } catch { return null }
  }
  try { return JSON.stringify(v) } catch { return null }
}
