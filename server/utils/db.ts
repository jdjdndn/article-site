import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../db/schema'

let _db: ReturnType<typeof drizzle> | null = null

// 访问 Cloudflare D1 绑定（部署后 Pages 注入 process.env.DB）
// 本地 wrangler pages dev 也会注入（--local D1）
export function useDb() {
  if (_db) return _db
  const binding = (process.env as any).DB
  if (!binding) {
    throw new Error('D1 binding not found: 请配置 wrangler.toml 的 database_id，或本地用 wrangler pages dev')
  }
  _db = drizzle(binding, { schema })
  return _db
}

export { schema }
