import { eq, and, sql, asc, inArray } from 'drizzle-orm'
import { links } from '../db/schema'

/**
 * 链接独立表读写工具
 * - 文章行不再存 links JSON（列保留但恒为 '[]'）
 * - 前端渲染、点击统计都以 link_id 为身份，编辑文章时整组重写
 */

export interface LinkInput {
  label?: string
  url: string
  kind?: string
  expiresAt?: string | null
  status?: string
}

// 构造链接整组重写语句（与文章写操作合并进同一 batch 保持原子）
export function buildLinkStatements(db: any, articleId: string, arr: LinkInput[], now: string) {
  if (!Array.isArray(arr)) arr = []
  const del = db.delete(links).where(eq(links.articleId, articleId))
  const ins = arr
    .filter((l) => typeof l?.url === 'string' && l.url.trim())
    .map((l, i) =>
      db.insert(links).values({
        articleId,
        sort: i,
        label: typeof l.label === 'string' ? l.label.trim() : '',
        url: l.url.trim(),
        kind: ['coupon', 'buy', 'more'].includes(l.kind) ? l.kind : inferKind(l.label),
        status: l.status === 'inactive' ? 'inactive' : 'active',
        expiresAt: l.expiresAt ? String(l.expiresAt) : null,
        createdAt: now,
      }),
    )
  return [del, ...ins].filter(Boolean)
}

// 保存整组链接（删除旧 + 插入新，事务）
export async function saveArticleLinks(db: any, articleId: string, arr: LinkInput[], now: string) {
  const stmts = buildLinkStatements(db, articleId, arr, now)
  if (stmts.length) await db.batch(stmts)
  return arr.length
}

// 后台编辑回填：某文章的全部链接（含 inactive / 过期），按 sort
export async function getAllArticleLinks(db: any, articleId: string) {
  return db
    .select({
      id: links.id,
      label: links.label,
      url: links.url,
      kind: links.kind,
      status: links.status,
      expiresAt: links.expiresAt,
    })
    .from(links)
    .where(eq(links.articleId, articleId))
    .orderBy(asc(links.sort))
}

// 读取某文章的有效链接（active 且未过期，按 sort）
export async function getArticleLinks(db: any, articleId: string) {
  return db
    .select({
      id: links.id,
      label: links.label,
      url: links.url,
      kind: links.kind,
      expiresAt: links.expiresAt,
    })
    .from(links)
    .where(and(eq(links.articleId, articleId), eq(links.status, 'active'), sql`(expires_at IS NULL OR datetime(expires_at) > datetime('now'))`))
    .orderBy(asc(links.sort))
}

// 后台链接管理列表（分页，含全部状态；支持按文章/状态过滤）
export async function listLinks(db: any, opts: { offset?: number; limit?: number; status?: string; articleId?: string } = {}) {
  const conds: any[] = []
  if (opts.status && opts.status !== 'all') conds.push(eq(links.status, opts.status))
  if (opts.articleId) conds.push(eq(links.articleId, opts.articleId))
  const where = conds.length ? and(...conds) : undefined
  const list = await db
    .select({
      id: links.id,
      articleId: links.articleId,
      label: links.label,
      url: links.url,
      kind: links.kind,
      status: links.status,
      expiresAt: links.expiresAt,
      createdAt: links.createdAt,
    })
    .from(links)
    .where(where)
    .orderBy(descId())
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0)
  return list
}

// 批量改链接状态/过期（后台勾选操作）
export async function updateLinks(db: any, ids: number[], patch: { status?: string; expiresAt?: string | null }) {
  if (!ids.length) return 0
  const set: any = {}
  if (patch.status) set.status = patch.status
  if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt
  if (!Object.keys(set).length) return 0
  await db.update(links).set(set).where(inArray(links.id, ids))
  return ids.length
}

function inferKind(label?: string): string {
  const l = label || ''
  if (/券|优惠/.test(l)) return 'coupon'
  if (/更多|推荐|好物/.test(l)) return 'more'
  return 'buy'
}

function descId() {
  return sql`id DESC`
}
