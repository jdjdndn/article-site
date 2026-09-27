# AI 文章站（article-site）

基于 **Nuxt 4 + Nitro + Cloudflare D1/Workers** 的 AI 文章站，已部署上线：**https://www.wcbblll.cc**

免费 AI 录入（DeepSeek/豆包/Kimi 等网页版）→ 去 AI 味 + 结构化 → 后台预览确认 → 入库 → 前台展示（SEO/GEO 优化）。

---

## 一、文章模板与内容结构（怎么用）

文章由 **模板（版式）+ 内容块（JSON 数组）+ 元数据** 组成。

### 1. 模板（template 字段，后台表单可选）

| 模板 | 值 | 适用 | 布局差异 |
|---|---|---|---|
| 通用 | `default` | 普通文章 | 链接按钮在正文后 |
| 好物带货 | `deal` | 商品/优惠文 | **购买按钮置顶**，价格卡/FAQ 在后 |
| 攻略 | `guide` | 教程/步骤文 | 小标题分段流式 |
| 问答 | `faq` | 答疑文 | **FAQ 折叠置顶** |

### 2. 内容块（content 字段的 JSON 数组，type 决定渲染样式）

| type | 渲染效果 | 字段 |
|---|---|---|
| `text` | 普通段落 | text |
| `h2` | 小标题（下划线分隔） | text |
| `list` | 要点列表（项目符号） | items: string[] |
| `price` | 价格卡：大号红价 + 划线原价 + 规格 | price, original?, spec? |
| `quote` | 提示框：warn 红框（时效提醒）/ info 蓝框 | text, tone: "warn"\|"info" |
| `ad` | 软文块（黄底虚线框） | label, text, link? |
| `image` | 图片（懒加载） | url, alt? |

### 3. 完整示例（deal 模板带货文）

```json
{
  "template": "deal",
  "title": "蒙牛特仑苏低脂牛奶 250ml×16盒 券后44.9元",
  "summary": "特仑苏限定牧场，3.6g乳蛋白，120mg高钙，健身减脂也能喝",
  "category": "好物",
  "status": "published",
  "expiresAt": "2026-12-31",
  "content": [
    { "type": "price", "price": "44.9", "original": "69.9", "spec": "250ml×16盒 领券直降" },
    { "type": "text", "text": "特仑苏限定牧场，3.6g乳蛋白，120mg高钙。" },
    { "type": "list", "items": ["低脂配方健身也能喝", "礼盒装适合中秋送礼"] },
    { "type": "quote", "tone": "warn", "text": "价格与库存可能随时变化，以页面显示为准" },
    { "type": "ad", "label": "推荐", "text": "这款是爆款，买的人很多", "link": "https://u.jd.com/..." }
  ],
  "links": [
    { "label": "领券", "url": "https://u.jd.com/..." },
    { "label": "抢购", "url": "https://u.jd.com/..." }
  ],
  "tags": ["牛奶", "特仑苏", "中秋送礼"],
  "faq": [
    { "q": "是低脂的吗？", "a": "是，健身减脂也能喝。" },
    { "q": "券后多少钱？", "a": "领券直降后 44.9 元。" }
  ],
  "relatedIds": [],
  "friendLinks": []
}
```

其他字段说明：

| 字段 | 说明 |
|---|---|
| `expiresAt` | 过期日期（`YYYY-MM-DD`），到期前台自动显示"已过期"并降权（cron 每分钟顺带标记 expired） |
| `status` | `draft` 草稿 / `published` 发布（软删后进回收站） |
| `publishAt` | **定时发布时间**（ISO 格式，后台用"定时发布"输入框）：填了未来时间 → 自动进草稿，到点 cron 每分钟自动转发布；不填则按状态选择立即生效 |
| `relatedIds` | 相关文章 id 数组（同分类自动推荐，也可手动指定） |
| `friendLinks` | 文章级友链；不填时前台显示默认友链 |

---

## 二、后台录入流程（日常操作）

后台地址：`https://www.wcbblll.cc/admin?key=你的管理密钥`

### 手动录入

1. 新建文章 → 填标题/摘要/分类/模板/过期时间
2. 正文等 JSON 字段可粘贴原始数据（京东/淘宝/拼多多文案都行）
3. **🧹 格式化全部 JSON**：一键排版；非法 JSON 会红框标出
4. **👁 预览效果**：不落库预览（与前台渲染一致），满意再点保存
5. 保存后回列表，点标题可看线上效果

> **发布规则**（手动/自动发文章一致）：状态默认「发布」——**不填定时发布 → 保存立即上线**；填了未来时间 → 自动进草稿，到点 cron 发布；想暂不上线就选「草稿」。

### AI 完善录入（推荐，处理"好有坏"的原始数据）

前置：本机已启动免费 AI 网关（见第三节）。

1. 新建文章 → **先选好模板**（deal/guide/faq/default）→ 把原始素材粘进表单（标题/正文随便填，AI 会重写）
2. 点 **✨ AI 完善** → 选模型（deepseek-chat 等）→ 开始完善
3. AI 自动完成：**去 AI 味**（口语化、删套话）+ 信息完善（突出价格/规格/卖点）+ **按所选模板自动生成结构块**：

   | 模板 | AI 自动产出的块 |
   |---|---|
   | deal 好物带货 | price 价格卡 + list 卖点 + quote warn 时效提示 + 2~3 段 text + ad 软文 |
   | guide 攻略 | ≥2 个 h2 小标题 + text 段落 + list 要点 |
   | faq 问答 | text 段落 + ≥3 条 FAQ |
   | default 通用 | text 为主，可含 h2/list/ad |

4. 预览核对（价格/链接/时效提示是否正确）→ 保存

### 批量录入（AI 批量流水线）

后台列表页点 **「⿇ 批量录入」**，一次贴入多条原始文案批量成文：

1. **粘贴**：多条京东/淘宝/拼多多文案或「——标题——」分组，素材之间用空行分隔（支持直接粘贴长文本，自动切分）
2. **① 切分素材**：按空行 / 分隔线切分并过滤过短片段，逐条卡片显示
3. **② AI 批量生成**：逐条调用本地网关，按所选模板（deal/guide/faq/default）去 AI 味 + 结构化（可单条重试）
4. **③ 批量入库**：勾选已完成条目 → `POST /api/admin/articles/batch` 一次提交（D1 batch 原子写入）

> 批量面板可指定模板/分类/模型/**定时发布**（可选，datetime-local：填了未来时间自动进草稿，到点 cron 发布，与手动单篇定时同一机制，互不冲突）；入库后回列表可逐条编辑。AI 生成结果命中内容安全规则会自动转草稿（见下）。

### 定时 AI 流水线（每天自动产文入库）

不想手动点后台时，用 **Windows 定时任务 + 本地 AI 网关** 自动消化素材：

1. **放素材**：把原始文案写进 `E:\code\article-site\scheduled-seeds.json`：

   ```json
   [
     { "raw": "蒙牛特仑苏低脂牛奶 250ml×16盒 44.9元 领券直降…",
       "category": "好物", "template": "deal",
       "publishAt": "2026-09-30T08:00:00.000Z",  // 可选：未来时间=定时草稿；缺省=立即发布
       "expiresAt": "2026-12-31" }
   ]
   ```

   `raw` 必填（京东/淘宝/拼多多文案、链接都行），`category`/`template`/`publishAt`/`expiresAt` 可选。

2. **已注册定时任务**：`ArticleSite-AIGenerate`（Windows 任务计划）**每天 08:00** 自动运行 `node scripts/scheduled-generate.mjs`——逐条调本地网关去 AI 味+结构化 → 线上批量入库 → 内容安全命中自动转待审 → **成功后素材自动从文件移除**（失败条目保留，日志见控制台/任务历史）。

3. 手动跑一次 / 换模型 / 只生成不入库：

   ```powershell
   node scripts/scheduled-generate.mjs                # 默认 deepseek-chat
   node scripts/scheduled-generate.mjs --model kimi   # 换模型（网关 webauth 过即可用）
   node scripts/scheduled-generate.mjs --dry-run      # 只生成，不入库不消费素材
   ```

4. 改时间：`schtasks /Change /TN ArticleSite-AIGenerate /ST 09:30`（或任务计划程序图形界面）。网关没启动时脚本会失败，素材保留等下次。

### 内容安全审核（先审后发）

发布（手动/批量/定时）时对 **标题+摘要+正文** 做违规词扫描（`server/utils/content-safety.ts`，覆盖色情/赌博/毒品/诈骗引流/暴恐武器/违禁交易/未成年相关等通用类别）：

- **命中即强制转草稿**（`draft`）+ 打 **待审标记**（`needs_review=1`），前台不可见
- 后台「**待审（N）**」tab 集中列出命中文章（列表行有 🟡 待审徽标），操作：
  - **通过并发布**：清除待审标记并立即 `published`
  - **通过留草稿**：清除标记、保持草稿，方便先改再发
  - **编辑**：跳转表单修改后保存（保存仍会重新扫描，再命中会再次待审）
  - **删除**：软删进回收站
- 词库为纯 JS 内置，无外部依赖，增删改 `content-safety.ts` 里的 `RULES` 即可；词库仅作合规兜底，不替代人工判断

### 定时发布

后台表单勾选"定时发布"（datetime-local）→ 保存时自动转 ISO 存 `publish_at`：

- 填了**未来时间** → 状态强制 `draft`（列表显示 ⏱ 徽标），前台不可见
- **到点后** Cloudflare Cron Trigger（每 5 分钟，`wrangler.jsonc` 的 `triggers.crons` = `*/5 * * * *`）触发 `scheduled` 事件 → `server/plugins/publish-on-schedule.ts` 自动转 `published`，前台可见（发布/过期误差 ≤5 分钟）
- 已发布的文章 `expires_at` 到期后同样由该 cron 自动标记 `expired`

> 实现说明：没用 Nitro 的 `scheduledTasks`（在 cloudflare_module preset 下未生效，任务不会被打包），改为插件挂 `cloudflare:scheduled` hook，逻辑等价且幂等。cron 配置在 `wrangler.jsonc` 的 `triggers.crons`。

### 链接体系（独立表 + 自动过期 + 点击统计）

文章-链接一对多，`links` 表存储（`article_id/sort/label/url/kind/status/expires_at`）：

- **分组**：`kind` = coupon(领券) / buy(抢购) / more(更多)——前台 coupon+buy 常显，more 收进"更多好物"折叠
- **自动过期**：`expires_at` 到期链接前台**自动隐藏**（展示层过滤，无需人工处理）；后台"链接管理"可勾选批量停用/启用/批量设过期日期（涉及文章缓存自动 purge）
- **点击统计**：链接点击 `sendBeacon` 异步上报 `/api/track/click`（不拦截跳转、不改链接地址）→ `click_logs` 表，cron 每 5 分钟清理 90 天前数据
- 文章 JSON 里不再存 links（列保留但恒为 `[]`），迁移脚本 `scripts/migrate-links.mjs`（一次性，已执行）

### 缓存与 SEO（资源节约核心）

- **边缘缓存分层**（`nuxt.config.ts` routeRules）：首页/列表 60s、详情页 300s、about/sitemap 1h；后台/API 全 `no-store`；后台页 `X-Robots-Tag: noindex`
- 后台保存/删除/通过/批量链接操作时 **Cache API 定点 purge** 详情页+首页，失败最多延迟对应 TTL
- `robots.txt`（Disallow /admin /api /track）+ 动态 `sitemap.xml`（仅 published 未过期，边缘缓存 1h）
- 自定义 `error.vue`：404 兜底 + 详情接口对 expired/deleted 返回 `status:'gone'` + 相关推荐（下架页 noindex，回收流量）
- 相关文章自动推荐：related_ids 优先 → 同分类兜底（SSR 一次查询，缓存命中为零）

### 收藏

详情页「☆ 收藏」（设备指纹免注册）→ 导航「收藏」页 `/favorites`（CSR，noindex）。

### 管理### 管理

- 列表可编辑/软删；回收站可恢复/永久删除（永久删除不可恢复）
- 无 key 访问后台与 API 一律 401

---

## 三、免费 AI 网关（token-free-gateway）

把 DeepSeek/豆包/Kimi/ChatGPT/Claude 等 13 家**网页版** AI 包装成 OpenAI 兼容 API，**完全免费**（凭据存本地，浏览器登录态经 CDP 转发，绕反爬）。

- 程序：`E:\code\token-free-gateway\token-free-gateway.exe`（**源码本地构建版**；npm/GitHub 发布版有打包缺陷）
- 详细说明：`E:\code\token-free-gateway\README.md`

```powershell
# 1) 启动网关（监听 http://localhost:3456）
E:\code\token-free-gateway\token-free-gateway.exe start

# 2) 授权模型（一次性；DeepSeek 保持聊天页开着）
E:\code\token-free-gateway\token-free-gateway.exe webauth

# 3) 验证
curl http://localhost:3456/v1/models
```

后台「✨ AI 完善」会自动连接本网关；提示"未连接"就是网关没启动。

---

## 四、本地开发

```bash
npm install
# 本地调试需先构建（wrangler dev 读 dist/_worker.js + 本地 D1）
npm run build
npx wrangler dev          # http://localhost:8787（读取 .dev.vars 里的 NUXT_MANAGE_KEY）
```

- `.dev.vars`：`NUXT_MANAGE_KEY=xxx`（本地调试用，已 gitignore）
- 本地 D1 与远程用同一条命令区分：`wrangler d1 execute article-db --local / --remote`

## 五、数据库（Cloudflare D1）

- database_id：`9051caef-e987-4a47-ae8c-2f91496b1a82`（在 `wrangler.jsonc`）
- 表：`articles`（文章，含 template / needs_review / publish_at 列）、`favorites`（收藏，设备指纹）
- 改 schema：`npx drizzle-kit generate` 生成迁移 → `wrangler d1 execute article-db --remote --file=./drizzle/xxx.sql` 应用
- 索引：`idx_articles_publish_at` / `idx_articles_expires_at`（cron 扫描走索引，已远程执行 `CREATE INDEX IF NOT EXISTS`）
- 已有过的手动迁移：`ALTER TABLE articles ADD COLUMN template text NOT NULL DEFAULT 'default'`、`ALTER TABLE articles ADD COLUMN needs_review integer NOT NULL DEFAULT 0`（远程+本地都要执行；`drizzle/0001_add-needs-review.sql` 是 drizzle 生成的完整 diff，含已手动加过的列，回放时跳过重复列）

## 六、部署（Cloudflare Workers）

```bash
npm run build          # 产物 dist/（postbuild 追加 .assetsignore 忽略 source map）
npx wrangler deploy    # 部署到 www.wcbblll.cc（wrangler.jsonc 配置 D1 + assets）
```

密钥（Cloudflare 控制台 → Worker → Settings → Variables and Secrets）：

| 变量 | 说明 |
|---|---|
| `NUXT_MANAGE_KEY` | 管理密钥（Nuxt runtimeConfig 读取规则是 `NUXT_` 前缀！设 `MANAGE_KEY` 无效） |
| 本地副本 | `E:\code\article-site\.env.manage-key`（勿外传） |

> 设置/更新 secret 后**必须重新 `wrangler deploy`** 才生效。

## 七、API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/articles` | 列表（游标分页，仅 published 未过期） |
| GET | `/api/articles/:id` | 详情（含 related/favoriteCount） |
| GET | `/api/articles/search?q=` | FTS5 全文搜索（中文子串） |
| POST | `/api/articles/:id/favorite` | 收藏/取消（body: fp + action） |
| GET | `/api/favorites?fp=` | 收藏列表 |
| POST | `/api/admin/articles?key=` | 新增（鉴权） |
| POST | `/api/admin/articles/batch?key=` | 批量新增（D1 batch，含内容安全拦截 + 定时发布） |
| GET | `/api/admin/articles?key=` | 管理列表（`&status=` 按状态过滤；`&needsReview=1` 只看待审） |
| PUT | `/api/admin/articles/:id?key=` | 修改（整篇覆盖） |
| PUT | `/api/admin/articles/:id/approve?key=` | 人工审核通过（body: `{"status":"published"|"draft"}`，默认保持原状态，仅清待审标记） |
| DELETE | `/api/admin/articles/:id?key=` | 软删（进回收站） |
| PUT | `/api/admin/articles/:id/restore?key=` | 恢复 |
| DELETE | `/api/admin/articles/:id/permanent?key=` | 永久删除 |
| GET | `/api/admin/trash?key=` | 回收站列表 |

## 八、SEO / GEO

- **JSON-LD 结构化数据**（喂给搜索引擎和 AI 爬虫，AI 问答可直接引用）：
  - 首页：`WebSite`（含 `alternateName` / `inLanguage` / `SearchAction` → `?q={search_term_string}`）+ 列表加载后注入 `ItemList`
  - 详情页：`Article` 全字段（headline / description / url / mainEntityOfPage / articleSection / keywords / author / publisher）+ `BreadcrumbList`（首页→分类→文章）+ `FAQPage`（有 FAQ 时）
- **og 标签**：首页 website、详情页 article（og:title / description / url / site_name）
- **robots.txt**：放行 GPTBot / ClaudeBot / PerplexityBot / Bytespider / CCBot 等 AI 爬虫
- **sitemap.xml**：基础版（文章增量可 cron 生成）
- 文章内容建议：FAQ 问答对（GEO 增强）、时效性用 `quote` warn 提示、相关文章互链、文章级友链

## 九、已知坑（踩过）

- **D1 的 FTS5 不支持 `'delete'` 命令语法**：触发器必须用 `DELETE FROM articles_fts WHERE rowid=...`，否则所有 UPDATE/DELETE 报 SQLITE_ERROR 7500（`server/utils/db.ts` 已按此实现）
- **Nuxt runtimeConfig secret 前缀**：服务端读 `NUXT_MANAGE_KEY`，不是 `MANAGE_KEY`
- **PowerShell 调 API 中文乱码**：Invoke-RestMethod 字符串 Body 会丢中文，用 `[Text.Encoding]::UTF8.GetBytes()` + WebRequest
- **wrangler tail 在部分网络 ETIMEDOUT**：本地 `wrangler dev` 复现更稳

## 十、目录结构

```
article-site/
├── app/
│   ├── app.vue                  # 布局（导航/页脚/友链）
│   ├── assets/css/main.css      # 全局样式
│   └── pages/
│       ├── index.vue            # 首页（分类 tab + 搜索 + 分页）
│       ├── article/[id].vue     # 详情（模板布局 + 块渲染 + FAQ/评论/友链）
│       ├── admin.vue            # 后台（格式化/预览/AI 完善/待审/回收站/批量定时）
│       └── about.vue
├── server/
│   ├── api/                     # Nitro 接口（articles / admin / favorites）
│   ├── db/schema.ts             # Drizzle schema
│   └── utils/db.ts              # D1 连接 + FTS5 ensureFts（触发器同步）
├── drizzle/                     # 迁移文件
├── wrangler.jsonc               # Cloudflare 配置（D1 + assets + custom domain）
├── scripts/postbuild.mjs        # 构建后追加 .assetsignore
└── nuxt.config.ts
```
