#!/usr/bin/env node
/**
 * 一次性迁移：articles.links JSON → links 独立表
 * 用法：node scripts/migrate-links.mjs
 * 步骤：查远程 D1 → 拆 JSON → 生成 INSERT SQL → 执行 → 清空 articles.links 列
 */
import { execSync } from 'node:child_process'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dir, '..')

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
}

// 1. 拉取所有带 links 的文章
const out = run('npx wrangler d1 execute article-db --remote --json --command "SELECT id, links FROM articles WHERE links IS NOT NULL AND links != \'[]\'"')
let rows = []
try {
  const parsed = JSON.parse(out)
  rows = Array.isArray(parsed) && parsed[0]?.results ? parsed[0].results : parsed
} catch {
  rows = JSON.parse(out.replace(/^.*\[/s, '[').replace(/\][^]*$/s, ']'))
}

console.log(`待迁移文章 ${rows.length} 篇`)

// 2. 拆 JSON → SQL
const now = new Date().toISOString()
let inserts = 0
const parts = []
const articleIds = []
for (const r of rows) {
  let arr = []
  try { arr = JSON.parse(r.links) } catch { continue }
  if (!Array.isArray(arr) || !arr.length) continue
  articleIds.push(r.id)
  const vals = arr.map((l, i) => {
    const url = typeof l?.url === 'string' ? l.url : ''
    if (!url) return null
    const label = (typeof l?.label === 'string' ? l.label : '').trim()
    const kind = /券|优惠/.test(label) ? 'coupon' : /更多|推荐|好物/.test(label) ? 'more' : 'buy'
    const esc = (s) => s.replace(/'/g, "''")
    return `('${esc(r.id)}',${i},'${esc(label)}','${esc(url)}','${kind}','active',NULL,'${now}')`
  }).filter(Boolean)
  if (vals.length) {
    inserts += vals.length
    parts.push(`INSERT INTO links (article_id, sort, label, url, kind, status, expires_at, created_at) VALUES ${vals.join(',')};`)
  }
}

if (!parts.length) { console.log('无链接可迁移'); process.exit(0) }

// 3. 写 SQL 并执行
const sqlFile = path.join(ROOT, 'tmp_migrate_links.sql')
writeFileSync(sqlFile, parts.join('\n'), 'utf-8')
const exec = run(`npx wrangler d1 execute article-db --remote --file "${sqlFile}"`)
console.log(`已插入 ${inserts} 条链接（涉及 ${articleIds.length} 篇文章）`)

// 4. 清空 articles.links 列（保留列避免 DDL 重建表，前端/API 已切换）
const clear = articleIds.map((id) => `'${id}'`).join(',')
const sql2 = `UPDATE articles SET links = '[]', updated_at = '${now}' WHERE id IN (${clear});`
const sqlFile2 = path.join(ROOT, 'tmp_migrate_clear.sql')
writeFileSync(sqlFile2, sql2, 'utf-8')
run(`npx wrangler d1 execute article-db --remote --file "${sqlFile2}"`)
console.log('已清空文章 links 列')

unlinkSync(sqlFile); unlinkSync(sqlFile2)
console.log('迁移完成')
