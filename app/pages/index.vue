<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

const route = useRoute()
const router = useRouter()

// GEO：站点级 WebSite + SearchAction（SiteLinksSearchBox，喂给搜索引擎和 AI 爬虫）
useHead(() => ({
  title: 'AI 文章站 - 优惠攻略、好物推荐、副业指南',
  link: [{ rel: 'canonical', href: 'https://www.wcbblll.cc/' }],
  meta: [
    { name: 'description', content: 'AI 文章站：实时优惠攻略、好物推荐、省钱技巧与副业指南，每日更新。' },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'AI 文章站' },
    { property: 'og:url', content: 'https://www.wcbblll.cc' },
    { property: 'og:title', content: 'AI 文章站' },
    { property: 'og:description', content: '优惠攻略、好物推荐、副业指南，每日更新。' },
    { property: 'og:image', content: 'https://www.wcbblll.cc/og-cover.png' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'AI 文章站' },
    { name: 'twitter:description', content: '优惠攻略、好物推荐、副业指南，每日更新。' },
    { name: 'twitter:image', content: 'https://www.wcbblll.cc/og-cover.png' },
  ],
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify([{
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'AI 文章站',
      alternateName: 'wcbblll.cc',
      url: 'https://www.wcbblll.cc',
      inLanguage: 'zh-CN',
      description: 'AI 文章站：优惠攻略、好物推荐、副业指南，每日更新。',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://www.wcbblll.cc/?q={search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
    }]),
  }],
}))

// 分类 tab（配置驱动：app/config/site.ts）；"全部"为显式 tab（点分类可随时回来）
import { SITE_CATEGORIES, SITE_BANNERS } from '../config/site'
const categories = ref(['全部', ...SITE_CATEGORIES])
const { data: catCounts } = await useFetch('/api/categories', { key: 'cat-counts' })
// 分类状态与 URL ?cat= 双向同步（分享/刷新/搜索引擎落点保持一致）
const catFromUrl = (route.query.cat as string) || ''
const active = ref(categories.value.includes(catFromUrl) ? catFromUrl : '全部')
const perPage = 20

// 搜索词与 URL ?q= 同步
const kw = ref((route.query.q as string) || '')
const isSearching = computed(() => !!kw.value)
const cursor = ref('')
const searchPage = ref(1)

// 列表数据：搜索态走 /api/articles/search（OFFSET 翻页），否则 /api/articles（游标分页）
const { data, status, refresh } = await useFetch(isSearching.value ? '/api/articles/search' : '/api/articles', {
  query: computed(() => {
    if (isSearching.value) return { q: kw.value, page: searchPage.value, limit: perPage }
    return { category: active.value === '全部' ? '' : active.value, cursor: cursor.value, limit: perPage }
  }),
  key: computed(() => (isSearching.value ? `search-${kw.value}-${searchPage.value}` : `list-${active.value}-${cursor.value}`)),
})

// GEO：文章列表 ItemList 结构化（列表有数据时注入）
watch(data, (d: any) => {
  const list = d?.list || []
  if (!list.length) return
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'AI 文章站' + (active.value === '全部' ? '' : ' - ' + active.value),
    numberOfItems: list.length,
    itemListElement: list.map((a: any, i: number) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://www.wcbblll.cc/article/${a.id}`,
      name: a.title,
    })),
  }
  useHead({
    script: [{ type: 'application/ld+json', innerHTML: JSON.stringify([itemList]) }],
  })
})

function switchTab(c: string) {
  // "全部"为显式 tab：点分类切分类，点"全部"回全部
  active.value = c
  kw.value = ''
  cursor.value = ''
  searchPage.value = 1
  router.replace({ query: { ...route.query, cat: c === '全部' ? undefined : c, q: undefined } })
  refresh()
}

// 搜索输入防抖（350ms，输入即搜；URL ?q= 同步）
let debounceTimer: ReturnType<typeof setTimeout> | null = null
watch(kw, (v) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (v.trim() !== ((route.query.q as string) || '')) doSearch()
  }, 350)
})

function doSearch() {
  const q = kw.value.trim()
  searchPage.value = 1
  router.replace({ query: { ...route.query, q: q || undefined, cat: undefined } })
  refresh()
}

// 加载更多：搜索态走 OFFSET 翻页，列表态走游标；loading 态防重复点击
const loadMoreBusy = ref(false)
async function loadMore() {
  if (loadMoreBusy.value) return
  if (isSearching.value) {
    if (!data.value?.hasMore) return
    loadMoreBusy.value = true
    try {
      searchPage.value = (data.value?.nextPage || searchPage.value + 1)
      await refresh()
    } finally {
      loadMoreBusy.value = false
    }
    return
  }
  if (!data.value?.nextCursor) return
  loadMoreBusy.value = true
  try {
    cursor.value = data.value.nextCursor
    await refresh()
  } finally {
    loadMoreBusy.value = false
  }
}

const hasMore = computed(() => (isSearching.value ? !!data.value?.hasMore : !!data.value?.nextCursor))

watch(
  () => route.query.q,
  (v) => {
    if (v !== kw.value) kw.value = (v as string) || ''
  },
)

// 分类与 URL 同步（浏览器前进/后退、外部 ?cat= 链接）
watch(
  () => route.query.cat,
  (v) => {
    const c = (v as string) || ''
    if (categories.value.includes(c)) {
      if (c !== active.value) { active.value = c; cursor.value = ''; searchPage.value = 1; refresh() }
    } else if (active.value !== '全部') {
      active.value = '全部'; cursor.value = ''; searchPage.value = 1; refresh()
    }
  },
)

// —— 列表项收藏（CSR 补状态：不动 SSR 缓存；星标点击直接切换） ——
const favSet = ref<Set<string>>(new Set())
const favBusyId = ref('')
function getFp() {
  let f = localStorage.getItem('article_fp')
  if (!f) {
    f = 'fp-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('article_fp', f)
  }
  return f
}
onMounted(async () => {
  try {
    const fp = getFp()
    const res = await $fetch('/api/favorites', { query: { fp, idsOnly: 1 } })
    favSet.value = new Set((res.ids || []) as string[])
  } catch { /* 收藏状态拉取失败不影响列表展示 */ }
})
async function toggleFav(id: string) {
  if (favBusyId.value) return
  const fp = getFp()
  const on = favSet.value.has(id)
  favBusyId.value = id
  try {
    await $fetch(`/api/articles/${id}/favorite`, { method: 'POST', body: { fp, action: on ? 'remove' : 'add' } })
    if (on) favSet.value.delete(id)
    else favSet.value.add(id)
  } catch { /* 静默失败，不打断阅读 */ }
  finally { favBusyId.value = '' }
}

// 搜索无结果 → 提交选题（公开投稿，进素材队列，每天 8 点自动生成引流文）
const topic = ref('')
const topicBusy = ref(false)
const topicMsg = ref('')
async function submitTopic() {
  const t = topic.value.trim()
  if (t.length < 4) { topicMsg.value = '选题至少 4 个字'; return }
  topicBusy.value = true
  topicMsg.value = ''
  try {
    await $fetch('/api/submit-topic', { method: 'POST', body: { fp: getFp(), topic: t } })
    topicMsg.value = '选题已收到，每天 8 点自动生成，稍后来看'
    topic.value = ''
  } catch (e: any) {
    topicMsg.value = e?.data?.statusMessage || '提交失败，请重试'
  } finally {
    topicBusy.value = false
  }
}
</script>

<template>
  <div class="home">
    <!-- 顶部公告（配置驱动） -->
    <div v-if="SITE_BANNERS.length" class="banners">
      <NuxtLink v-for="(b, i) in SITE_BANNERS" :key="i" :to="b.link || '/'" class="banner" :class="{ highlight: b.highlight }">
        {{ b.text }}
      </NuxtLink>
    </div>

    <!-- 搜索框 -->
    <div class="search-bar">
      <form @submit.prevent="doSearch">
        <input v-model="kw" type="search" placeholder="搜索文章，如：牛奶 / 领券 / 网盘" class="input search-input" />
        <button type="submit" class="btn search-btn">搜索</button>
      </form>
    </div>

    <div class="tabs">
      <button
        v-for="c in categories"
        :key="c"
        class="tab"
        :class="{ active: !isSearching && active === c, empty: c !== '全部' && !(catCounts?.counts?.[c]) }"
        :disabled="c !== '全部' && !(catCounts?.counts?.[c])"
        :title="c === '全部' || (catCounts?.counts?.[c]) ? '' : '该分类内容整理中'"
        @click="switchTab(c)"
      >{{ c }}</button>
    </div>

    <div v-if="status === 'pending'" class="loading-skeleton" aria-hidden="true">
      <div v-for="i in 4" :key="i" class="sk-item">
        <div class="sk-thumb"></div>
        <div class="sk-body"><div class="sk-line w60"></div><div class="sk-line w90"></div><div class="sk-line w40"></div></div>
      </div>
    </div>
    <div v-else-if="data && data.list.length" class="article-list">
      <p v-if="isSearching" class="search-info">「{{ kw }}」搜索结果 {{ data.list.length }} 条</p>
      <NuxtLink v-for="a in data.list" :key="a.id" :to="`/article/${a.id}`" class="card article-item">
        <div v-if="a.firstImage" class="thumb">
          <img :src="a.firstImage" :alt="a.title" loading="lazy" referrerpolicy="no-referrer" />
        </div>
        <div class="info">
          <h3 class="title">{{ a.title }}</h3>
          <p class="summary">{{ a.summary }}</p>
          <div class="meta">
            <span class="category">{{ a.category }}</span>
            <span v-if="a.updatedAt" class="date">{{ (a.updatedAt || '').slice(0, 10) }}</span>
            <span v-if="a.expiresAt" class="expire">有效期至 {{ a.expiresAt }}</span>
            <button
              class="star"
              :class="{ on: favSet.has(a.id) }"
              :disabled="!!favBusyId"
              :aria-label="(favSet.has(a.id) ? '取消收藏' : '收藏') + '：' + a.title"
              @click.prevent="toggleFav(a.id)"
            >
              <svg viewBox="0 0 24 24" :fill="favSet.has(a.id) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.7-5.2 2.7 1-5.9L3.5 9.7l5.9-.9z"/></svg>
            </button>
          </div>
        </div>
      </NuxtLink>

      <div v-if="hasMore" class="pager">
        <button :disabled="loadMoreBusy" @click="loadMore">{{ loadMoreBusy ? '加载中…' : '加载更多' }}</button>
      </div>
      <p v-else-if="data && data.list.length" class="list-end">已加载全部{{ isSearching ? '结果' : '内容' }}</p>
    </div>
    <div v-else class="empty">
      <template v-if="isSearching">
        <p>未找到「{{ kw }}」相关文章</p>
        <div class="topic-submit">
          <input v-model="topic" type="text" maxlength="60" placeholder="提交你想看的选题，如：XX 使用攻略" />
          <button class="btn search-btn" :disabled="topicBusy || topic.trim().length < 4" @click="submitTopic">{{ topicBusy ? '提交中…' : '提交选题' }}</button>
          <p v-if="topicMsg" class="topic-msg">{{ topicMsg }}</p>
          <p class="hint">收到后会进入自动生成队列，每天 8 点产出文章</p>
        </div>
      </template>
      <template v-else>暂无文章</template>
    </div>
  </div>
</template>

<style scoped>
/* 搜索 */
.banners { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.banner {
  display: block;
  padding: 10px 16px;
  border-radius: 12px;
  background: var(--primary-weak);
  border: 1px solid #bfdbfe;
  color: var(--primary);
  font-size: 13px;
  text-decoration: none;
  transition: background .2s;
}
.banner:hover { background: #dbeafe; }
.banner.highlight { background: linear-gradient(135deg, #eff6ff, #dbeafe); font-weight: 600; }

.search-bar { margin-bottom: 18px; }
.search-bar form { display: flex; gap: 10px; }
.search-input { flex: 1; padding: 11px 16px; border-radius: 12px; box-shadow: var(--shadow-sm); }
.search-btn { padding: 11px 22px; border-radius: 12px; font-weight: 500; }

/* 分类 tab（分段控件：浅灰容器 + 白色选中滑块） */
.tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: #eef2f7;
  border: 1px solid #e5eaf1;
  border-radius: 14px;
  margin-bottom: 20px;
  width: 100%;
}
.tab {
  flex: 1;
  min-width: 0;
  padding: 9px 10px;
  border: none;
  background: transparent;
  border-radius: 11px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted);
  white-space: nowrap;
  transition: color .2s, background .2s, box-shadow .2s;
}
.tab:hover { color: var(--primary); }
.tab.active {
  background: #fff;
  color: var(--primary);
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(15, 23, 42, .10);
}
.tab:disabled { opacity: .45; cursor: not-allowed; }
.tab:disabled:hover { color: var(--text-muted); }

/* 文章列表 */
.article-list { display: flex; flex-direction: column; gap: 14px; }
.article-item {
  display: flex;
  gap: 14px;
  text-decoration: none;
  color: inherit;
  padding: 18px 20px;
  transition: box-shadow .25s ease, transform .25s ease;
}
.article-item:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
.thumb {
  width: 120px;
  height: 82px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: #eef2f7;
  align-self: center;
}
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.info { min-width: 0; flex: 1; }
.search-info { font-size: 13px; color: var(--text-muted); margin-bottom: 2px; }
.title { font-size: 16px; font-weight: 650; margin-bottom: 6px; color: var(--text); }
.summary {
  font-size: 14px;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.meta { margin-top: 10px; display: flex; gap: 10px; font-size: 12px; align-items: center; flex-wrap: wrap; }
.category {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--primary-weak);
  color: var(--primary);
  font-weight: 500;
}
.expire {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #d97706;
  background: var(--accent-weak);
  padding: 2px 10px;
  border-radius: 999px;
}
.expire::before {
  content: '';
  width: 11px;
  height: 11px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23d97706' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='13' r='8'/%3E%3Cpath d='M12 9.5v3.5l2.5 1.5'/%3E%3Cpath d='M4.5 4.5 3 6M19.5 4.5 21 6'/%3E%3C/svg%3E") center/contain no-repeat;
}
.date { color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px; }
.date::before {
  content: '';
  width: 11px;
  height: 11px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4.5' width='18' height='16.5' rx='3'/%3E%3Cpath d='M8 2.5v4M16 2.5v4M3 10h18'/%3E%3C/svg%3E") center/contain no-repeat;
}

/* 骨架屏 */
.loading-skeleton { display: flex; flex-direction: column; gap: 14px; }
.sk-item {
  display: flex;
  gap: 14px;
  padding: 18px 20px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
.sk-thumb {
  width: 120px;
  height: 82px;
  border-radius: 10px;
  flex-shrink: 0;
  align-self: center;
  background: linear-gradient(90deg, #eef2f7 25%, #f8fafc 50%, #eef2f7 75%);
  background-size: 200% 100%;
  animation: sk 1.2s ease-in-out infinite;
}
.sk-body { flex: 1; display: flex; flex-direction: column; gap: 10px; justify-content: center; }
.sk-line { height: 13px; border-radius: 6px; background: linear-gradient(90deg, #eef2f7 25%, #f8fafc 50%, #eef2f7 75%); background-size: 200% 100%; animation: sk 1.2s ease-in-out infinite; }
.sk-line.w60 { width: 60%; } .sk-line.w90 { width: 90%; } .sk-line.w40 { width: 40%; }
@keyframes sk { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* 分页 */
.pager { text-align: center; margin-top: 20px; }
.list-end { text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 18px; }
/* 列表项收藏星标 */
.star {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 50%;
  color: #9ca3af;
  cursor: pointer;
  flex-shrink: 0;
  transition: color .2s, background .2s, transform .15s;
}
.star svg { width: 15px; height: 15px; }
.star:hover { color: #f59e0b; background: var(--accent-weak); transform: scale(1.08); }
.star.on { color: #f59e0b; }
.star:disabled { opacity: .5; cursor: wait; }
.pager button {
  padding: 10px 28px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  color: var(--primary);
  font-weight: 500;
  transition: all .2s;
  box-shadow: var(--shadow-sm);
}
.pager button:hover:not(:disabled) { color: #fff; background: linear-gradient(180deg, var(--primary), var(--primary-strong)); border-color: transparent; }
.pager button:disabled { opacity: .5; cursor: not-allowed; }

.loading, .empty { text-align: center; color: var(--text-muted); padding: 10px 0; font-size: 14px; }
.topic-submit { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 14px; }
.topic-submit input {
  width: min(320px, 72vw);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 14px;
}
.topic-msg { width: 100%; color: var(--primary); font-size: 13px; margin-top: 6px; }

@media (max-width: 600px) {
  .tabs { border-radius: 12px; }
  .tab { padding: 8px 6px; font-size: 13px; }
  .search-btn { padding: 11px 16px; }
  .article-item { padding: 15px 16px; }
  .thumb { width: 96px; height: 68px; border-radius: 8px; }
  .sk-thumb { width: 96px; height: 68px; }
}
</style>
