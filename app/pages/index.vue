<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const route = useRoute()
const router = useRouter()

// GEO：站点级 WebSite + SearchAction（SiteLinksSearchBox，喂给搜索引擎和 AI 爬虫）
useHead(() => ({
  title: 'AI 文章站 - 优惠攻略、好物推荐、副业指南',
  meta: [
    { name: 'description', content: 'AI 文章站：实时优惠攻略、好物推荐、省钱技巧与副业指南，每日更新。' },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'AI 文章站' },
    { property: 'og:url', content: 'https://www.wcbblll.cc' },
    { property: 'og:title', content: 'AI 文章站' },
    { property: 'og:description', content: '优惠攻略、好物推荐、副业指南，每日更新。' },
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

// 分类 tab（配置驱动：app/config/site.ts）
import { SITE_CATEGORIES, SITE_BANNERS } from '../config/site'
const categories = ref([...SITE_CATEGORIES])
const active = ref('全部')
const perPage = 20

// 搜索词与 URL ?q= 同步
const kw = ref((route.query.q as string) || '')
const isSearching = computed(() => !!kw.value)
const cursor = ref('')

// 列表数据：搜索态走 /api/articles/search，否则 /api/articles（游标分页）
const { data, status, refresh } = await useFetch(isSearching.value ? '/api/articles/search' : '/api/articles', {
  query: computed(() => {
    if (isSearching.value) return { q: kw.value, limit: perPage }
    return { category: active.value === '全部' ? '' : active.value, cursor: cursor.value, limit: perPage }
  }),
  key: computed(() => (isSearching.value ? `search-${kw.value}` : `list-${active.value}-${cursor.value}`)),
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
  // 再点已选分类 = 取消过滤，回到"全部"
  active.value = active.value === c ? '全部' : c
  kw.value = ''
  cursor.value = ''
  router.replace({ query: { ...route.query, q: undefined } })
  refresh()
}

function doSearch() {
  const q = kw.value.trim()
  if (q) {
    router.replace({ query: { ...route.query, q } })
  } else {
    router.replace({ query: { ...route.query, q: undefined } })
  }
  refresh()
}

function loadMore() {
  if (data.value?.nextCursor) {
    cursor.value = data.value.nextCursor
    refresh()
  }
}

watch(
  () => route.query.q,
  (v) => {
    if (v !== kw.value) kw.value = (v as string) || ''
  },
)
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
        <input v-model="kw" type="search" placeholder="搜索文章，如：牛奶 / 领券 / 网盘" class="search-input" />
        <button type="submit" class="search-btn">搜索</button>
      </form>
    </div>

    <div class="tabs">
      <button
        v-for="c in categories"
        :key="c"
        class="tab"
        :class="{ active: !isSearching && active === c }"
        @click="switchTab(c)"
      >{{ c }}</button>
    </div>

    <div v-if="status === 'pending'" class="loading">加载中…</div>
    <div v-else-if="data && data.list.length" class="article-list">
      <p v-if="isSearching" class="search-info">「{{ kw }}」搜索结果 {{ data.list.length }} 条</p>
      <NuxtLink v-for="a in data.list" :key="a.id" :to="`/article/${a.id}`" class="card article-item">
        <h3 class="title">{{ a.title }}</h3>
        <p class="summary">{{ a.summary }}</p>
        <div class="meta">
          <span class="category">{{ a.category }}</span>
          <span v-if="a.expiresAt" class="expire">有效期至 {{ a.expiresAt }}</span>
        </div>
      </NuxtLink>

      <div class="pager">
        <button :disabled="!data.hasMore" @click="loadMore">加载更多</button>
      </div>
    </div>
    <div v-else class="empty">
      {{ isSearching ? `未找到「${kw}」相关文章` : '暂无文章' }}
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
.search-input {
  flex: 1;
  padding: 11px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  background: #fff;
  color: var(--text);
  transition: border-color .2s, box-shadow .2s;
  box-shadow: var(--shadow-sm);
}
.search-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, .12); }
.search-btn {
  padding: 11px 22px;
  background: linear-gradient(180deg, var(--primary), var(--primary-strong));
  color: #fff;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(37, 99, 235, .25);
  transition: opacity .2s, transform .15s;
}
.search-btn:hover { opacity: .92; }
.search-btn:active { transform: translateY(1px); }

/* 分类 tab */
.tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.tab {
  padding: 7px 18px;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted);
  transition: all .2s;
}
.tab:hover { color: var(--primary); border-color: #bfdbfe; }
.tab.active {
  background: linear-gradient(180deg, var(--primary), var(--primary-strong));
  color: #fff;
  border-color: transparent;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(37, 99, 235, .3);
}

/* 文章列表 */
.article-list { display: flex; flex-direction: column; gap: 14px; }
.article-item {
  display: block;
  text-decoration: none;
  color: inherit;
  padding: 18px 20px;
  transition: box-shadow .25s ease, transform .25s ease;
}
.article-item:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
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
.meta { margin-top: 10px; display: flex; gap: 10px; font-size: 12px; align-items: center; }
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
.expire::before { content: '⏰'; font-size: 11px; }

/* 分页 */
.pager { text-align: center; margin-top: 20px; }
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

.loading, .empty { text-align: center; color: var(--text-muted); padding: 48px 0; font-size: 14px; }

@media (max-width: 600px) {
  .tab { padding: 6px 13px; font-size: 13px; }
  .search-btn { padding: 11px 16px; }
  .article-item { padding: 15px 16px; }
}
</style>
