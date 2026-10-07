// AI 工具函数 — 复用 auto-ai-article 库（npm file:../auto-ai-article）
// extractJson 从库 re-export；本地脚本与云端 server 共用同一实现，修改只改库。

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { extractJson } = require('ai-article-pipeline')

export { extractJson }
