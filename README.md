# AI 文章站（article-site）

基于 Nuxt 3/4 + Cloudflare D1 的 AI 文章站骨架（对应 `E:\code\github.io\PLAN-ai-article-pipeline.md` v14 计划）。

## 技术栈（全开源）

- **前端**：Nuxt 3/4（SSG/SEO/GEO 内置）、Vue 3
- **后端**：Nitro（Hono 同源）server API，同域 `/api/*`
- **数据库**：Cloudflare D1 + Drizzle ORM（迁移管理）
- **校验**：zod（后续接入）
- **评论**：开源系统 Artalk / Waline / Twikoo（后续接入）

## 目录结构

```
article-site/
├── app/                     # Nuxt 前端（Nuxt 4 结构）
│   ├── app.vue              # 布局（导航/页脚/友链）
│   ├── assets/css/main.css  # 全局样式
│   └── pages/               # 页面
│       ├── index.vue        # 首页（分类 tab + 列表 + 分页）
│       ├── article/[id].vue # 详情（正文/ad软文/链接/相关/友链）
│       ├── admin.vue        # 后台（?key= 校验 + 新建表单占位）
│       └── about.vue        # 关于
├── server/                  # Nitro 后端
│   ├── api/articles/        # 列表（游标分页）、详情（含 related）
│   ├── db/schema.ts         # Drizzle schema（articles/favorites）
│   └── utils/db.ts          # D1 连接（process.env.DB）
├── drizzle/                 # Drizzle 迁移文件
├── drizzle.config.ts        # Drizzle 配置
├── nuxt.config.ts           # cloudflare_pages preset + runtimeConfig
└── wrangler.toml            # Cloudflare 配置（D1 绑定）
```

## 本地开发

```bash
npm install
npm run dev        # http://localhost:3000
```

> 注意：本地 dev 时 API 需要 D1 binding。没有 binding 时页面可看、`/api/*` 返回 500（预期）。
> 本地带 D1 预览：`npx wrangler pages dev dist --d1 DB`（先 build）。

## 数据库（D1 + Drizzle）

```bash
npx wrangler login
npx wrangler d1 create article-db      # 把输出的 database_id 填到 wrangler.toml

# 改 schema 后生成迁移
npx drizzle-kit generate
# 应用迁移（远程）
npx wrangler d1 migrations apply article-db --remote
# 应用迁移（本地预览）
npx wrangler d1 migrations apply article-db --local
```

## 部署（Cloudflare Pages）

```bash
npm run build        # 输出 dist/（worker + 静态）
npx wrangler pages deploy dist --project-name article-site
```

或 **GitHub 自动部署**（推荐）：
1. push 到 GitHub 仓库
2. Cloudflare 控制台 → Workers & Pages → 创建 → Pages → 连接 Git 仓库
3. 构建命令：`npm run build`；输出目录：`dist`
4. 自定义域绑定（如 article.wcbblll.cc）

**环境变量**（Pages → Settings → 环境变量）：
- `MANAGE_KEY`：管理后台密钥（/admin?key=xxx）
- D1 绑定：Settings → Functions → 绑定 `article-db`

## 评论（开源系统）

前端已接入通用组件 `app/components/ArticleComments.client.vue`，支持三种开源评论系统（按需动态加载，只打包用到的）：

| 系统 | 部署 | 环境变量 |
|------|------|---------|
| **Artalk**（默认） | 自托管 Go 单文件（artalk 官网一键部署 / docker） | `NUXT_PUBLIC_COMMENT_PROVIDER=artalk` + `NUXT_PUBLIC_COMMENT_SERVER=https://评论域名` |
| **Waline** | Vercel / Cloudflare Workers | `NUXT_PUBLIC_COMMENT_PROVIDER=waline` + `NUXT_PUBLIC_COMMENT_SERVER=https://...` |
| **Twikoo** | 云函数 / 自托管 | `NUXT_PUBLIC_COMMENT_PROVIDER=twikoo` + `NUXT_PUBLIC_COMMENT_SERVER=envId` |

- 评论数据存评论系统自身数据库，**不占 D1**
- 先审后发 / 反垃圾（Akismet）/ 敏感词 / 举报删除由评论系统自带（PLAN 6.3）

## 当前状态

- ✅ 项目初始化、Nuxt 4 构建通过（cloudflare_pages preset，dist/ + .assetsignore）
- ✅ Drizzle schema + 迁移（articles / favorites 两表）
- ✅ 首页/详情/后台/关于四页面；首页搜索框（?q= URL 同步）
- ✅ 前台 API：列表（游标分页）、详情（含 related 判定）、**FTS5 全文搜索**（trigram，长词 MATCH / 短词 LIKE 兜底）、**收藏**（设备指纹）
- ✅ 管理 API：新增/列表/详情/修改/**软删**/回收站/**恢复**/**真删**（全部鉴权，无 key 401）
- ✅ GEO：详情页 JSON-LD（Article + FAQPage）、首页 WebSite JSON-LD、robots.txt 放行 AI 爬虫（GPTBot/ClaudeBot/PerplexityBot/Bytespider/CCBot）、sitemap.xml 基础版
- ✅ **评论接入**：开源系统通用组件（Artalk/Waline/Twikoo，环境变量切换，动态按需加载）
- ⏳ 待做：评论系统后端部署、管理后台美化、AI 生成管线（开源网关+去味）、文章 sitemap 增量生成（cron）

## 搜索（FTS5）

- 全文索引 `articles_fts`（trigram 分词，中文子串匹配）在首次调用搜索时**自动创建**（ensureFts，含触发器同步 + 存量回填，幂等）
- 关键词 ≥3 字走 `MATCH`（bm25 排序）；<3 字（如"牛奶"）降级 LIKE 兜底
- 搜索仅命中 published 且未过期文章（排除 deleted/expired）

## 收藏（设备指纹免注册）

- `POST /api/articles/:id/favorite`（body: fp + action add/remove，唯一约束幂等）
- `GET /api/favorites?fp=xxx` 收藏列表
- 详情页返回 `favoriteCount` / `favorited`（?fp= 可选）

## 友链

- jdjdndn.github.io（主站）
- wcbblll.cc（导航站）
