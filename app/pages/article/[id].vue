<script setup lang="ts">
const route = useRoute()
const id = computed(() => route.params.id as string)

const { data, status, error } = await useFetch(`/api/articles/${id.value}`, {
  key: `article-${id.value}`,
})

function isAd(block: any) { return block?.type === 'ad' }
</script>

<template>
  <div class="detail">
    <div v-if="status === 'pending'" class="loading">加载中…</div>

    <div v-else-if="error || !data?.article" class="empty">
      {{ error?.statusMessage || '文章不存在或已下架' }}
    </div>

    <div v-else>
      <!-- 头部 -->
      <nav class="breadcrumb">
        <NuxtLink to="/">首页</NuxtLink>
        <span>/</span>
        <span>{{ data.article.category || '文章' }}</span>
      </nav>

      <h1 class="title">{{ data.article.title }}</h1>
      <p class="summary">{{ data.article.summary }}</p>
      <div class="meta">
        <span v-if="data.article.expiresAt" class="expire">⏰ 优惠截止：{{ data.article.expiresAt }}</span>
        <span class="time">更新于 {{ data.article.updatedAt }}</span>
      </div>

      <!-- 正文（结构化段落：text / ad 软文） -->
      <article class="content card">
        <template v-for="(block, i) in data.article.content" :key="i">
          <div v-if="isAd(block)" class="ad-block">
            <span class="ad-label">{{ block.label || '广告' }}</span>
            <p>{{ block.text }}</p>
            <a v-if="block.link" :href="block.link" target="_blank" rel="noopener nofollow" class="ad-link">去看看 →</a>
          </div>
          <p v-else class="text-block">{{ block.text }}</p>
        </template>
      </article>

      <!-- 链接按钮 -->
      <div v-if="data.article.links?.length" class="links">
        <a
          v-for="(l, i) in data.article.links"
          :key="i"
          :href="l.url"
          target="_blank"
          rel="noopener nofollow"
          class="link-btn"
        >{{ l.label }}</a>
      </div>

      <!-- 相关文章（6.2 判定） -->
      <section v-if="data.related?.length" class="related card">
        <h2>相关文章</h2>
        <NuxtLink v-for="r in data.related" :key="r.id" :to="`/article/${r.id}`" class="related-item">
          {{ r.title }}
        </NuxtLink>
      </section>

      <!-- 底部友链 -->
      <section class="friend card">
        <h2>友情链接</h2>
        <div class="friend-links">
          <template v-if="data.article.friendLinks?.length">
            <a v-for="(f, i) in data.article.friendLinks" :key="i" :href="f.url" target="_blank" rel="noopener">{{ f.name }}</a>
          </template>
          <template v-else>
            <a href="https://jdjdndn.github.io" target="_blank" rel="noopener">jdjdndn.github.io</a>
            <a href="https://wcbblll.cc" target="_blank" rel="noopener">wcbblll.cc</a>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.breadcrumb { font-size: 13px; color: #999; margin-bottom: 12px; }
.breadcrumb a { color: #1677ff; text-decoration: none; }
.title { font-size: 22px; margin-bottom: 8px; }
.summary { color: #666; margin-bottom: 10px; }
.meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 13px; color: #999; margin-bottom: 20px; }
.expire { color: #fa541c; font-weight: 600; }
.content { margin-bottom: 20px; }
.text-block { margin-bottom: 12px; }
.ad-block { background: #fffbe6; border: 1px dashed #faad14; border-radius: 8px; padding: 12px; margin: 12px 0; }
.ad-label { display: inline-block; background: #faad14; color: #fff; font-size: 11px; padding: 1px 8px; border-radius: 4px; margin-bottom: 6px; }
.ad-link { display: inline-block; margin-top: 6px; font-weight: 600; }
.links { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.link-btn { display: inline-block; padding: 8px 20px; background: #1677ff; color: #fff; border-radius: 8px; text-decoration: none; font-size: 14px; }
.link-btn:hover { opacity: .9; }
.related { margin-bottom: 20px; }
.related h2, .friend h2 { font-size: 16px; margin-bottom: 10px; }
.related-item { display: block; padding: 6px 0; color: #1677ff; text-decoration: none; }
.friend-links a { margin-right: 14px; color: #1677ff; text-decoration: none; }
.loading, .empty { text-align: center; color: #999; padding: 40px 0; }

@media (max-width: 600px) {
  .title { font-size: 18px; }
  .link-btn { width: 100%; text-align: center; }
}
</style>
