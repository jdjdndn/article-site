import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../db/schema'

let _db: ReturnType<typeof drizzle> | null = null
let _ftsReady = false

// 访问 Cloudflare D1 绑定（部署后 Pages 注入 process.env.DB）
// 本地 wrangler pages dev 也会注入（--local D1）
export function useDb() {
  if (_db) return _db
  const binding = (process.env as any).DB
  if (!binding) {
    throw new Error('D1 binding not found: 请配置 wrangler.toml 的 database_id，或本地用 wrangler pages dev')
  }
  _db = drizzle(binding, { schema })
  return _db
}

// FTS5 全文索引（懒初始化，幂等）：
// - articles_fts 虚拟表（trigram 分词，中文可子串匹配）
// - 三个触发器同步增删改（IF NOT EXISTS，避免重复创建）
// - 存量回填为差量（只插入缺的 rowid，文章量大时冷启动不重建全表）
// 注意：D1 的 FTS5 不支持 'delete' 命令语法，独立表删除必须用 DELETE WHERE rowid
export async function ensureFts() {
  const db = useDb()
  if (_ftsReady) return
  await db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
      title, summary, content, category,
      tokenize = 'trigram'
    );
    CREATE TRIGGER IF NOT EXISTS articles_fts_ai AFTER INSERT ON articles BEGIN
      INSERT INTO articles_fts(rowid, title, summary, content, category)
      VALUES (new.rowid, new.title, new.summary, new.content, new.category);
    END;
    CREATE TRIGGER IF NOT EXISTS articles_fts_ad AFTER DELETE ON articles BEGIN
      DELETE FROM articles_fts WHERE rowid = old.rowid;
    END;
    CREATE TRIGGER IF NOT EXISTS articles_fts_au AFTER UPDATE ON articles BEGIN
      DELETE FROM articles_fts WHERE rowid = old.rowid;
      INSERT INTO articles_fts(rowid, title, summary, content, category)
      VALUES (new.rowid, new.title, new.summary, new.content, new.category);
    END;
  `)
  // 差量回填：只补 articles 有而 fts 缺的 rowid（新文章/上次未回填部分）
  await db.run(`
    INSERT INTO articles_fts(rowid, title, summary, content, category)
    SELECT a.rowid, a.title, a.summary, a.content, a.category
    FROM articles a
    LEFT JOIN articles_fts f ON f.rowid = a.rowid
    WHERE f.rowid IS NULL;
  `)
  _ftsReady = true
}

export { schema }
