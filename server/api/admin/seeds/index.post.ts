import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { seeds } from '../../../db/schema'

// POST /api/admin/seeds（Bearer 鉴权） —— 批量添加素材
// body: { items: [{raw, category?, template?, publishAt?, expiresAt?, source?}], category?, template?, source? }
// source: admin(后台/热搜转素材) / user(用户投稿) / ai(AI 自动选题)
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  const items = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : null
  if (!items || !items.length) throw createError({ statusCode: 400, statusMessage: 'items 数组必填' })
  if (items.length > 200) throw createError({ statusCode: 400, statusMessage: '单次最多 200 条' })

  const now = new Date().toISOString()
  const db = useDb()
  const rows = items
    .map((it: any) => {
      const raw = typeof it?.raw === 'string' ? it.raw.trim() : ''
      if (!raw || raw.length < 8) return null
      const SRC = ['admin', 'user', 'ai']
      return {
        raw,
        // 未显式指定分类/模板时存 'auto'，由定时流水线 AI 自动判断
        category: typeof it.category === 'string' && it.category ? it.category : (body?.category || 'auto'),
        template: ['deal', 'guide', 'faq', 'default'].includes(it.template) ? it.template : 'auto',
        publishAt: it.publishAt ? String(it.publishAt) : null,
        expiresAt: it.expiresAt ? String(it.expiresAt) : null,
        status: 'pending',
        source: SRC.includes(it.source) ? it.source : (SRC.includes(body?.source) ? body.source : 'admin'),
        createdAt: now,
        updatedAt: now,
      }
    })
    .filter(Boolean)

  if (!rows.length) throw createError({ statusCode: 400, statusMessage: '没有有效素材（每条至少 8 个字符）' })
  await db.insert(seeds).values(rows as any)
  return { ok: true, added: rows.length }
})
