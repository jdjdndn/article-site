-- article-site 独立 D1 schema（R2+D1 统一架构）
-- D1 存元数据，正文 content/friendLinks/faq/relatedIds 存 R2
-- Key 格式: {siteId}/{articleId}.json

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  first_image TEXT,
  template TEXT NOT NULL DEFAULT 'default',
  category TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  needs_review INTEGER NOT NULL DEFAULT 0,
  publish_at TEXT,
  expires_at TEXT,
  site_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_category_status ON articles(category, status);
CREATE INDEX IF NOT EXISTS idx_articles_status_updated ON articles(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_articles_publish_at ON articles(publish_at);
CREATE INDEX IF NOT EXISTS idx_articles_expires_at ON articles(expires_at);
CREATE INDEX IF NOT EXISTS idx_articles_site_status ON articles(site_id, status);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  device_fp TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_favorites_article_fp ON favorites(article_id, device_fp);
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_uniq ON favorites(article_id, device_fp);

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'buy',
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_article ON links(article_id, sort);
CREATE INDEX IF NOT EXISTS idx_links_expires ON links(expires_at);

CREATE TABLE IF NOT EXISTS click_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT,
  link_id INTEGER,
  domain TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_click_created ON click_logs(created_at);

CREATE TABLE IF NOT EXISTS seeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '优惠',
  template TEXT NOT NULL DEFAULT 'deal',
  status TEXT NOT NULL DEFAULT 'pending',
  publish_at TEXT,
  expires_at TEXT,
  article_id TEXT,
  error TEXT,
  source TEXT NOT NULL DEFAULT 'admin',
  fp TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seeds_status ON seeds(status);
CREATE INDEX IF NOT EXISTS idx_seeds_source_fp ON seeds(source, fp);

CREATE TABLE IF NOT EXISTS search_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  q TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_created ON search_logs(created_at);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  fp TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

CREATE TABLE IF NOT EXISTS run_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 0,
  fail INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  dry_run INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_logs_created ON run_logs(created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);
