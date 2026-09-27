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

// 显示层：更新时间格式化为 YYYY-MM-DD HH:mm
function formatDate(v: string) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 链接分组：coupon/buy 主按钮常显，more 收进"更多"折叠
const mainLinks = computed(() => (data.value?.article?.links || []).filter((l: any) => l.kind !== 'more'))
const moreLinks = computed(() => (data.value?.article?.links || []).filter((l: any) => l.kind === 'more'))
const showMore = ref(false)

// 点击上报（不拦截跳转、不改链接地址；sendBeacon 异步零阻塞）
function trackClick(l: any) {
  if (!import.meta.client) return
  try {
    const body = JSON.stringify({
      articleId: data.value?.article?.id,
      linkId: l.id,
      domain: l.url ? new URL(l.url).hostname : '',
    })
    navigator.sendBeacon('/api/track/click', new Blob([body], { type: 'application/json' }))
  } catch { /* 上报失败不影响跳转 */ }
}

// 分享：优先系统分享（移动端），否则复制链接（微信/QQ 直接粘贴）
const shareDone = ref(false)
async function copyLink() {
  const url = `https://www.wcbblll.cc/article/${id.value}`
  try {
    if (navigator.share) {
      await navigator.share({ title: data.value?.article?.title, url })
      return
    }
  } catch { /* 用户取消分享不报错 */ }
  try {
    await navigator.clipboard.writeText(url)
    shareDone.value = true
    setTimeout(() => (shareDone.value = false), 2000)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = url
    document.body.appendChild(ta); ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    shareDone.value = true
    setTimeout(() => (shareDone.value = false), 2000)
  }
}

// GEO：JSON-LD（Article 全字段 + BreadcrumbList + FAQPage）
useHead(() => {
  // 下架页禁止收录（410 语义页，避免搜索引擎收录死链）
  if (data.value?.status === 'gone') {
    return {
      title: '文章已下架 - AI 文章站',
      meta: [{ name: 'robots', content: 'noindex, nofollow' }],
    }
  }
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

    <!-- 已下架/已删除：410 兜底页 + 相关推荐（流量回收） -->
    <div v-else-if="data.status === 'gone'" class="gone card">
      <div class="gone-icon">📭</div>
      <h1>这篇文章已下架</h1>
      <p v-if="data.article.expiresAt">优惠/活动已于 {{ formatDate(data.article.expiresAt) }} 结束</p>
      <p class="gone-tip">看看其他文章吧</p>
      <div v-if="data.related?.length" class="related-list">
        <NuxtLink v-for="r in data.related" :key="r.id" :to="`/article/${r.id}`" class="related-item">{{ r.title }}</NuxtLink>
      </div>
      <NuxtLink to="/" class="gone-btn">返回首页</NuxtLink>
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
        <span class="time">更新于 {{ formatDate(data.article.updatedAt) }}</span>
        <button
          class="fav-btn"
          :class="{ on: favorited }"
          @click="toggleFavorite"
        >{{ favorited ? '★ 已收藏' : '☆ 收藏' }}（{{ favoriteCount }}）</button>
        <button class="share-btn" @click="copyLink">{{ shareDone ? '✓ 已复制' : '🔗 分享' }}</button>
      </div>

      <!-- 正文（结构化块：text/h2/list/price/quote/ad/image，按模板布局） -->
      <article class="content card" :class="'tmpl-' + tmpl">
        <!-- deal 模板：购买入口前置 -->
        <div v-if="tmpl === 'deal' && mainLinks.length" class="links top-links">
          <a
            v-for="(l, i) in mainLinks"
            :key="'m' + (l.id ?? i)"
            :href="l.url"
            target="_blank"
            rel="noopener nofollow"
            class="link-btn"
            @click="trackClick(l)"
          >{{ l.label }}</a>
          <div v-if="moreLinks.length" class="more-wrap">
            <button class="more-toggle" @click="showMore = !showMore">{{ showMore ? '收起' : `更多好物（${moreLinks.length}）` }}</button>
            <div v-if="showMore" class="more-list">
              <a
                v-for="(l, i) in moreLinks"
                :key="'x' + (l.id ?? i)"
                :href="l.url"
                target="_blank"
                rel="noopener nofollow"
                class="more-link"
                @click="trackClick(l)"
              >{{ l.label }}</a>
            </div>
          </div>
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
        <div v-if="tmpl !== 'deal' && mainLinks.length" class="links">
          <a
            v-for="(l, i) in mainLinks"
            :key="'m' + (l.id ?? i)"
            :href="l.url"
            target="_blank"
            rel="noopener nofollow"
            class="link-btn"
            @click="trackClick(l)"
          >{{ l.label }}</a>
          <div v-if="moreLinks.length" class="more-wrap">
            <button class="more-toggle" @click="showMore = !showMore">{{ showMore ? '收起' : `更多好物（${moreLinks.length}）` }}</button>
            <div v-if="showMore" class="more-list">
              <a
                v-for="(l, i) in moreLinks"
                :key="'x' + (l.id ?? i)"
                :href="l.url"
                target="_blank"
                rel="noopener nofollow"
                class="more-link"
                @click="trackClick(l)"
              >{{ l.label }}</a>
            </div>
          </div>
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
.breadcrumb {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.breadcrumb a { color: var(--primary); text-decoration: none; transition: opacity .2s; }
.breadcrumb a:hover { opacity: .8; }
.title { font-size: 23px; line-height: 1.45; margin-bottom: 8px; color: var(--text); font-weight: 700; }
.summary { color: var(--text-muted); margin-bottom: 12px; font-size: 14px; }
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 22px;
  align-items: center;
}
.meta .time { display: inline-flex; align-items: center; gap: 4px; }
.meta .time::before { content: '🕒'; font-size: 11px; }
.expire {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #d97706;
  background: var(--accent-weak);
  border-radius: 999px;
  padding: 3px 12px;
  font-weight: 600;
}
.fav-btn {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 4px 14px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted);
  transition: all .2s;
}
.fav-btn:hover { border-color: #fbbf24; color: #d97706; }
.fav-btn.on { background: var(--accent-weak); border-color: #fcd34d; color: #d97706; font-weight: 600; }
.share-btn {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 4px 14px;
  cursor: pointer;
  font-size: 12px;
  color: var(--primary);
  transition: all .2s;
}
.share-btn:hover { border-color: var(--primary); background: var(--primary-weak); }

.more-wrap { position: relative; }
.more-toggle {
  border: 1px dashed var(--border-strong, #d1d5db);
  background: #fff;
  border-radius: 10px;
  padding: 9px 16px;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all .2s;
}
.more-toggle:hover { color: var(--primary); border-color: var(--primary); background: var(--primary-weak); }
.more-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.more-link {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--primary-weak);
  color: var(--primary);
  text-decoration: none;
  font-size: 13px;
  transition: background .2s;
}
.more-link:hover { background: #dbeafe; }

.gone { text-align: center; padding: 48px 24px; margin-bottom: 22px; }
.gone-icon { font-size: 42px; margin-bottom: 10px; }
.gone h1 { font-size: 20px; margin-bottom: 8px; color: var(--text); }
.gone p { color: var(--text-muted); font-size: 14px; margin: 4px 0; }
.gone-tip { margin-bottom: 18px !important; }
.related-list { display: flex; flex-direction: column; gap: 6px; max-width: 420px; margin: 0 auto 20px; }
.gone-btn {
  display: inline-block;
  padding: 10px 28px;
  background: linear-gradient(180deg, var(--primary), var(--primary-strong));
  color: #fff;
  border-radius: 10px;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
}

.content { margin-bottom: 22px; padding: 24px; }
.text-block { margin-bottom: 14px; line-height: 1.85; color: #374151; font-size: 15px; }
.block-h2 {
  font-size: 18px;
  margin: 26px 0 12px;
  padding: 4px 0 8px 12px;
  border-left: 4px solid var(--primary);
  border-bottom: 1px solid #f0f2f5;
  color: var(--text);
  background: linear-gradient(90deg, var(--primary-weak), transparent);
  border-radius: 0 6px 6px 0;
}
.block-list { margin: 12px 0; }
.list-item { padding: 6px 0 6px 20px; position: relative; color: #374151; font-size: 14px; }
.list-item::before { content: '•'; position: absolute; left: 4px; color: var(--primary); font-weight: 700; }
.block-price {
  display: flex;
  align-items: baseline;
  gap: 12px;
  background: linear-gradient(135deg, #fff7e6, #fffbe8);
  border: 1px solid #fde68a;
  border-radius: 12px;
  padding: 14px 18px;
  margin: 16px 0;
}
.block-price .price { font-size: 28px; font-weight: 700; color: var(--danger); }
.block-price .original { color: #b6bcc6; text-decoration: line-through; font-size: 14px; }
.block-price .spec { color: var(--text-muted); font-size: 13px; }
.block-quote { border-radius: 10px; padding: 12px 16px; margin: 16px 0; font-size: 14px; line-height: 1.75; }
.block-quote.warn {
  background: var(--danger-weak);
  border: 1px solid #fecaca;
  color: #b91c1c;
}
.block-quote.warn::before { content: '⚠️ '; }
.block-quote.info {
  background: var(--primary-weak);
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
}
.block-quote.info::before { content: '💡 '; }
.block-image { margin: 16px 0; }
.block-image img { max-width: 100%; border-radius: 12px; display: block; box-shadow: var(--shadow-sm); }
.top-links { margin: 0 0 18px; }

.ad-block {
  background: #fffbeb;
  border: 1px dashed #fcd34d;
  border-radius: 10px;
  padding: 12px 16px;
  margin: 12px 0;
  font-size: 14px;
}
.ad-label {
  display: inline-block;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  font-size: 11px;
  padding: 1px 10px;
  border-radius: 999px;
  margin-bottom: 6px;
}
.ad-link { display: inline-block; margin-top: 6px; font-weight: 600; color: var(--primary); text-decoration: none; }

.faq { margin-bottom: 22px; padding: 20px 24px; }
.faq h2 { font-size: 17px; margin-bottom: 6px; color: var(--text); }
.faq details {
  border-radius: 10px;
  padding: 4px 10px;
  margin: 8px 0;
  transition: background .2s;
}
.faq details[open] { background: #f9fafb; }
.faq summary { cursor: pointer; font-weight: 600; color: var(--text); padding: 8px 2px; list-style: none; display: flex; align-items: center; gap: 6px; }
.faq summary::-webkit-details-marker { display: none; }
.faq summary::before { content: '❓'; font-size: 12px; }
.faq details p { color: var(--text-muted); margin: 2px 0 10px 18px; font-size: 14px; line-height: 1.75; }

.links { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 22px; }
.link-btn {
  display: inline-block;
  padding: 10px 24px;
  background: linear-gradient(180deg, var(--primary), var(--primary-strong));
  color: #fff;
  border-radius: 10px;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(37, 99, 235, .28);
  transition: opacity .2s, transform .15s, box-shadow .2s;
}
.link-btn:hover { opacity: .92; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(37, 99, 235, .34); }

.related { margin-bottom: 22px; padding: 20px 24px; }
.related h2, .friend h2 { font-size: 17px; margin-bottom: 10px; color: var(--text); }
.related-item {
  display: block;
  padding: 9px 12px;
  margin: 6px 0;
  color: var(--primary);
  text-decoration: none;
  border-radius: 8px;
  font-size: 14px;
  transition: background .2s;
}
.related-item:hover { background: var(--primary-weak); }
.friend { padding: 20px 24px; }
.friend-links { display: flex; flex-wrap: wrap; gap: 8px; }
.friend-links a {
  display: inline-block;
  padding: 4px 14px;
  border-radius: 999px;
  background: var(--primary-weak);
  color: var(--primary);
  text-decoration: none;
  font-size: 13px;
  transition: background .2s;
}
.friend-links a:hover { background: #dbeafe; }

.loading, .empty { text-align: center; color: var(--text-muted); padding: 48px 0; font-size: 14px; }

@media (max-width: 600px) {
  .title { font-size: 19px; }
  .content { padding: 18px 16px; }
  .link-btn { width: 100%; text-align: center; }
  .related, .friend, .faq { padding: 16px; }
  .block-price { flex-wrap: wrap; }
}
</style>
