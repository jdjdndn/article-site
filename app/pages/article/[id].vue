<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const route = useRoute()
const id = computed(() => route.params.id as string)

// 设备指纹（收藏身份，localStorage）
const fp = ref('')
function getFp() {
  if (!import.meta.client) return ''
  let f = localStorage.getItem('article_fp')
  if (!f) {
    f = 'fp-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('article_fp', f)
  }
  return f
}

const { data, status, error, refresh } = await useFetch(`/api/articles/${id.value}`, {
  key: `article-${id.value}`,
  query: computed(() => ({ fp: fp.value })),
})

const favorited = ref(false)
const favoriteCount = ref(0)

onMounted(() => {
  fp.value = getFp()
  if (fp.value) refresh().then(() => {
    favorited.value = !!data.value?.favorited
    favoriteCount.value = data.value?.favoriteCount ?? 0
  })
})

async function toggleFavorite() {
  if (!fp.value) return
  const action = favorited.value ? 'remove' : 'add'
  const res = await $fetch(`/api/articles/${id.value}/favorite`, {
    method: 'POST',
    body: { fp: fp.value, action },
  })
  favorited.value = res.favorited
  favoriteCount.value = res.count
}

function isAd(block: any) { return block?.type === 'ad' }
const isH2 = (b: any) => b?.type === 'h2'
const isList = (b: any) => b?.type === 'list'
const isPrice = (b: any) => b?.type === 'price'
const isQuote = (b: any) => b?.type === 'quote'
const isImage = (b: any) => b?.type === 'image'
// 文章模板：default / deal（商品带货）/ guide（攻略）/ faq（问答）
const tmpl = computed(() => {
  const t = data.value?.article?.template
  return ['deal', 'guide', 'faq'].includes(t) ? t : 'default'
})

// GEO：JSON-LD（Article 全字段 + BreadcrumbList + FAQPage）
useHead(() => {
  const a = data.value?.article
  if (!a) return {}
  const url = `https://www.wcbblll.cc/article/${a.id}`
  const ld: any[] = [{
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.summary,
    url,
    inLanguage: 'zh-CN',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished: a.createdAt,
    dateModified: a.updatedAt,
    articleSection: a.category || '文章',
    keywords: Array.isArray(a.tags) ? a.tags.join(',') : '',
    author: { '@type': 'Organization', name: 'AI 文章站', url: 'https://www.wcbblll.cc' },
    publisher: {
      '@type': 'Organization',
      name: 'AI 文章站',
      url: 'https://www.wcbblll.cc',
    },
  }, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: 'https://www.wcbblll.cc' },
      { '@type': 'ListItem', position: 2, name: a.category || '文章', item: `https://www.wcbblll.cc/?cat=${encodeURIComponent(a.category || '')}` },
      { '@type': 'ListItem', position: 3, name: a.title, item: url },
    ],
  }]
  if (a.faq?.length) {
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: a.faq.map((f: any) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    })
  }
  return {
    title: a.title,
    meta: [
      { name: 'description', content: a.summary },
      { property: 'og:type', content: 'article' },
      { property: 'og:url', content: url },
      { property: 'og:title', content: a.title },
      { property: 'og:description', content: a.summary },
      { property: 'og:site_name', content: 'AI 文章站' },
    ],
    script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(ld) }],
  }
})
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
        <button
          class="fav-btn"
          :class="{ on: favorited }"
          @click="toggleFavorite"
        >{{ favorited ? '★ 已收藏' : '☆ 收藏' }}（{{ favoriteCount }}）</button>
      </div>

      <!-- 正文（结构化块：text/h2/list/price/quote/ad/image，按模板布局） -->
      <article class="content card" :class="'tmpl-' + tmpl">
        <!-- deal 模板：购买入口前置 -->
        <div v-if="tmpl === 'deal' && data.article.links?.length" class="links top-links">
          <a
            v-for="(l, i) in data.article.links"
            :key="i"
            :href="l.url"
            target="_blank"
            rel="noopener nofollow"
            class="link-btn"
          >{{ l.label }}</a>
        </div>
        <!-- faq 模板：FAQ 前置 -->
        <section v-if="tmpl === 'faq' && data.article.faq?.length" class="faq">
          <h2>常见问题</h2>
          <details v-for="(f, i) in data.article.faq" :key="i">
            <summary>{{ f.q }}</summary>
            <p>{{ f.a }}</p>
          </details>
        </section>

        <template v-for="(block, i) in data.article.content" :key="i">
          <div v-if="isAd(block)" class="ad-block">
            <span class="ad-label">{{ block.label || '广告' }}</span>
            <p>{{ block.text }}</p>
            <a v-if="block.link" :href="block.link" target="_blank" rel="noopener nofollow" class="ad-link">去看看 →</a>
          </div>
          <h2 v-else-if="isH2(block)" class="block-h2">{{ block.text }}</h2>
          <div v-else-if="isList(block)" class="block-list">
            <p v-for="(item, j) in block.items" :key="j" class="list-item">{{ item }}</p>
          </div>
          <div v-else-if="isPrice(block)" class="block-price">
            <span class="price">¥{{ block.price }}</span>
            <span v-if="block.original" class="original">¥{{ block.original }}</span>
            <span v-if="block.spec" class="spec">{{ block.spec }}</span>
          </div>
          <div v-else-if="isQuote(block)" class="block-quote" :class="block.tone === 'warn' ? 'warn' : 'info'">{{ block.text }}</div>
          <figure v-else-if="isImage(block)" class="block-image">
            <img :src="block.url" :alt="block.alt || data.article.title" loading="lazy" />
          </figure>
          <p v-else class="text-block">{{ block.text }}</p>
        </template>

        <!-- 非 deal 模板：链接按钮放正文后 -->
        <div v-if="tmpl !== 'deal' && data.article.links?.length" class="links">
          <a
            v-for="(l, i) in data.article.links"
            :key="i"
            :href="l.url"
            target="_blank"
            rel="noopener nofollow"
            class="link-btn"
          >{{ l.label }}</a>
        </div>
      </article>

      <!-- FAQ（非 faq 模板：放正文后；GEO 问答对） -->
      <section v-if="tmpl !== 'faq' && data.article.faq?.length" class="faq card">
        <h2>常见问题</h2>
        <details v-for="(f, i) in data.article.faq" :key="i">
          <summary>{{ f.q }}</summary>
          <p>{{ f.a }}</p>
        </details>
      </section>

      <!-- 相关文章（6.2 判定） -->
      <section v-if="data.related?.length" class="related card">
        <h2>相关文章</h2>
        <NuxtLink v-for="r in data.related" :key="r.id" :to="`/article/${r.id}`" class="related-item">
          {{ r.title }}
        </NuxtLink>
      </section>

      <!-- 评论（开源系统 Artalk/Waline/Twikoo，见 6.3） -->
      <ArticleComments v-if="data.article.id" :article-id="data.article.id" />

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
.meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 13px; color: #999; margin-bottom: 20px; align-items: center; }
.expire { color: #fa541c; font-weight: 600; }
.fav-btn {
  border: 1px solid #ddd; background: #fff; border-radius: 999px; padding: 3px 12px;
  cursor: pointer; font-size: 12px; color: #666;
}
.fav-btn.on { background: #fff7e6; border-color: #faad14; color: #d48806; }
.content { margin-bottom: 20px; }
.text-block { margin-bottom: 12px; }
.block-h2 { font-size: 18px; margin: 22px 0 10px; padding-top: 6px; border-bottom: 1px solid #f0f0f0; padding-bottom: 8px; }
.block-list { margin: 10px 0; }
.list-item { padding: 5px 0 5px 18px; position: relative; color: #444; }
.list-item::before { content: '•'; position: absolute; left: 2px; color: #1677ff; }
.block-price { display: flex; align-items: baseline; gap: 10px; background: #fff7e6; border: 1px solid #ffd591; border-radius: 8px; padding: 12px 16px; margin: 14px 0; }
.block-price .price { font-size: 26px; font-weight: 700; color: #fa541c; }
.block-price .original { color: #bbb; text-decoration: line-through; font-size: 14px; }
.block-price .spec { color: #666; font-size: 13px; }
.block-quote { border-radius: 8px; padding: 12px 16px; margin: 14px 0; font-size: 14px; line-height: 1.7; }
.block-quote.warn { background: #fff1f0; border: 1px solid #ffccc7; color: #cf1322; }
.block-quote.info { background: #e6f4ff; border: 1px solid #91caff; color: #0958d9; }
.block-image { margin: 14px 0; }
.block-image img { max-width: 100%; border-radius: 8px; display: block; }
.top-links { margin: 0 0 16px; }
.ad-block { background: #fffbe6; border: 1px dashed #faad14; border-radius: 8px; padding: 12px; margin: 12px 0; }
.ad-label { display: inline-block; background: #faad14; color: #fff; font-size: 11px; padding: 1px 8px; border-radius: 4px; margin-bottom: 6px; }
.ad-link { display: inline-block; margin-top: 6px; font-weight: 600; }
.faq { margin-bottom: 20px; }
.faq h2 { font-size: 16px; margin-bottom: 8px; }
.faq details { border-bottom: 1px solid #f0f0f0; padding: 8px 0; }
.faq summary { cursor: pointer; font-weight: 500; color: #333; }
.faq details p { color: #666; margin-top: 6px; font-size: 14px; }
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
