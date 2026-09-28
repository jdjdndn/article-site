import { sql } from 'drizzle-orm'
import { useDb } from './db'
import { rateLimits } from '../db/schema'

// 通用滑动窗口限频（D1 upsert 原子自增；窗口过期自动重置）
// key: 如 'ip:1.2.3.4:submit-topic'；windowMs: 窗口毫秒；max: 窗口内上限
// 返回 true=允许，false=超限
export async function rateLimit(key: string, windowMs: number, max: number): Promise<boolean> {
  const db = useDb()
  const resetAt = new Date(Date.now() + windowMs).toISOString()
  const expired = sql`datetime(reset_at) < datetime('now')`
  const row = await db
    .insert(rateLimits)
    .values({ key, n: 1, resetAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        n: sql`CASE WHEN ${expired} THEN 1 ELSE n + 1 END`,
        resetAt: sql`CASE WHEN ${expired} THEN ${resetAt} ELSE reset_at END`,
      },
    })
    .returning({ n: rateLimits.n })
    .catch(() => null) // 并发冲突/表未建等异常 → 放行（限频是兜底不是主闸）
  const n = row?.[0]?.n ?? 0
  return n <= max
}
