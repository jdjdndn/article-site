<script setup lang="ts">
import { reactive, ref, computed } from 'vue'

const route = useRoute()
const key = computed(() => (route.query.key as string) || '')

// 视图状态：list（文章管理）/ trash（回收站）；mode：list / create / edit
const tab = ref<'list' | 'trash' | 'review'>('list')
const mode = ref<'list' | 'create' | 'edit'>('list')
const previewMode = ref(false)
const aiPanel = ref(false)
const aiBusy = ref(false)
const aiModels = ref<any[]>([])
const aiModel = ref('')
const aiError = ref('')
const aiHint = ref('')
const articles = ref<any[]>([])
const trash = ref<any[]>([])
const editingId = ref('')
const msg = ref('')
const busy = ref(false)

const emptyForm = {
  title: '', summary: '', category: '优惠', status: 'published', expiresAt: '', template: 'default', publishAt: '',
  content: '[\n  { "type": "text", "text": "" }\n]',
  links: '[]', tags: '[]', faq: '[]', relatedIds: '[]', friendLinks: '[]',
}
const form = reactive({ ...emptyForm })

// 统一带 key 请求
async function api(path: string, opts: any = {}) {
  return await $fetch(path, {
    ...opts,
    query: { ...(opts.query || {}), key: key.value },
  })
}

async function loadList() {
  const res = await api('/api/admin/articles')
  articles.value = res.list || []
}
async function loadTrash() {
  const res = await api('/api/admin/trash')
  trash.value = res.list || []
}
async function loadReview() {
  const res = await api('/api/admin/articles?needsReview=1')
  review.value = res.list || []
}
const review = ref<any[]>([])
async function approve(a: any, status: 'published' | 'draft' = 'published') {
  if (!confirm(`审核通过《${a.title}》？${status === 'published' ? '将立即发布' : '保留为草稿'}。`)) return
  await api(`/api/admin/articles/${a.id}/approve`, { method: 'PUT', body: { status } })
  flash(`已通过审核（${status === 'published' ? '已发布' : '草稿'}）`)
  await loadReview()
  await loadList()
}
function flash(m: string) {
  msg.value = m
  setTimeout(() => (msg.value = ''), 2500)
}

// —— JSON 字段：实时校验 + 一键格式化 ——
const jsonFields = ['content', 'links', 'tags', 'faq', 'relatedIds', 'friendLinks']
function parseField(field: string): any {
  try {
    const v = (form as any)[field] || ''
    return v.trim() ? JSON.parse(v) : null
  } catch { return null }
}
function fieldValid(field: string): boolean {
  const v = (form as any)[field] || ''
  if (!v.trim()) return true // 空字段允许（落库用默认值）
  return parseField(field) !== null
}
function formatField(field: string) {
  const p = parseField(field)
  if (p === null) { flash(`JSON 格式错误：${field}`); return }
  ;(form as any)[field] = JSON.stringify(p, null, 2)
}
function validateForm(): boolean {
  if (!form.title.trim()) { flash('标题必填'); return false }
  for (const f of jsonFields) {
    if (!fieldValid(f)) { flash(`JSON 格式错误：${f}`); return false }
  }
  return true
}

// —— 预览数据（不落库，与前台渲染一致） ——
const preview = computed(() => {
  const ok = (v: string, d: any) => {
    try { return v && v.trim() ? JSON.parse(v) : d } catch { return d }
  }
  return {
    title: form.title,
    summary: form.summary,
    category: form.category,
    template: form.template || 'default',
    status: form.status,
    expiresAt: form.expiresAt,
    content: ok(form.content, []),
    links: ok(form.links, []),
    tags: ok(form.tags, []),
    faq: ok(form.faq, []),
    relatedIds: ok(form.relatedIds, []),
    friendLinks: ok(form.friendLinks, []),
  }
})
function isAd(block: any) { return block?.type === 'ad' }

// —— AI 完善（本地 Token-Free 网关 localhost:3456，免费模型） ——
const TFG = 'http://localhost:3456/v1'
async function openAiPanel() {
  aiError.value = ''
  aiHint.value = ''
  aiPanel.value = true
  aiBusy.value = true
  try {
    const res = await $fetch(`${TFG}/models`, { timeout: 10000 })
    aiModels.value = res?.data || []
    if (!aiModels.value.length) aiHint.value = '网关已连接，但还没有已授权的模型 → 先运行 token-free-gateway webauth 登录 DeepSeek/豆包/Kimi 等'
    else aiModel.value = aiModel.value || aiModels.value[0].id
  } catch {
    aiModels.value = []
    aiHint.value = '未连接到本地 AI 网关（http://localhost:3456）。请先启动：token-free-gateway start，并运行 webauth 授权。'
  } finally {
    aiBusy.value = false
  }
}
async function runAi() {
  if (!aiModel.value) return
  aiBusy.value = true
  aiError.value = ''
  try {
    const raw = {
      title: form.title,
      summary: form.summary,
      category: form.category,
      content: parseField('content') ?? [],
      links: parseField('links') ?? [],
      tags: parseField('tags') ?? [],
      faq: parseField('faq') ?? [],
      expiresAt: form.expiresAt,
    }
    const res = await $fetch(`${TFG}/chat/completions`, {
      method: 'POST',
      timeout: 180000,
      body: {
        model: aiModel.value,
        messages: [
          { role: 'system', content: aiSystemPrompt(form.template) },
          { role: 'user', content: `原始信息：\n${JSON.stringify(raw, null, 2)}` },
        ],
        stream: false,
      },
    })
    const text = res?.choices?.[0]?.message?.content || ''
    const parsed = extractJson(text)
    if (!parsed) throw new Error('AI 返回内容无法解析为 JSON')
    // 回填（仅覆盖 AI 负责的字段，分类/状态/过期时间保留人工选择）
    if (typeof parsed.title === 'string' && parsed.title.trim()) form.title = parsed.title.trim()
    if (typeof parsed.summary === 'string') form.summary = parsed.summary
    if (Array.isArray(parsed.content)) form.content = JSON.stringify(parsed.content, null, 2)
    if (Array.isArray(parsed.links)) form.links = JSON.stringify(parsed.links, null, 2)
    if (Array.isArray(parsed.tags)) form.tags = JSON.stringify(parsed.tags, null, 2)
    if (Array.isArray(parsed.faq)) form.faq = JSON.stringify(parsed.faq, null, 2)
    if (parsed.expiresAt && typeof parsed.expiresAt === 'string') form.expiresAt = parsed.expiresAt
    if (!validateForm()) throw new Error('AI 生成的 JSON 校验未通过，请人工检查')
    aiPanel.value = false
    flash('AI 完善完成，点「预览效果」核对后再保存')
  } catch (e: any) {
    aiError.value = e?.message || e?.data?.statusMessage || 'AI 调用失败'
  } finally {
    aiBusy.value = false
  }
}
function extractJson(text: string): any {
  const t = text.trim()
  try { return JSON.parse(t) } catch { /* fallthrough */ }
  const m = t.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch { /* fallthrough */ } }
  const mc = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (mc) { try { return JSON.parse(mc[1].trim()) } catch { /* fallthrough */ } }
  return null
}
// 按模板生成 AI 系统提示词（单篇完善 / 批量流水线共用）
function aiSystemPrompt(tmpl: string): string {
  const tmplName = tmpl === 'deal' ? '好物带货' : tmpl === 'guide' ? '攻略' : tmpl === 'faq' ? '问答' : '通用'
  const tmplRule = tmpl === 'deal'
    ? 'content 必须包含：1 个 price 块（从原始信息提取价格/原价/规格）、1 个 list 卖点块（3-4 条）、1 个 quote 提示块（tone 用 "warn"，写"价格与库存可能随时变化，以页面显示为准"）、2-3 个 text 段落、1 个 ad 软文块（label 如"推荐"，link 用第一个跳转链接）'
    : tmpl === 'guide'
      ? 'content 用 h2 小标题 + text 段落 + list 要点组织，至少 2 个 h2，步骤清晰'
      : tmpl === 'faq'
        ? 'content 用 text 段落为主，faq 至少 3 条且问题口语化贴近真实提问'
        : 'content 用 text 段落为主，可含 1 个 h2 小标题、1 个 list 要点、1 个 ad 软文块'
  return `你是中文内容编辑。用户会给你一条或多条商品/文章原始信息（可能凌乱、信息不全、有错别字）。请完成三件事：
1) 去 AI 味：改写为自然口语化的中文，删掉"首先/其次/值得一提的是/总的来说"等套话，避免对仗排比、每段首句总起的机器结构，多用短句和"你"；
2) 信息完善：商品类文章要突出价格/券后价/规格/卖点/适用场景/送礼或自用建议；可合理补一句真实感的口语化推荐，但不要编造不存在的参数、疗效或承诺；
3) 结构化输出：只输出一个 JSON 对象（不要任何多余文字、不要 markdown 代码块），schema 如下：
{"title":"标题（15字内，含价格和核心卖点）","summary":"一句话摘要（含价格）","content":[块对象],"tags":["标签1","标签2","标签3"],"faq":[{"q":"常见问题","a":"简短回答"}],"links":[{"label":"按钮文字","url":"https://..."}]}
可用块对象类型：text（段落，字段 text）/ h2（小标题，字段 text）/ list（要点列表，字段 items:[]）/ price（价格卡，字段 price,original?,spec?）/ quote（提示框，字段 text,tone:"warn"|"info"）/ ad（软文，字段 label,text,link?）。
模板要求：当前文章模板是「${tmplName}」，content 必须按以下要求组织——
${tmplRule}
links 保留用户给的所有跳转链接（label 可用"领券/抢购/下单"等），tags 3-5 个，faq 2-4 条。如果原始信息里有明确过期时间，写入 expiresAt 字段。`
}

// —— 批量录入流水线：粘贴 → 切分 → AI 逐条生成 → 勾选 → 批量入库 ——
const batchMode = ref(false)
const batchBusy = ref(false)
const batchSaving = ref(false)
const batchRaw = ref('')
const batchItems = ref<any[]>([])
const batchLog = ref('')
const batchTemplate = ref('deal')
const batchCategory = ref('优惠')
const batchPublishAt = ref('')

function openBatch() {
  batchMode.value = true
  batchLog.value = ''
  batchItems.value = []
  batchRaw.value = ''
}
function closeBatch() {
  if (batchBusy.value) return
  batchMode.value = false
  batchItems.value = []
  batchRaw.value = ''
}
// 切分粘贴文本：按空行 / ——分隔线—— 分成多条素材；过滤过短片段
function splitRaw(text: string): string[] {
  const t = (text || '').replace(/\r/g, '')
  return t
    .split(/\n\s*\n|——[\s\S]*?——/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
}
function parseBatch() {
  const parts = splitRaw(batchRaw.value)
  if (!parts.length) { flash('未切分出有效素材（需要至少 8 个字符的片段）'); return }
  batchItems.value = parts.map((raw, i) => ({
    i: i + 1,
    raw,
    state: 'ready',
    error: '',
    generated: null,
    checked: true,
  }))
  batchLog.value = `已切分 ${parts.length} 条素材，点「AI 批量生成」逐条完善`
}
async function runBatchAi() {
  if (!aiModel.value) { flash('请先选择模型：打开「✨ AI 完善」面板连接网关'); return }
  const picked = batchItems.value.filter((it) => it.checked)
  if (!picked.length) { flash('没有勾选要生成的素材'); return }
  batchBusy.value = true
  batchLog.value = ''
  const total = picked.length
  for (let k = 0; k < total; k++) {
    const it = picked[k]
    it.state = 'busy'
    it.error = ''
    try {
      const res = await $fetch(`${TFG}/chat/completions`, {
        method: 'POST',
        timeout: 180000,
        body: {
          model: aiModel.value,
          messages: [
            { role: 'system', content: aiSystemPrompt(batchTemplate.value) },
            { role: 'user', content: `原始信息：\n${it.raw}` },
          ],
          stream: false,
        },
      })
      const text = res?.choices?.[0]?.message?.content || ''
      const parsed = extractJson(text)
      if (!parsed) throw new Error('AI 返回无法解析为 JSON')
      it.generated = { ...parsed, category: batchCategory.value, template: batchTemplate.value }
      it.state = 'done'
      batchLog.value += `✅ ${k + 1}/${total} ${parsed.title || '(无标题)'}\n`
    } catch (e: any) {
      it.state = 'error'
      it.error = e?.message || e?.data?.statusMessage || 'AI 调用失败'
      batchLog.value += `❌ ${k + 1}/${total} ${it.error}\n`
    }
  }
  batchBusy.value = false
  batchLog.value += `—— 完成 ${picked.filter((x) => x.state === 'done').length}/${total} 条 ——`
}
function retryItem(it: any) {
  if (batchBusy.value) return
  it.checked = true
  it.state = 'ready'
  runBatchAi()
}
async function saveBatch() {
  const picked = batchItems.value.filter((it) => it.checked && it.state === 'done' && it.generated)
  if (!picked.length) { flash('没有可入库的已完成文章'); return }
  const list = picked.map((it) => ({
    title: it.generated.title || '未命名',
    summary: it.generated.summary || '',
    category: it.generated.category || batchCategory.value,
    template: it.generated.template || batchTemplate.value,
    status: 'published',
    expiresAt: it.generated.expiresAt || '',
    content: Array.isArray(it.generated.content) && it.generated.content.length ? it.generated.content : [{ type: 'text', text: '' }],
    tags: it.generated.tags || [],
    faq: it.generated.faq || [],
    links: it.generated.links || [],
  }))
  if (batchPublishAt.value) {
    for (const a of list) a.publishAt = new Date(batchPublishAt.value).toISOString()
  }
  batchSaving.value = true
  try {
    const res = await api('/api/admin/articles/batch', { method: 'POST', body: { articles: list } })
    const blocked = (res.safetyHits || []).length
    flash(blocked
      ? `已入库 ${res.created} 篇，失败 ${res.failed} 篇；${blocked} 篇命中内容安全规则已转草稿待审`
      : `已入库 ${res.created} 篇，失败 ${res.failed} 篇`)
    batchItems.value = []
    batchRaw.value = ''
    batchMode.value = false
    await loadList()
  } catch (e: any) {
    flash(`入库失败：${e?.data?.statusMessage || e?.message || '未知错误'}`)
  } finally {
    batchSaving.value = false
  }
}



// —— 新建 / 编辑 ——
function openCreate() {
  mode.value = 'create'
  editingId.value = ''
  Object.assign(form, emptyForm)
}
async function openEdit(a: any) {
  const res = await api(`/api/admin/articles/${a.id}`)
  const art = res.article
  editingId.value = a.id
  Object.assign(form, {
    title: art.title,
    summary: art.summary,
    category: art.category,
    status: art.status,
    template: art.template || 'default',
    expiresAt: art.expiresAt || '',
    publishAt: art.publishAt ? art.publishAt.slice(0, 16) : '',
    content: JSON.stringify(art.content, null, 2),
    links: JSON.stringify(art.links, null, 2),
    tags: JSON.stringify(art.tags, null, 2),
    faq: JSON.stringify(art.faq, null, 2),
    relatedIds: JSON.stringify(art.relatedIds, null, 2),
    friendLinks: JSON.stringify(art.friendLinks, null, 2),
  })
  mode.value = 'edit'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
async function save() {
  if (!validateForm()) return
  busy.value = true
  const body = { ...form, publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : '' }
  try {
    if (mode.value === 'create') {
      const res = await api('/api/admin/articles', { method: 'POST', body })
      if (res.safetyHits && res.safetyHits.length) {
        flash(`已创建（${res.id}）：命中内容安全规则（${res.safetyHits.map((h: any) => h.label).join('、')}），已转草稿待人工审核`)
      } else {
        flash(`已创建：${res.id}`)
      }
    } else {
      await api(`/api/admin/articles/${editingId.value}`, { method: 'PUT', body })
      flash('已保存')
    }
    mode.value = 'list'
    previewMode.value = false
    await loadList()
  } catch (e: any) {
    flash(`失败：${e?.data?.statusMessage || e?.message || '未知错误'}`)
  } finally {
    busy.value = false
  }
}

// —— 删除 / 回收站 ——
async function softDelete(a: any) {
  if (!confirm(`软删除《${a.title}》？将进入回收站，可恢复。`)) return
  await api(`/api/admin/articles/${a.id}`, { method: 'DELETE' })
  flash('已移入回收站')
  await loadList()
}
async function restore(a: any) {
  await api(`/api/admin/articles/${a.id}/restore`, { method: 'PUT' })
  flash('已恢复（草稿状态）')
  await loadTrash()
  await loadList()
}
async function hardDelete(a: any) {
  if (!confirm(`永久删除《${a.title}》？不可恢复！`)) return
  await api(`/api/admin/articles/${a.id}/permanent`, { method: 'DELETE' })
  flash('已永久删除')
  await loadTrash()
}

function switchTab(t: 'list' | 'trash' | 'review') {
  tab.value = t
  if (t === 'list') loadList()
  else if (t === 'trash') loadTrash()
  else loadReview()
}

// 初始加载
if (key.value) loadList()
</script>

<template>
  <div class="admin">
    <div v-if="!key" class="card warn">
      <h2>需要后台权限</h2>
      <p>在 URL 末尾加 <code>?key=你的管理密钥</code>（与部署环境变量 MANAGE_KEY 一致）。</p>
      <p class="hint">示例：/admin?key=xxx</p>
    </div>

    <div v-else>
      <div class="toolbar">
        <div class="tabs">
          <button :class="{ active: tab === 'list' }" @click="switchTab('list')">文章管理</button>
          <button :class="{ active: tab === 'trash' }" @click="switchTab('trash')">回收站（{{ trash.length }}）</button>
          <button :class="{ active: tab === 'review' }" @click="switchTab('review')">待审（{{ review.length }}）</button>
        </div>
        <button v-if="tab === 'list' && mode === 'list'" class="primary" @click="openCreate">＋ 新建文章</button>
        <button v-if="tab === 'list' && mode === 'list'" class="primary" @click="openBatch">⿇ 批量录入</button>
        <button v-if="mode !== 'list'" class="ghost" @click="mode = 'list'">← 返回列表</button>
      </div>

      <p v-if="msg" class="flash">{{ msg }}</p>

      <!-- 批量录入面板（AI 流水线：粘贴 → 切分 → 逐条生成 → 勾选 → 批量入库） -->
      <div v-if="batchMode" class="card batch">
        <div class="batch-head">
          <h2>⿇ 批量录入（AI 流水线）</h2>
          <button type="button" class="ghost" @click="closeBatch" :disabled="batchBusy">✕ 关闭</button>
        </div>
        <p class="hint">粘贴多条原始文案（京东/淘宝/拼多多/「——标题——」分组均可，素材之间用空行分隔），先「① 切分素材」，再「② AI 批量生成」（逐条去 AI 味 + 结构化），最后勾选「③ 批量入库」。AI 只覆盖 title/summary/content/tags/faq/links，分类/模板/过期时间在此面板指定。</p>
        <textarea v-model="batchRaw" rows="6" class="mono" placeholder="示例：
——蒙牛 牛奶——
44.9元 蒙牛特仑苏低脂纯牛奶250ml×16盒 健身减脂 中秋送礼礼盒
抢购：https://u.jd.com/xxx
更多好物推荐：https://u.jd.com/xxx

——伊利 酸奶——
32.9元 蒙牛纯甄蓝莓果粒风味酸奶200g*10盒 早餐奶酸牛奶
抢购：https://u.jd.com/xxx"></textarea>
        <div class="row">
          <label>模板
            <select v-model="batchTemplate">
              <option value="deal">好物带货（购买按钮前置）</option>
              <option value="guide">攻略（小标题分段）</option>
              <option value="faq">问答（FAQ 前置）</option>
              <option value="default">通用</option>
            </select>
          </label>
          <label>分类
            <select v-model="batchCategory">
              <option>优惠</option><option>攻略</option><option>好物</option><option>副业</option><option>其他</option>
            </select>
          </label>
          <label>定时发布（可选，填了未来时间自动进草稿，到点 cron 发布）
            <input v-model="batchPublishAt" type="datetime-local" />
          </label>
          <label>模型（<a href="#" @click.prevent="openAiPanel">✨ 先连网关选模型</a>）
            <select v-model="aiModel">
              <option v-for="m in aiModels" :key="m.id" :value="m.id">{{ m.id }}</option>
              <option v-if="!aiModels.length" value="" disabled>（未连接网关）</option>
            </select>
          </label>
        </div>
        <div class="actions">
          <button type="button" class="primary" @click="parseBatch" :disabled="batchBusy || !batchRaw.trim()">① 切分素材</button>
          <button type="button" class="primary" @click="runBatchAi" :disabled="batchBusy || !batchItems.length || !aiModel">{{ batchBusy ? '生成中…' : '② AI 批量生成' }}</button>
          <button type="button" class="primary" @click="saveBatch" :disabled="batchBusy || batchSaving || !batchItems.filter(x => x.checked && x.state === 'done').length">{{ batchSaving ? '入库中…' : '③ 批量入库' }}</button>
        </div>
        <pre v-if="batchLog" class="batch-log">{{ batchLog }}</pre>
        <div v-if="batchItems.length" class="batch-list">
          <div v-for="it in batchItems" :key="it.i" class="batch-item" :class="it.state">
            <label class="chk"><input type="checkbox" v-model="it.checked" :disabled="batchBusy || it.state === 'busy'" /> {{ it.i }}</label>
            <div class="bi-main">
              <p class="bi-title">{{ it.generated?.title || '(待生成)' }}</p>
              <p v-if="it.generated?.summary" class="bi-summary">{{ it.generated.summary }}</p>
              <details><summary>原始素材</summary><pre class="mono">{{ it.raw }}</pre></details>
            </div>
            <div class="bi-side">
              <span class="bi-state" :class="it.state">{{ { ready: '待生成', busy: '生成中…', done: '完成', error: '失败' }[it.state] }}</span>
              <button v-if="it.state === 'error'" type="button" class="mini" @click="retryItem(it)" :disabled="batchBusy">重试</button>
            </div>
            <p v-if="it.error" class="bi-error">⚠ {{ it.error }}</p>
          </div>
        </div>
      </div>

      <!-- 表单（新建/编辑） -->
      <form v-if="mode !== 'list' && !previewMode" class="card form" @submit.prevent="save">
        <h2>{{ mode === 'create' ? '新建文章' : '编辑文章' }}</h2>
        <div class="form-tools">
          <button type="button" class="ghost" @click="['content','links','tags','faq','relatedIds','friendLinks'].forEach(formatField)">🧹 格式化全部 JSON</button>
          <button type="button" class="ghost" @click="openAiPanel" :disabled="aiBusy">✨ AI 完善</button>
          <button type="button" class="primary" @click="previewMode = true">👁 预览效果</button>
        </div>
        <!-- AI 完善面板 -->
        <div v-if="aiPanel" class="card ai-panel">
          <h3>✨ 免费 AI 完善（本地网关 localhost:3456）</h3>
          <p class="hint">{{ aiHint || '把当前表单内容作为原始素材，AI 去 AI 味 + 信息完善 + 结构化后回填。' }}</p>
          <div class="row">
            <label>模型
              <select v-model="aiModel">
                <option v-for="m in aiModels" :key="m.id" :value="m.id">{{ m.id }}</option>
                <option v-if="!aiModels.length" value="" disabled>（无已授权模型）</option>
              </select>
            </label>
          </div>
          <p v-if="aiError" class="ai-error">⚠ {{ aiError }}</p>
          <div class="actions">
            <button type="button" class="primary" :disabled="aiBusy || !aiModel" @click="runAi">{{ aiBusy ? 'AI 处理中（最长 3 分钟）…' : '开始完善' }}</button>
            <button type="button" class="ghost" @click="aiPanel = false">关闭</button>
          </div>
        </div>
        <label>标题 *
          <input v-model="form.title" required />
        </label>
        <label>摘要
          <textarea v-model="form.summary" rows="2"></textarea>
        </label>
        <div class="row">
          <label>分类
            <select v-model="form.category">
              <option>优惠</option><option>攻略</option><option>好物</option><option>副业</option><option>其他</option>
            </select>
          </label>
          <label>模板
            <select v-model="form.template">
              <option value="default">通用</option>
              <option value="deal">好物带货（购买按钮前置）</option>
              <option value="guide">攻略（小标题分段）</option>
              <option value="faq">问答（FAQ 前置）</option>
            </select>
          </label>
          <label>状态
            <select v-model="form.status">
              <option value="published">发布（保存立即上线）</option>
              <option value="draft">草稿（暂不显示）</option>
            </select>
          </label>
          <label>定时发布（可选，填了未来时间会自动进草稿，到点 cron 自动发布）
            <input v-model="form.publishAt" type="datetime-local" />
          </label>
          <label>过期时间（可选）
            <input v-model="form.expiresAt" placeholder="2026-12-31" />
          </label>
        </div>
        <label>正文（JSON 块数组，可用类型见下）
          <textarea v-model="form.content" rows="8" class="mono" :class="{ invalid: !fieldValid('content') }"></textarea>
          <span class="hint">块类型：text 段落 / h2 小标题 / list 要点（items:[]）/ price 价格卡（price,original?,spec?）/ quote 提示框（text,tone:"warn"|"info"）/ ad 软文（label,text,link?）/ image 图片（url,alt?）</span>
        </label>
        <label>链接（JSON [{label,url}]）
          <textarea v-model="form.links" rows="3" class="mono" :class="{ invalid: !fieldValid('links') }"></textarea>
        </label>
        <label>标签（JSON 数组）
          <textarea v-model="form.tags" rows="2" class="mono" :class="{ invalid: !fieldValid('tags') }"></textarea>
        </label>
        <label>FAQ（JSON [{q,a}]）
          <textarea v-model="form.faq" rows="2" class="mono" :class="{ invalid: !fieldValid('faq') }"></textarea>
        </label>
        <label>相关文章（JSON id 数组）
          <textarea v-model="form.relatedIds" rows="2" class="mono" :class="{ invalid: !fieldValid('relatedIds') }"></textarea>
        </label>
        <label>文章级友链（JSON [{name,url}]）
          <textarea v-model="form.friendLinks" rows="2" class="mono" :class="{ invalid: !fieldValid('friendLinks') }"></textarea>
        </label>
        <div class="actions">
          <button type="submit" class="primary" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</button>
          <button type="button" class="ghost" @click="mode = 'list'; previewMode = false">取消</button>
        </div>
      </form>

      <!-- 预览（不落库，确认后再保存） -->
      <div v-else-if="mode !== 'list' && previewMode" class="card preview">
        <div class="preview-bar">
          <h2>文章预览（未保存）</h2>
          <button class="ghost" @click="previewMode = false">← 返回编辑</button>
        </div>
        <div class="detail">
          <nav class="breadcrumb"><span>首页 / {{ preview.category || '文章' }}</span></nav>
          <h1 class="title">{{ preview.title || '（未填标题）' }}</h1>
          <p class="summary">{{ preview.summary }}</p>
          <div class="meta">
            <span v-if="preview.expiresAt" class="expire">⏰ 优惠截止：{{ preview.expiresAt }}</span>
            <span class="time">状态：{{ preview.status }}</span>
            <span class="time">模板：{{ preview.template || 'default' }}</span>
          </div>
          <article class="content">
            <template v-for="(block, i) in preview.content" :key="i">
              <div v-if="isAd(block)" class="ad-block">
                <span class="ad-label">{{ block.label || '广告' }}</span>
                <p>{{ block.text }}</p>
                <a v-if="block.link" :href="block.link" target="_blank" rel="noopener nofollow" class="ad-link">去看看 →</a>
              </div>
              <h2 v-else-if="block?.type === 'h2'" class="block-h2">{{ block.text }}</h2>
              <div v-else-if="block?.type === 'list'" class="block-list">
                <p v-for="(item, j) in block.items" :key="j" class="list-item">{{ item }}</p>
              </div>
              <div v-else-if="block?.type === 'price'" class="block-price">
                <span class="price">¥{{ block.price }}</span>
                <span v-if="block.original" class="original">¥{{ block.original }}</span>
                <span v-if="block.spec" class="spec">{{ block.spec }}</span>
              </div>
              <div v-else-if="block?.type === 'quote'" class="block-quote" :class="block.tone === 'warn' ? 'warn' : 'info'">{{ block.text }}</div>
              <figure v-else-if="block?.type === 'image'" class="block-image">
                <img :src="block.url" :alt="block.alt || '文章配图'" loading="lazy" />
              </figure>
              <p v-else class="text-block">{{ block.text }}</p>
            </template>
          </article>
          <section v-if="preview.faq?.length" class="faq">
            <h2>常见问题</h2>
            <details v-for="(f, i) in preview.faq" :key="i">
              <summary>{{ f.q }}</summary>
              <p>{{ f.a }}</p>
            </details>
          </section>
          <div v-if="preview.links?.length" class="links">
            <a v-for="(l, i) in preview.links" :key="i" :href="l.url" target="_blank" rel="noopener nofollow" class="link-btn">{{ l.label }}</a>
          </div>
          <div v-if="preview.tags?.length" class="tags">
            <span v-for="(t, i) in preview.tags" :key="i" class="tag">{{ t }}</span>
          </div>
          <section class="friend">
            <h2>友情链接</h2>
            <div class="friend-links">
              <template v-if="preview.friendLinks?.length">
                <a v-for="(f, i) in preview.friendLinks" :key="i" :href="f.url" target="_blank" rel="noopener">{{ f.name }}</a>
              </template>
              <template v-else>
                <a href="https://jdjdndn.github.io" target="_blank" rel="noopener">jdjdndn.github.io</a>
                <a href="https://wcbblll.cc" target="_blank" rel="noopener">wcbblll.cc</a>
              </template>
            </div>
          </section>
        </div>
        <div class="actions">
          <button class="primary" :disabled="busy" @click="save">{{ busy ? '保存中…' : '确认保存' }}</button>
          <button class="ghost" @click="previewMode = false">返回修改</button>
        </div>
      </div>

      <!-- 文章列表 -->
      <div v-else-if="tab === 'list'" class="card">
        <div v-if="!articles.length" class="empty">暂无文章（点"新建文章"创建第一篇）</div>
        <table v-else class="tbl">
          <thead>
            <tr><th>标题</th><th>分类</th><th>状态</th><th>过期</th><th>更新时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="a in articles" :key="a.id">
              <td class="title-cell">
                <NuxtLink :to="`/article/${a.id}`" target="_blank">{{ a.title }}</NuxtLink>
                <div class="id">{{ a.id }}</div>
              </td>
              <td>{{ a.category }}</td>
              <td>
                <span class="badge" :class="a.status">{{ a.status }}</span>
                <span v-if="a.needsReview" class="badge review">待审</span>
                <span v-if="a.status === 'draft' && a.publishAt" class="badge scheduled">⏱ {{ a.publishAt.slice(0, 16).replace('T', ' ') }}</span>
              </td>
              <td class="muted">{{ a.expiresAt || '—' }}</td>
              <td class="muted">{{ a.updatedAt?.slice(0, 10) }}</td>
              <td>
                <button class="mini" @click="openEdit(a)">编辑</button>
                <button class="mini danger" @click="softDelete(a)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 待审列表（内容安全命中，需人工审核） -->
      <div v-else-if="tab === 'review'" class="card">
        <div v-if="!review.length" class="empty">没有待审文章（内容安全未命中，或已全部处理）</div>
        <table v-else class="tbl">
          <thead>
            <tr><th>标题</th><th>分类</th><th>状态</th><th>更新时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="a in review" :key="a.id">
              <td class="title-cell">
                {{ a.title }} <span class="badge review">待审</span>
                <div class="id">{{ a.id }}</div>
              </td>
              <td>{{ a.category }}</td>
              <td><span class="badge" :class="a.status">{{ a.status }}</span></td>
              <td class="muted">{{ a.updatedAt?.slice(0, 10) }}</td>
              <td>
                <button class="mini" @click="approve(a, 'published')">通过并发布</button>
                <button class="mini" @click="approve(a, 'draft')">通过留草稿</button>
                <button class="mini" @click="openEdit(a); tab = 'list'">编辑</button>
                <button class="mini danger" @click="softDelete(a)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="hint">待审 = 内容安全规则命中自动转草稿的文章；通过后清除标记并可选立即发布。词库仅兜底，请人工复核实际内容。</p>
      </div>

      <!-- 回收站 -->
      <div v-else class="card">
        <div v-if="!trash.length" class="empty">回收站为空</div>
        <table v-else class="tbl">
          <thead>
            <tr><th>标题</th><th>分类</th><th>删除时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="a in trash" :key="a.id">
              <td class="title-cell">
                {{ a.title }}
                <div class="id">{{ a.id }}</div>
              </td>
              <td>{{ a.category }}</td>
              <td class="muted">{{ a.updatedAt?.slice(0, 10) }}</td>
              <td>
                <button class="mini" @click="restore(a)">恢复</button>
                <button class="mini danger" @click="hardDelete(a)">永久删除</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="hint">回收站内"永久删除"为物理删除，不可恢复。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.tabs { display: flex; gap: 6px; }
.tabs button { padding: 6px 14px; border: 1px solid #ddd; background: #fff; border-radius: 8px; cursor: pointer; font-size: 13px; }
.tabs button.active { background: #1677ff; color: #fff; border-color: #1677ff; }
.primary { padding: 7px 18px; background: #1677ff; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
.primary:disabled { opacity: .6; cursor: not-allowed; }
.ghost { padding: 7px 14px; background: #fff; color: #666; border: 1px solid #ddd; border-radius: 8px; cursor: pointer; font-size: 13px; }
.flash { color: #1677ff; font-size: 14px; margin-bottom: 10px; }
.form h2 { font-size: 16px; margin-bottom: 12px; }
.form-tools { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.form-tools .primary { padding: 6px 12px; font-size: 13px; }
.ai-panel { border: 1px solid #d9f7be; background: #f6ffed; padding: 14px 16px; margin-bottom: 14px; }
.ai-panel h3 { font-size: 14px; margin: 0 0 6px; }
.ai-error { color: #fa541c; font-size: 13px; }
.form label { display: block; margin-bottom: 10px; font-size: 13px; color: #555; }
.form input, .form textarea, .form select { width: 100%; margin-top: 4px; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; font-family: inherit; box-sizing: border-box; }
.mono { font-family: Consolas, Menlo, monospace; font-size: 12px; }
.mono.invalid { border-color: #fa541c; background: #fff1f0; }
.mono.invalid:focus { outline: 2px solid rgba(250,84,28,.3); }

/* 预览视图（与前台详情页视觉一致） */
.preview .preview-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.preview .preview-bar h2 { font-size: 16px; margin: 0; }
.preview .detail { background: #fff; border: 1px solid #f0f0f0; border-radius: 10px; padding: 20px; }
.preview .breadcrumb { font-size: 13px; color: #999; margin-bottom: 12px; }
.preview .title { font-size: 22px; margin-bottom: 8px; }
.preview .summary { color: #666; margin-bottom: 10px; }
.preview .meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 13px; color: #999; margin-bottom: 16px; align-items: center; }
.preview .expire { color: #fa541c; font-weight: 600; }
.preview .content { margin-bottom: 16px; }
.preview .text-block { margin-bottom: 12px; line-height: 1.7; }
.preview .block-h2 { font-size: 18px; margin: 22px 0 10px; padding-top: 6px; border-bottom: 1px solid #f0f0f0; padding-bottom: 8px; }
.preview .block-list { margin: 10px 0; }
.preview .list-item { padding: 5px 0 5px 18px; position: relative; color: #444; }
.preview .list-item::before { content: '•'; position: absolute; left: 2px; color: #1677ff; }
.preview .block-price { display: flex; align-items: baseline; gap: 10px; background: #fff7e6; border: 1px solid #ffd591; border-radius: 8px; padding: 12px 16px; margin: 14px 0; }
.preview .block-price .price { font-size: 26px; font-weight: 700; color: #fa541c; }
.preview .block-price .original { color: #bbb; text-decoration: line-through; font-size: 14px; }
.preview .block-price .spec { color: #666; font-size: 13px; }
.preview .block-quote { border-radius: 8px; padding: 12px 16px; margin: 14px 0; font-size: 14px; line-height: 1.7; }
.preview .block-quote.warn { background: #fff1f0; border: 1px solid #ffccc7; color: #cf1322; }
.preview .block-quote.info { background: #e6f4ff; border: 1px solid #91caff; color: #0958d9; }
.preview .block-image { margin: 14px 0; }
.preview .block-image img { max-width: 100%; border-radius: 8px; display: block; }
.preview .ad-block { background: #fffbe6; border: 1px dashed #faad14; border-radius: 8px; padding: 12px; margin: 12px 0; }
.preview .ad-label { display: inline-block; background: #faad14; color: #fff; font-size: 11px; padding: 1px 8px; border-radius: 4px; margin-bottom: 6px; }
.preview .ad-link { display: inline-block; margin-top: 6px; font-weight: 600; color: #1677ff; text-decoration: none; }
.preview .faq { margin-bottom: 16px; }
.preview .faq h2, .preview .friend h2 { font-size: 16px; margin-bottom: 8px; }
.preview .faq details { border-bottom: 1px solid #f0f0f0; padding: 8px 0; }
.preview .faq summary { cursor: pointer; font-weight: 500; color: #333; }
.preview .faq details p { color: #666; margin-top: 6px; font-size: 14px; }
.preview .links { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.preview .link-btn { display: inline-block; padding: 8px 20px; background: #1677ff; color: #fff; border-radius: 8px; text-decoration: none; font-size: 14px; }
.preview .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.preview .tag { background: #f5f5f5; color: #666; font-size: 12px; padding: 2px 10px; border-radius: 999px; }
.preview .friend-links a { margin-right: 14px; color: #1677ff; text-decoration: none; }
.row { display: flex; flex-wrap: wrap; gap: 12px; }
.row label { flex: 1; min-width: 140px; }
.actions { display: flex; gap: 10px; margin-top: 6px; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th { text-align: left; color: #999; font-weight: 500; padding: 8px 6px; border-bottom: 1px solid #eee; }
.tbl td { padding: 10px 6px; border-bottom: 1px solid #f5f5f5; vertical-align: top; }
.title-cell { max-width: 320px; }
.title-cell a { color: #1677ff; text-decoration: none; font-weight: 500; }
.id { font-size: 11px; color: #bbb; margin-top: 2px; }
.badge { display: inline-block; font-size: 11px; padding: 1px 8px; border-radius: 999px; }
.badge.published { background: #e6f4ff; color: #1677ff; }
.badge.draft { background: #fff7e6; color: #d48806; }
.badge.scheduled { background: #f0f5ff; color: #2f54eb; margin-left: 4px; }
.badge.review { background: #fff7e6; color: #d4380d; margin-left: 4px; }
.badge.expired { background: #fff1f0; color: #fa541c; }
.muted { color: #999; }
.mini { padding: 3px 10px; border: 1px solid #ddd; background: #fff; border-radius: 6px; cursor: pointer; font-size: 12px; margin-right: 6px; }
.mini.danger { color: #fa541c; border-color: #ffccc7; }
.mini.danger:hover { background: #fff1f0; }
.empty { text-align: center; color: #999; padding: 30px 0; }
.hint { color: #999; font-size: 12px; margin-top: 10px; }
.warn { color: #fa541c; }
.warn code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; }

.batch-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.batch-head h2 { font-size: 16px; margin: 0; }
.batch .actions { margin: 12px 0; flex-wrap: wrap; }
.batch-log { background: #f5f5f5; border-radius: 6px; padding: 10px; font-size: 12px; white-space: pre-wrap; max-height: 200px; overflow: auto; margin: 10px 0; }
.batch-list { display: flex; flex-direction: column; gap: 10px; }
.batch-item { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; border: 1px solid #eee; border-radius: 8px; padding: 10px 12px; }
.batch-item.busy { background: #f0f5ff; }
.batch-item.error { background: #fff1f0; border-color: #ffccc7; }
.batch-item.done { background: #f6ffed; border-color: #d9f7be; }
.chk { display: flex; align-items: center; gap: 4px; font-size: 13px; min-width: 34px; }
.bi-main { flex: 1; min-width: 220px; }
.bi-title { font-size: 14px; font-weight: 500; color: #333; margin: 0 0 4px; }
.bi-summary { font-size: 12px; color: #888; margin: 0 0 4px; }
.bi-main details { font-size: 12px; }
.bi-main details summary { cursor: pointer; color: #999; }
.bi-main details pre { background: #fafafa; padding: 8px; border-radius: 6px; white-space: pre-wrap; max-height: 120px; overflow: auto; }
.bi-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.bi-state { font-size: 12px; padding: 2px 10px; border-radius: 999px; background: #f0f0f0; color: #666; }
.bi-state.done { background: #d9f7be; color: #389e0d; }
.bi-state.busy { background: #e6f4ff; color: #1677ff; }
.bi-state.error { background: #ffccc7; color: #cf1322; }
.bi-error { flex-basis: 100%; color: #fa541c; font-size: 12px; margin: 0; }

@media (max-width: 600px) {
  .tbl { font-size: 12px; }
  .title-cell { max-width: 180px; }
  .toolbar { flex-direction: column; align-items: stretch; }
  .row { flex-direction: column; gap: 0; }
}
</style>
