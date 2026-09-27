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
