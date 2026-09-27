import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { runLogs } from '../../db/schema'

// POST /api/admin/run-logs?key= —— 本机定时脚本每次运行上报（写日志失败不得阻塞流水线）
// body: { runAt?, total, ok, fail, error?, model?, dryRun? }
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  if (!body || typeof body.total !== 'number') throw createError({ statusCode: 400, statusMessage: 'total 必填' })
  const now = new Date().toISOString()
  const db = useDb()
  await db.insert(runLogs).values({
    runAt: typeof body.runAt === 'string' ? body.runAt : now,
    model: typeof body.model === 'string' ? body.model.slice(0, 50) : '',
    total: Math.max(0, Math.floor(body.total)),
    ok: Math.max(0, Math.floor(Number(body.ok) || 0)),
    fail: Math.max(0, Math.floor(Number(body.fail) || 0)),
    error: typeof body.error === 'string' ? body.error.slice(0, 300) : null,
    dryRun: body.dryRun ? 1 : 0,
    createdAt: now,
  } as any)
  return { ok: true }
})
