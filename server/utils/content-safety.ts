// 内容安全审核 — 复用 auto-ai-article 库（npm file:../auto-ai-article）
// 库内置规则与原实现一致（porn/gambling/drug/fraud/weapon/illegal-trade/minor 七类）；
// 仅用于内容合规兜底，不替代人工审核；后台仍可强制发布。
export { checkArticleSafety, scanText } from 'ai-article-pipeline'
export type { SafetyHit, SafetyResult } from 'ai-article-pipeline'
