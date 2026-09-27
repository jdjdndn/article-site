import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// 文章表（v14 计划数据模型）
// content/links/tags 等 JSON 字段以字符串存储（D1/SQLite 无原生 JSON 列）
export const articles = sqliteTable('articles', {
  id: text('id').primaryKey(),                    // 如 a-20260927-001
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  content: text('content').notNull(),            // JSON 块数组，块类型见前台渲染：text/h2/list/price/quote/ad/image
  template: text('template').notNull().default('default'), // default / deal（商品带货）/ guide（攻略）/ faq（问答）
  category: text('category').notNull().default(''),
  tags: text('tags').notNull().default('[]'),    // JSON: ["牛奶","中秋"]
  status: text('status').notNull().default('draft'), // draft / published / deleted / expired
  needsReview: integer('needs_review').notNull().default(0), // 1=内容安全命中待人工审核（status 为 draft）
  publishAt: text('publish_at'),               // 定时发布时间（ISO），未到则保持 draft，到点 cron 自动发布
  expiresAt: text('expires_at'),                 // ISO 日期，到期自动置 expired
  links: text('links').notNull().default('[]'),  // JSON: [{label, url}]
  friendLinks: text('friend_links').notNull().default('[]'), // JSON: [{name, url}]
  relatedIds: text('related_ids').notNull().default('[]'),   // JSON: ["a-xxx"]
  faq: text('faq').notNull().default('[]'),      // JSON: [{q, a}]
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  index('idx_articles_category_status').on(t.category, t.status),
  index('idx_articles_status_updated').on(t.status, t.updatedAt),
  index('idx_articles_publish_at').on(t.publishAt),
  index('idx_articles_expires_at').on(t.expiresAt),
])

// 收藏（设备指纹免注册）
export const favorites = sqliteTable('favorites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  articleId: text('article_id').notNull(),
  deviceFp: text('device_fp').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('idx_favorites_article_fp').on(t.articleId, t.deviceFp),
])

export type Article = typeof articles.$inferSelect
export type Favorite = typeof favorites.$inferSelect

// 链接独立表（文章-链接一对多；链接级过期自动隐身 + 点击统计挂 link_id）
export const links = sqliteTable('links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  articleId: text('article_id').notNull(),
  sort: integer('sort').notNull().default(0),
  label: text('label').notNull().default(''),
  url: text('url').notNull(),
  kind: text('kind').notNull().default('buy'), // coupon(领券) / buy(抢购) / more(更多)
  status: text('status').notNull().default('active'), // active / inactive（后台批量停用）
  expiresAt: text('expires_at'),                 // 到期自动隐身（展示层过滤），不做巡检
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('idx_links_article').on(t.articleId, t.sort),
  index('idx_links_expires').on(t.expiresAt),
])

// 点击日志（异步上报，单表 + created_at 索引，cron 定期清理 90 天前）
export const clickLogs = sqliteTable('click_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  articleId: text('article_id'),
  linkId: integer('link_id'),
  domain: text('domain'),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('idx_click_created').on(t.createdAt),
])

export type Link = typeof links.$inferSelect
export type ClickLog = typeof clickLogs.$inferSelect

// 素材池（定时 AI 流水线原料，云端可管理；本机脚本每天拉 pending 处理）
export const seeds = sqliteTable('seeds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  raw: text('raw').notNull(),
  category: text('category').notNull().default('优惠'),
  template: text('template').notNull().default('deal'),
  status: text('status').notNull().default('pending'), // pending / done / failed
  publishAt: text('publish_at'),
  expiresAt: text('expires_at'),
  articleId: text('article_id'),
  error: text('error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  index('idx_seeds_status').on(t.status),
])

export type Seed = typeof seeds.$inferSelect

// 搜索词日志（内容方向反哺；cron 定期清理 90 天前）
export const searchLogs = sqliteTable('search_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  q: text('q').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('idx_search_created').on(t.createdAt),
])

export type SearchLog = typeof searchLogs.$inferSelect

// 文章纠错反馈（用户举报信息有误/失效；后台可查看标记处理）
export const reports = sqliteTable('reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  articleId: text('article_id').notNull(),
  fp: text('fp').notNull().default(''),
  content: text('content').notNull(),
  status: text('status').notNull().default('open'), // open / done
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  index('idx_reports_status').on(t.status),
])

export type Report = typeof reports.$inferSelect
