// AI 工具函数 — 复用 auto-ai-article 库（npm file:../auto-ai-article）
// extractJson 从库 re-export；本地脚本与云端 server 共用同一实现，修改只改库。
// 用 ESM import 而非 createRequire：Workers 运行时无 node:module，createRequire 会被 nitro 转成
// 运行时 require 桩（unenv "module.require is not implemented"）导致 Worker 初始化失败。

import { extractJson } from 'ai-article-pipeline'

export { extractJson }
