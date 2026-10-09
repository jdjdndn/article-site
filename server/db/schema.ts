import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// 文章表（R2+D1 统一架构：元数据存 D1，正文 content/links/friendLinks/faq/relatedIds 存 R2）
export const articles = sqliteTable('articles', {
  id: text('id').primaryKey(),                    // 如 a-20260927-001
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  firstImage: text('first_image'),                 // content 首个 image 块 URL（列表/收藏缩略图免全量拉 content，节约带宽）
  template: text('template').notNull().default('default'), // default / deal（商品带货）/ guide（攻略）/ faq（问答）
  category: text('category').notNull().default(''),
  tags: text('tags').notNull().default('[]'),    // JSON: ["牛奶","中秋"]
  status: text('status').notNull().default('draft'), // draft / published / deleted / expired
  needsReview: integer('needs_review').notNull().default(0), // 1=内容安全命中待人工审核（status 为 draft）
  publishAt: text('publish_at'),               // 定时发布时间（ISO），未到则保持 draft，到点 cron 自动发布
  expiresAt: text('expires_at'),                 // ISO 日期，到期自动置 expired
  siteId: text('site_id').notNull().default(''), // 多站共享 D1 时区分
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  index('idx_articles_category_status').on(t.category, t.status),
  index('idx_articles_status_updated').on(t.status, t.updatedAt),
  index('idx_articles_publish_at').on(t.publishAt),
  index('idx_articles_expires_at').on(t.expiresAt),
  index('idx_articles_site_status').on(t.siteId, t.status),
])

// 收藏（设备指纹免注册）
export const favorites = sqliteTable('favorites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  articleId: text('article_id').notNull(),
  deviceFp: text('device_fp').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('idx_favorites_article_fp').on(t.articleId, t.deviceFp),
  // 唯一约束：同一设备对同一文章只允许一条收藏（favorite API 的 onConflictDoNothing 依赖此约束幂等）
  uniqueIndex('idx_favorites_uniq').on(t.articleId, t.deviceFp),
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
  source: text('source').notNull().default('admin'), // admin=后台/热搜转素材, user=用户投稿
  fp: text('fp').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  index('idx_seeds_status').on(t.status),
  index('idx_seeds_source_fp').on(t.source, t.fp),
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

// 定时流水线运行日志（本机 08:00 脚本每次运行上报；看板最近 7 次）
export const runLogs = sqliteTable('run_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runAt: text('run_at').notNull(),
  model: text('model').notNull().default(''),
  total: integer('total').notNull().default(0),
  ok: integer('ok').notNull().default(0),
  fail: integer('fail').notNull().default(0),
  error: text('error'),
  dryRun: integer('dry_run').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('idx_run_logs_created').on(t.createdAt),
])

export type RunLog = typeof runLogs.$inferSelect

// 通用限频计数表（IP/设备维度滑动窗口；reset_at 过期自动重置 + cron 清理）
// 用于 submit-topic / report 等公开写接口的 IP 兜底（fp 可伪造，IP 维度防批量刷）
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),           // 如 ip:1.2.3.4:submit-topic
  n: integer('n').notNull().default(0),    // 窗口内计数
  resetAt: text('reset_at').notNull(),     // 窗口结束时间（ISO），过期后下一次命中自动重置
}, (t) => [
  index('idx_rate_limits_reset').on(t.resetAt),
])

export type RateLimit = typeof rateLimits.$inferSelect
