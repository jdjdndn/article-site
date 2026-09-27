<script setup lang="ts">
import { ref } from 'vue'

// 分类 tab（后续可从 API 动态生成）
const categories = ref(['全部', '优惠', '攻略', '好物', '副业'])
const active = ref('全部')
const page = ref(1)
const perPage = 20

// 列表数据（游标分页）
const { data, status } = await useFetch('/api/articles', {
  query: computed(() => ({ category: active.value === '全部' ? '' : active.value, cursor: '', limit: perPage })),
})

function switchTab(c: string) {
  active.value = c
  page.value = 1
}
</script>

<template>
  <div class="home">
    <div class="tabs">
      <button
        v-for="c in categories"
        :key="c"
        class="tab"
        :class="{ active: active === c }"
        @click="switchTab(c)"
      >{{ c }}</button>
    </div>

    <div v-if="status === 'pending'" class="loading">加载中…</div>
    <div v-else-if="data && data.list.length" class="article-list">
      <NuxtLink v-for="a in data.list" :key="a.id" :to="`/article/${a.id}`" class="card article-item">
        <h3 class="title">{{ a.title }}</h3>
        <p class="summary">{{ a.summary }}</p>
        <div class="meta">
          <span class="category">{{ a.category }}</span>
          <span v-if="a.expiresAt" class="expire">有效期至 {{ a.expiresAt }}</span>
        </div>
      </NuxtLink>

      <div class="pager">
        <button :disabled="!data.hasMore" @click="page++">加载更多</button>
      </div>
    </div>
    <div v-else class="empty">暂无文章</div>
  </div>
</template>

<style scoped>
.tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.tab {
  padding: 6px 16px; border: 1px solid #ddd; background: #fff; border-radius: 999px;
  cursor: pointer; font-size: 14px; color: #555;
}
.tab.active { background: #1677ff; color: #fff; border-color: #1677ff; }
.article-list { display: flex; flex-direction: column; gap: 12px; }
.article-item { display: block; text-decoration: none; color: inherit; transition: box-shadow .2s; }
.article-item:hover { box-shadow: 0 2px 12px rgba(0,0,0,.08); }
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
}
</style>
