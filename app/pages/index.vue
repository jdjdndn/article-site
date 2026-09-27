<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const route = useRoute()
const router = useRouter()

// GEO：站点级 WebSite JSON-LD
useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify([{
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'AI 文章站',
      url: 'https://article.wcbblll.cc',
    }]),
  }],
})

// 分类 tab（后续可从 API 动态生成）
const categories = ref(['全部', '优惠', '攻略', '好物', '副业'])
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

function switchTab(c: string) {
  active.value = c
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
.search-bar { margin-bottom: 16px; }
.search-bar form { display: flex; gap: 8px; }
.search-input {
  flex: 1; padding: 9px 14px; border: 1px solid #ddd; border-radius: 8px;
  font-size: 14px; font-family: inherit; outline: none;
}
.search-input:focus { border-color: #1677ff; }
.search-btn {
  padding: 9px 20px; background: #1677ff; color: #fff; border: none;
  border-radius: 8px; cursor: pointer; font-size: 14px;
}
.tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.tab {
  padding: 6px 16px; border: 1px solid #ddd; background: #fff; border-radius: 999px;
  cursor: pointer; font-size: 14px; color: #555;
}
.tab.active { background: #1677ff; color: #fff; border-color: #1677ff; }
.article-list { display: flex; flex-direction: column; gap: 12px; }
.article-item { display: block; text-decoration: none; color: inherit; transition: box-shadow .2s; }
.article-item:hover { box-shadow: 0 2px 12px rgba(0,0,0,.08); }
.search-info { font-size: 13px; color: #999; }
.title { font-size: 16px; margin-bottom: 6px; }
.summary { font-size: 14px; color: #666; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.meta { margin-top: 8px; display: flex; gap: 10px; font-size: 12px; color: #999; }
.expire { color: #fa541c; }
.pager { text-align: center; margin-top: 16px; }
.pager button { padding: 8px 24px; border-radius: 8px; border: 1px solid #ddd; background: #fff; cursor: pointer; }
.pager button:disabled { opacity: .5; cursor: not-allowed; }
.loading, .empty { text-align: center; color: #999; padding: 40px 0; }

@media (max-width: 600px) {
  .tab { padding: 5px 12px; font-size: 13px; }
  .search-btn { padding: 9px 14px; }
}
</style>
