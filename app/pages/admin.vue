<script setup lang="ts">
import { reactive, ref, computed } from 'vue'

const route = useRoute()
const key = computed(() => (route.query.key as string) || '')

// 视图状态：list（文章管理）/ trash（回收站）；mode：list / create / edit
const tab = ref<'list' | 'trash'>('list')
const mode = ref<'list' | 'create' | 'edit'>('list')
const articles = ref<any[]>([])
const trash = ref<any[]>([])
const editingId = ref('')
const msg = ref('')
const busy = ref(false)

const emptyForm = {
  title: '', summary: '', category: '优惠', status: 'draft', expiresAt: '',
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
function flash(m: string) {
  msg.value = m
  setTimeout(() => (msg.value = ''), 2500)
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
    expiresAt: art.expiresAt || '',
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
  busy.value = true
  try {
    if (mode.value === 'create') {
      const res = await api('/api/admin/articles', { method: 'POST', body: { ...form } })
      flash(`已创建：${res.id}`)
    } else {
      await api(`/api/admin/articles/${editingId.value}`, { method: 'PUT', body: { ...form } })
      flash('已保存')
    }
    mode.value = 'list'
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

function switchTab(t: 'list' | 'trash') {
  tab.value = t
  if (t === 'list') loadList()
  else loadTrash()
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
        </div>
        <button v-if="tab === 'list' && mode === 'list'" class="primary" @click="openCreate">＋ 新建文章</button>
        <button v-if="mode !== 'list'" class="ghost" @click="mode = 'list'">← 返回列表</button>
      </div>

      <p v-if="msg" class="flash">{{ msg }}</p>

      <!-- 表单（新建/编辑） -->
      <form v-if="mode !== 'list'" class="card form" @submit.prevent="save">
        <h2>{{ mode === 'create' ? '新建文章' : '编辑文章' }}</h2>
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
          <label>状态
            <select v-model="form.status">
              <option value="draft">草稿</option>
              <option value="published">发布</option>
            </select>
          </label>
          <label>过期时间（可选）
            <input v-model="form.expiresAt" placeholder="2026-12-31" />
          </label>
        </div>
        <label>正文（JSON 段落数组：text 正文 / ad 软文）
          <textarea v-model="form.content" rows="8" class="mono"></textarea>
        </label>
        <label>链接（JSON [{label,url}]）
          <textarea v-model="form.links" rows="3" class="mono"></textarea>
        </label>
        <label>标签（JSON 数组）
          <textarea v-model="form.tags" rows="2" class="mono"></textarea>
        </label>
        <label>FAQ（JSON [{q,a}]）
          <textarea v-model="form.faq" rows="2" class="mono"></textarea>
        </label>
        <label>相关文章（JSON id 数组）
          <textarea v-model="form.relatedIds" rows="2" class="mono"></textarea>
        </label>
        <label>文章级友链（JSON [{name,url}]）
          <textarea v-model="form.friendLinks" rows="2" class="mono"></textarea>
        </label>
        <div class="actions">
          <button type="submit" class="primary" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</button>
          <button type="button" class="ghost" @click="mode = 'list'">取消</button>
        </div>
      </form>

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
              <td><span class="badge" :class="a.status">{{ a.status }}</span></td>
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
.form label { display: block; margin-bottom: 10px; font-size: 13px; color: #555; }
.form input, .form textarea, .form select { width: 100%; margin-top: 4px; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; font-family: inherit; box-sizing: border-box; }
.mono { font-family: Consolas, Menlo, monospace; font-size: 12px; }
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
.badge.expired { background: #fff1f0; color: #fa541c; }
.muted { color: #999; }
.mini { padding: 3px 10px; border: 1px solid #ddd; background: #fff; border-radius: 6px; cursor: pointer; font-size: 12px; margin-right: 6px; }
.mini.danger { color: #fa541c; border-color: #ffccc7; }
.mini.danger:hover { background: #fff1f0; }
.empty { text-align: center; color: #999; padding: 30px 0; }
.hint { color: #999; font-size: 12px; margin-top: 10px; }
.warn { color: #fa541c; }
.warn code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; }

@media (max-width: 600px) {
  .tbl { font-size: 12px; }
  .title-cell { max-width: 180px; }
  .toolbar { flex-direction: column; align-items: stretch; }
  .row { flex-direction: column; gap: 0; }
}
</style>
