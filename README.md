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

## 当前状态（骨架）

- ✅ 项目初始化、Nuxt 4 构建通过（cloudflare_pages preset）
- ✅ Drizzle schema + 迁移（articles / favorites 两表）
- ✅ 首页/详情/后台/关于四页面
- ✅ 列表 API（published 过滤 + 游标分页）、详情 API（含 related 判定）
- ⏳ 待做：管理 API（增删改/回收站）、搜索、FTS5、评论系统接入、GEO 细节、AI 生成管线

## 友链

- jdjdndn.github.io（主站）
- wcbblll.cc（导航站）
