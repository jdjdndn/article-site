import { defineEventHandler, getQuery } from 'h3'
import { desc } from 'drizzle-orm'
import { requireAdmin } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { runLogs } from '../../db/schema'

// GET /api/admin/run-logs?key=&limit=7 —— 定时流水线运行日志
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const q = getQuery(event)
  const limit = Math.min(30, Math.max(1, Number(q.limit) || 7))
  const db = useDb()
  const list = await db
    .select({
      id: runLogs.id,
      runAt: runLogs.runAt,
      model: runLogs.model,
      total: runLogs.total,
      ok: runLogs.ok,
      fail: runLogs.fail,
      error: runLogs.error,
      dryRun: runLogs.dryRun,
    })
    .from(runLogs)
    .orderBy(desc(runLogs.id))
    .limit(limit)
  return { ok: true, list }
})
