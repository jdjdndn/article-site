#!/usr/bin/env node
/**
 * D1 备份脚本（每周一次，本地执行，不占线上资源）
 * 用法：node scripts/backup-d1.mjs
 * 输出：E:\code\article-site\backups\article-db-YYYYMMDD.sql
 */
import { execSync } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dir, '..')
const OUT = path.join(ROOT, 'backups')
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const d = new Date()
const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
const file = path.join(OUT, `article-db-${ymd}.sql`)

console.log('导出 D1 →', file)
execSync(`npx wrangler d1 export article-db --remote --output="${file}"`, {
  cwd: ROOT, encoding: 'utf-8', stdio: 'inherit',
})
console.log('备份完成：', file)
