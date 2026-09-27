// 构建后追加 Cloudflare Pages 忽略规则到 dist/.assetsignore
// Nitro 每次构建会生成该文件（含 _worker.js），这里以追加方式补 source map 忽略，
// 避免部署时因 .map 文件超限/失败。
import { appendFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ignoreFile = resolve('dist/.assetsignore')
const rule = '**/*.map'

let current = ''
if (existsSync(ignoreFile)) {
  try { current = readFileSync(ignoreFile, 'utf8') } catch { /* 忽略读取失败 */ }
}
if (!current.includes('**/*.map')) {
  appendFileSync(ignoreFile, (current ? '\n' : '') + rule + '\n')
}
console.log('[postbuild] dist/.assetsignore 已追加 source map 忽略规则')
