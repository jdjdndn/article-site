import { eq, desc } from 'drizzle-orm'
import { articles, seeds, runLogs } from '../db/schema'
import { checkArticleSafety } from './content-safety'
import { buildLinkStatements } from './links'
import { firstImageOf, safeJson, normalizeJson } from './content'
import { getSiteId, writeArticleContent } from './r2'

/**
 * 定时流水线 / 批量入库共享业务函数。
 *
 * 背景：云端兜底 runDailyGenerate 原先通过公网域名 https://www.wcbblll.cc 调用自身 API，
 * 但 Cloudflare 对 Worker fetch 自身 custom domain 会直接返回 404 空响应（防自调用/循环保护），
 * 导致兜底流水线第一步就失败（500）。因此把内部 HTTP 自调用改为直连 D1 + 复用同一批业务逻辑，
 * 保证与 API 行为完全一致（素材拉取/入池/标记、批量入库含内容安全、运行日志上报）。
 */

export interface PendingSeed {
  id: number
  raw: string
  category: string
  template: string
  status: string
  publishAt: string | null
  expiresAt: string | null
  articleId: string | null
  error: string | null
  source: string
  fp: string
  createdAt: string
  updatedAt: string
}

// GET /api/admin/seeds?status=pending&size=10 同构
export async function fetchPendingSeeds(db: any, size = 10): Promise<PendingSeed[]> {
  return db
    .select({
      id: seeds.id,
      raw: seeds.raw,
      category: seeds.category,
      template: seeds.template,
      status: seeds.status,
      publishAt: seeds.publishAt,
      expiresAt: seeds.expiresAt,
      articleId: seeds.articleId,
      error: seeds.error,
      source: seeds.source,
      fp: seeds.fp,
      createdAt: seeds.createdAt,
      updatedAt: seeds.updatedAt,
    })
    .from(seeds)
    .where(eq(seeds.status, 'pending'))
    .orderBy(desc(seeds.id))
    .limit(size) as any
}

// POST /api/admin/seeds 同构（批量添加素材）
export async function insertSeedsDirect(
  db: any,
  items: Array<{ raw: string; category?: string; template?: string; publishAt?: string | null; expiresAt?: string | null }>,
  source: string,
  bodyCategory?: string,
) {
  const now = new Date().toISOString()
  const SRC = ['admin', 'user', 'ai']
  const rows = (items || [])
    .map((it: any) => {
      const raw = typeof it?.raw === 'string' ? it.raw.trim() : ''
      if (!raw || raw.length < 8) return null
      return {
        raw,
        // 未显式指定分类/模板时存 'auto'，由流水线 AI 自动判断
        category: typeof it.category === 'string' && it.category ? it.category : (bodyCategory || 'auto'),
        template: ['deal', 'guide', 'faq', 'default'].includes(it.template) ? it.template : 'auto',
        publishAt: it.publishAt ? String(it.publishAt) : null,
        expiresAt: it.expiresAt ? String(it.expiresAt) : null,
        status: 'pending',
        source: SRC.includes(source) ? source : 'admin',
        createdAt: now,
        updatedAt: now,
      }
    })
    .filter(Boolean)
  if (!rows.length) return { added: 0 }
  await db.insert(seeds).values(rows as any)
  return { added: rows.length }
}

// POST /api/admin/seeds/:id/done 同构
export async function markSeedDone(db: any, id: number, articleId: string | null) {
  await db.update(seeds).set({
    status: 'done',
    articleId,
    error: null,
    updatedAt: new Date().toISOString(),
  }).where(eq(seeds.id, id))
  return { ok: true }
}

// POST /api/admin/seeds/:id/fail 同构
export async function markSeedFailed(db: any, id: number, error: string) {
  await db.update(seeds).set({
    status: 'failed',
    error: String(error).slice(0, 500),
    updatedAt: new Date().toISOString(),
  }).where(eq(seeds.id, id))
  return { ok: true }
}

// POST /api/admin/run-logs 同构（写日志失败不得阻塞流水线）
export async function insertRunLog(db: any, payload: {
  runAt?: string
  model?: string
  total?: number
  ok?: number
  fail?: number
  error?: string | null
  dryRun?: boolean
}) {
  const now = new Date().toISOString()
  await db.insert(runLogs).values({
    runAt: typeof payload.runAt === 'string' ? payload.runAt : now,
    model: typeof payload.model === 'string' ? payload.model.slice(0, 50) : '',
    total: Math.max(0, Math.floor(Number(payload.total) || 0)),
    ok: Math.max(0, Math.floor(Number(payload.ok) || 0)),
    fail: Math.max(0, Math.floor(Number(payload.fail) || 0)),
    error: typeof payload.error === 'string' ? payload.error.slice(0, 300) : null,
    dryRun: payload.dryRun ? 1 : 0,
    createdAt: now,
  } as any)
  return { ok: true }
}

// —— AI 生成内容兜底净化：剔除占位/测试域名（example.com、test.com 等），双保险 ——
// 提示词已禁止编造链接，但模型仍可能输出占位 URL；入库前统一过滤，宁缺毋滥。
const PLACEHOLDER_URL = /(^|[/.@])(example\.(com|org|net)|test\.com|yourlink\.com|yourdomain\.com|your-url\.com|sample\.com|domain\.com|website\.com|lorem\.ipsum|placeholder\.com)/i

function cleanUrl(u: unknown): string {
  if (typeof u !== 'string') return ''
  const s = u.trim()
  if (!/^https?:\/\//i.test(s)) return ''
  if (PLACEHOLDER_URL.test(s)) return ''
  return s
}

function sanitizeLinks(arr: any): any[] {
  return (Array.isArray(arr) ? arr : [])
    .filter((l) => l && typeof l === 'object' && cleanUrl(l.url))
    .map((l: any) => ({ ...l, url: cleanUrl(l.url) }))
}

function sanitizeContent(contentStr: string): string {
  let parsed: any
  try { parsed = JSON.parse(contentStr) } catch { return contentStr }
  if (!Array.isArray(parsed)) return contentStr
  const out = parsed
    .map((b: any) => {
      if (!b || typeof b !== 'object') return b
      if (b.type === 'ad' && typeof b.link === 'string' && !cleanUrl(b.link)) {
        const { link, ...rest } = b // 占位链接直接去掉，保留软文文案
        return rest
      }
      if ((b.type === 'image' || b.type === 'video') && typeof b.url === 'string' && !cleanUrl(b.url)) return null
      return b
    })
    .filter((b: any) => b !== null)
  return JSON.stringify(out)
}

// POST /api/admin/articles/batch 的语句构造（与 batch.post.ts 同构，含内容安全 + 链接整组重写）
// R2+D1 架构：D1 存元数据，正文 content/friendLinks/faq/relatedIds 存 R2
export function buildArticleStatements(db: any, list: any[]) {
  const baseNow = Date.now()
  const now = new Date(baseNow).toISOString()
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const base = baseNow.toString().slice(-6)
  const siteId = getSiteId()

  const stmts: any[] = []
  const r2Writes: Array<{ id: string; data: any }> = []
  const results: Array<{ id?: string; ok: boolean; error?: string }> = []
  const safetyHits: Array<{ id: string; hits: any[] }> = []

  list.forEach((a: any, i: number) => {
    try {
      if (!a || typeof a.title !== 'string' || !a.title.trim()) throw new Error('标题必填')
      if (!a.category) throw new Error('分类必填')
      const norm = normalizeJson(a.content)
      if (norm === null) throw new Error('content 必须是合法 JSON（段落数组）')
      const content = sanitizeContent(norm)
      const cleanLinks = sanitizeLinks(a.links)
      const id = `a-${ymd}-${base}${String(i).padStart(2, '0')}`
      const publishAt = a.publishAt ? String(a.publishAt) : null
      let status = a.status === 'published' ? 'published' : 'draft'
      if (publishAt && publishAt > now) status = 'draft'

      // 内容安全兜底：命中违规词 → 强制草稿待人工审核（净化后的内容/链接参与校验）
      const safety = checkArticleSafety({
        title: a.title, summary: a.summary, content,
        faq: a.faq, tags: a.tags, links: cleanLinks, friendLinks: a.friendLinks,
      })
      const needsReview = safety.hits.length > 0 && status === 'published' ? 1 : 0
      if (safety.hits.length > 0 && status === 'published') {
        status = 'draft'
        safetyHits.push({ id, hits: safety.hits })
      }

      // D1：元数据 only（content/friendLinks/faq/relatedIds 存 R2）
      stmts.push(db.insert(articles).values({
        id,
        title: a.title.trim(),
        summary: typeof a.summary === 'string' ? a.summary : '',
        firstImage: firstImageOf(safeJson(content)) || '',
        template: ['deal', 'guide', 'faq'].includes(a.template) ? a.template : 'default',
        category: a.category,
        tags: normalizeJson(a.tags) ?? '[]',
        status: status === 'published' ? 'published' : 'draft',
        needsReview,
        publishAt,
        expiresAt: a.expiresAt ? String(a.expiresAt) : null,
        siteId,
        createdAt: new Date(baseNow + i).toISOString(),
        updatedAt: new Date(baseNow + i).toISOString(),
      }))
      stmts.push(...buildLinkStatements(db, id, cleanLinks, now))
      // R2：正文数据
      r2Writes.push({
        id,
        data: {
          content,
          friendLinks: normalizeJson(a.friendLinks) ?? '[]',
          faq: normalizeJson(a.faq) ?? '[]',
          relatedIds: normalizeJson(a.relatedIds) ?? '[]',
        },
      })
      results.push({ id, ok: true })
    } catch (e: any) {
      results.push({ ok: false, error: e?.message || '校验失败' })
    }
  })

  return { stmts, r2Writes, results, safetyHits }
}

// 批量入库并提交（返回与 API 同构的结果）
// D1 batch 原子提交 + R2 正文写入
export async function batchCreateArticlesDirect(db: any, list: any[]) {
  const { stmts, r2Writes, results, safetyHits } = buildArticleStatements(db, list)
  if (stmts.length > 0) {
    // D1 batch 原子提交；FTS 由 AFTER INSERT 触发器自动同步
    await db.batch(stmts as any)
  }
  // R2 正文写入（D1 成功后；失败不阻塞，R2 最终一致性由读取兜底处理）
  await Promise.all(
    r2Writes.map((w) => writeArticleContent(w.id, w.data).catch(() => {})),
  )
  return {
    ok: true,
    total: list.length,
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    safetyHits,
  }
}
