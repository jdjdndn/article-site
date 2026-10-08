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

后台地址：`https://www.wcbblll.cc/admin`（打开后输入管理密钥，仅保存在本浏览器会话，不写入 URL；管理密钥与部署环境变量 MANAGE_KEY 一致）

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

用 **Windows 定时任务 + 本地 AI 网关** 自动消化云端素材池（不再用本地 JSON）：

1. **放素材**（三种渠道，任选）：
   - 后台「素材队列」tab 粘贴原始文案（多条用空行分隔）；
   - 后台「数据统计」的今日搜索词 Top10 点「转素材」（热搜一键进队列）；
   - 用户在前台搜索无结果时提交选题（`/api/submit-topic`，带来源标记 `用户投稿`，同设备 24h 限 5 条防刷）。

2. **已注册定时任务**：`ArticleSite-AIGenerate`（Windows 任务计划）**每天 08:00** 自动运行 `node scripts/scheduled-generate.mjs`——拉取线上 `pending` 素材（每次最多 10 条）→ 本地网关去 AI 味+结构化（**引流文方向**：干货主体+软文链接，引流文不写过期时间）→ 批量入库 → 素材标记 done（失败标 failed 可后台重试）。

3. **运行监控（黑盒已打通）**：脚本每次运行（含失败、素材池为空）自动上报一条运行日志到 `run_logs` 表，后台「数据统计 → 定时流水线（最近 7 次）」可见：时间/模型/成功数/失败数/失败原因。**每天 8 点后先看这里，确认今天自动发文是否正常**。发布侧另外可看「文章管理 → 只看今天发布」。

**双保险（云端兜底，电脑关机也不断更）**：

- 本地脚本运行时先探测本地网关：**在线 → 本地 DeepSeek 全流程**；**离线 → 整轮转云端**调用 `/api/admin/run-daily-generate`（Workers AI 开源模型 `@cf/qwen/qwen3-30b-a3b-fp8` 跑完整流水线：选题→生成→入库→上报），不是"本地一段+云端一段"接力。
- **电脑关机没跑任务**：Cloudflare cron（`*/5`）在北京时间 **08:25-10:00** 窗口内轮询兜底，当天未发满 3 篇就自动补生成，发满即停；本地 8:00 已成功则云端看到当天已满直接跳过（防重共用"当天已发布 ≥3"判定，不会重复发）。
- 云端兜底结果同样进 `run_logs`（模型列显示 `@cf/qwen/qwen3-30b-a3b-fp8`），后台「定时流水线」可见。
- 手动/任意时刻触发云端兜底：`GET /api/admin/run-daily-generate`（请求头 `Authorization: Bearer <管理密钥>`；忽略窗口、保留防重，幂等）。

4. 手动跑一次 / 换模型 / 只生成不入库：

   ```powershell
   node scripts/scheduled-generate.mjs                # 默认 deepseek-chat
   node scripts/scheduled-generate.mjs --model kimi   # 换模型（网关 webauth 过即可用）
   node scripts/scheduled-generate.mjs --dry-run      # 只生成，不入库不消费素材
   ```

5. 改时间：`schtasks /Change /TN ArticleSite-AIGenerate /ST 09:30`（或任务计划程序图形界面）。网关没启动时脚本**自动转云端兜底**（见上），素材不会丢。

### 运营闭环（纠错 / 反馈 / 投稿）

- **文章纠错**：前台每篇文章「纠错」按钮 → `reports` 表（同设备同文章 10 分钟限 1 条防刷）→ 后台「数据统计 → 待处理反馈」一键「已处理」。
- **即将过期**：后台看板列出 7 天内到期的已发布文章（引流文无过期时间，天然不在内），到期自动下架无需人工。
- **公开投稿**：前台搜索无结果 → 提交选题 → 素材队列（标记 `用户投稿`）→ 次日 8 点自动生成文章。

### 外链规范

详情页全部外链（购买按钮/更多好物/软文 ad 块）统一 `rel="noopener nofollow sponsored"`（防权重流失 + 安全），点击仍走 sendBeacon 异步统计。

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

### 素材池（云端 D1 + 定时 AI 流水线）

素材从本地 JSON 文件迁移到线上 `seeds` 表，后台「素材队列」tab 可视化管理：

- **添加**：粘贴原始素材（多条空行分隔）→ 自动切分入库（pending）；也可 API `POST /api/admin/seeds`
- **状态闭环**：pending（待生成）→ done（已生成，关联 articleId）→ 失败可「重试」放回队列
- **定时流水线**（Windows 计划任务 `ArticleSite-AIGenerate` 每天 08:00）：
  `GET /api/admin/seeds?status=pending` 拉取 → 本机 AI 网关（免费网页版模型，去 AI 味+结构化）→
  `POST /api/admin/articles/batch` 入库 → 逐条标记 done/fail（失败原因入库）
- 单次最多处理 10 条；素材可带 category/template/publishAt（定时）/expiresAt，全部传给 AI 模板与入库
- **自动分类**：后台添加素材不选分类/模板时存 `auto`，定时流水线由 AI 自动判断（category 从 优惠/攻略/好物/副业 选，template 从 deal/guide/faq/default 选），显式指定优先
- 手动跑：`node scripts/scheduled-generate.mjs`（`--dry-run` 只生成不入库，`--model=kimi` 换模型）

### 数据统计（后台最小看板）

后台「数据统计」tab：文章总数/各状态分布/分类分布（条形图）/累计与今日点击/待生成素材/
**热门文章 Top10（点击归因）**/**今日搜索词 Top10**。
API `GET /api/admin/stats`（请求头 `Authorization: Bearer <管理密钥>`；聚合查询，admin-only，量级小不占资源）。

### 配置化

- 分类 tab：`app/config/site.ts` 的 `SITE_CATEGORIES`（前台/后台/API 共用，新增分类改一行）
- 首页公告条：`SITE_BANNERS`（text/link/highlight，可多条，空数组=隐藏）

### 搜索词统计（内容方向反哺）

`search_logs` 表记录前台搜索关键词（`/api/articles/search` 顺带写入，不阻塞查询），
后台看板展示今日搜索词 Top10；cron 每 5 分钟清理 90 天前数据（量小）。

### 内容批量导出

后台「数据统计」tab「导出已发布文章（JSON）」按钮，或
`GET /api/admin/export?status=published`（请求头 `Authorization: Bearer <管理密钥>`）—— 全量导出含 content/faq/links/tags，
供迁移、备份到第三方平台。

### Cloudflare 限流（Dashboard 配置，无需改代码）

公开写接口只有两个：`POST /api/track/click`（点击上报）、`POST /api/articles/*/favorite`（收藏）。
建议在 Cloudflare Dashboard → Security → WAF → Rate limiting rules 加两条：

| 规则 | 匹配表达式 | 阈值 | 动作 |
|---|---|---|---|
| track 防刷 | `(http.request.uri.path contains "/api/track/click")` | 60 次/分钟/IP | Block |
| favorite 防刷 | `(http.request.uri.path contains "/favorite")` | 30 次/分钟/IP | Block |

免费版 Rate Limiting 规则按账号维度计费（5 条免费规则），量级小，够用即可。

### 备份

`node scripts/backup-d1.mjs` 导出全部 D1 数据到 `backups/article-db-YYYYMMDD.sql`
（本地执行，不占线上资源；建议每周一次，可用计划任务定时）。

### 管理### 管理### 管理

- 列表可编辑/软删；回收站可恢复/永久删除（永久删除不可恢复）
- 无 key 访问后台与 API 一律 401

---

## 三、免费 AI 网关（token-free-gateway）

把 DeepSeek/豆包/Kimi/ChatGPT/Claude 等 13 家**网页版** AI 包装成 OpenAI 兼容 API，**完全免费**（凭据存本地 `~/.token-free-gateway/`，浏览器登录态经 CDP 转发，绕反爬）。

- 程序（**已 fork 进 auto-ai-article 管理**，2026-10-08）：`E:\code\auto-ai-article\third_party\token-free-gateway\token-free-gateway.exe`
- 自启脚本：`E:\code\auto-ai-article\third_party\token-free-gateway\auto-start.ps1`（幂等；计划任务 `ArticleSite-AIGateway` 登录时 + 每天 07:50 调用）
- 详细说明：`E:\code\auto-ai-article\third_party\token-free-gateway\README.md`

```powershell
# 1) 启动网关（监听 http://localhost:3456）
E:\code\auto-ai-article\third_party\token-free-gateway\token-free-gateway.exe start

# 2) 授权模型（一次性；DeepSeek 保持聊天页开着）
E:\code\auto-ai-article\third_party\token-free-gateway\token-free-gateway.exe webauth

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
| POST | `/api/admin/articles`（Bearer 鉴权） | 新增（鉴权） |
| POST | `/api/admin/articles/batch`（Bearer 鉴权） | 批量新增（D1 batch，含内容安全拦截 + 定时发布） |
| GET | `/api/admin/articles`（Bearer 鉴权） | 管理列表（`&status=` 按状态过滤；`&needsReview=1` 只看待审） |
| PUT | `/api/admin/articles/:id`（Bearer 鉴权） | 修改（整篇覆盖） |
| PUT | `/api/admin/articles/:id/approve`（Bearer 鉴权） | 人工审核通过（body: `{"status":"published"|"draft"}`，默认保持原状态，仅清待审标记） |
| DELETE | `/api/admin/articles/:id`（Bearer 鉴权） | 软删（进回收站） |
| PUT | `/api/admin/articles/:id/restore`（Bearer 鉴权） | 恢复 |
| DELETE | `/api/admin/articles/:id/permanent`（Bearer 鉴权） | 永久删除 |
| GET | `/api/admin/trash`（Bearer 鉴权） | 回收站列表 |

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
- **Worker 不能通过公网域名自调用自身 API**：Cloudflare 对 Worker fetch 自己 custom domain 直接返回 404 空响应（防自调用/循环）。`runDailyGenerate` 云端兜底因此改为直连 D1 + 复用 `server/utils/pipeline.ts` 业务函数（与 API 行为同构），**不要再加回公网自调用**
- **Workers AI 模型会下架**：`@cf/qwen/qwen2.5-7b-instruct` 已下线（错误 5007: No such model）。现用 `@cf/qwen/qwen3-30b-a3b-fp8`（中文质量好、无编造链接；注意 `max_tokens` 要给足，否则答案被思考过程挤掉）。模型返回结构各不同：Llama 3.3 是 `{ result: { response } }`、Qwen3 是 OpenAI 兼容 `choices[0].message.content`，`aiChat` 已做多通道兼容提取，**换模型时不要单侧改提取逻辑**
- **提示词/JSON 提取是单一来源**：`shared/ai-prompts.mjs`（aiSystemPrompt/aiSuggestPrompt/dateContext）与 `shared/ai-utils.mjs`（extractJson）由本地脚本 `scripts/scheduled-generate.mjs` 和云端 `server/utils/daily-generate.ts` 共用，**改提示词只改共享文件，不要在任一侧复制**；云端构建时 rollup 会把 shared/ 内联打包进 Worker（已验证）

## 十、目录结构

```
article-site/
├── app/
│   ├── app.vue                  # 布局（导航/页脚/友链）
│   ├── assets/css/main.css      # 全局样式
│   └── pages/
│       ├── index.vue            # 首页（分类 tab + 搜索 + 分页）
│       ├── article/[id].vue     # 详情（模板布局 + 块渲染 + FAQ/友链）
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
