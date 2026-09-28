<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'

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
// 文章不存在/接口异常 → 交给全局错误页（真实 404 状态码，SEO）；已下架(gone)走 200+noindex 不受影响
if (error.value) {
  throw createError({ statusCode: error.value?.statusCode || 404, statusMessage: error.value?.statusMessage || '文章不存在' })
}

const favorited = ref(false)
const favoriteCount = ref(0)

onMounted(() => {
  fp.value = getFp()
  if (fp.value) refresh().then(() => {
    favorited.value = !!data.value?.favorited
    favoriteCount.value = data.value?.favoriteCount ?? 0
  })
  // Plyr 按需加载：仅当正文存在 video 块时才动态引入（避免无视频页面白拉两个 chunk）
  const blocks: any[] = data.value?.article?.content || []
  if (blocks.some((b: any) => b?.type === 'video')) initPlyr()
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

// 收藏：loading + 失败可见提示
const favBusy = ref(false)
const favMsg = ref('')
let favMsgTimer: ReturnType<typeof setTimeout> | null = null
async function toggleFavorite() {
  if (!fp.value || favBusy.value) return
  favBusy.value = true
  const action = favorited.value ? 'remove' : 'add'
  try {
    const res = await $fetch(`/api/articles/${id.value}/favorite`, {
      method: 'POST',
      body: { fp: fp.value, action },
    })
    favorited.value = res.favorited
    favoriteCount.value = res.count
    favMsg.value = ''
  } catch {
    favMsg.value = action === 'add' ? '收藏失败，请重试' : '取消收藏失败，请重试'
    if (favMsgTimer) clearTimeout(favMsgTimer)
    favMsgTimer = setTimeout(() => (favMsg.value = ''), 2500)
  } finally {
    favBusy.value = false
  }
}

function isAd(block: any) { return block?.type === 'ad' }
const isH2 = (b: any) => b?.type === 'h2'
const isList = (b: any) => b?.type === 'list'
const isPrice = (b: any) => b?.type === 'price'
const isQuote = (b: any) => b?.type === 'quote'
const isImage = (b: any) => b?.type === 'image'
const isVideo = (b: any) => b?.type === 'video'
// 视频直链判定：mp4/webm/ogg/m4v/m3u8 可内嵌播放；其余（bilibili/抖音页面链接）走卡片跳转
function isPlayableUrl(u: string) { return /\.(mp4|webm|ogg|m4v|m3u8)(\?|#|$)/i.test(u || '') }
const videoEls: HTMLVideoElement[] = []
function setVideo(el: any) { if (el && !videoEls.includes(el)) videoEls.push(el) }
async function initPlyr() {
  if (!import.meta.client) return
  const vids = videoEls.filter((v: any) => v && !v.dataset.plyrReady)
  if (!vids.length) return
  const mod: any = await import('plyr')
  await import('plyr/dist/plyr.css')
  for (const v of vids) {
    v.dataset.plyrReady = '1'
    new mod.default(v, { controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'] })
  }
}
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

// 已下架页搜索（死链回收：直接搜同类内容）
const goneKw = ref('')
const router = useRouter()
function searchGone() {
  const kw = goneKw.value.trim()
  if (kw) router.push({ path: '/', query: { q: kw } })
}

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

// 分享：仅移动端优先系统分享；桌面端直接复制链接（微信/QQ 里粘贴）。
// 复制失败给可见提示 + 可长按手动复制的链接（避免"闪一下无事发生"）。
const shareDone = ref(false)
const copyFail = ref('')
async function copyLink() {
  const url = `https://www.wcbblll.cc/article/${id.value}`
  const shareText = `${data.value?.article?.title}｜${data.value?.article?.summary || ''}\n${url}`
  copyFail.value = ''
  // 1) 移动端系统分享（带标题+摘要文案）
  if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) && navigator.share) {
    try {
      await navigator.share({ title: data.value?.article?.title, text: shareText, url })
      return
    } catch { /* 用户取消分享：继续尝试复制 */ }
  }
  // 2) 剪贴板 API（复制"标题｜摘要 + 链接"，微信/QQ 粘贴即是完整分享文案）
  try {
    await navigator.clipboard.writeText(shareText)
    shareDone.value = true
    setTimeout(() => (shareDone.value = false), 2000)
    return
  } catch { /* 继续兜底 */ }
  // 3) 旧版 execCommand 兜底
  try {
    const ta = document.createElement('textarea')
    ta.value = url
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) {
      shareDone.value = true
      setTimeout(() => (shareDone.value = false), 2000)
      return
    }
  } catch { /* 继续 */ }
  // 4) 真失败：给可见提示，链接可长按手动复制
  copyFail.value = url
}

// 纠错反馈（信息有误/链接失效 → 后台查看）
const reportOpen = ref(false)
const reportText = ref('')
const reportMsg = ref('')
const reportSending = ref(false)
const reportDone = ref(false)
const reportBox = ref<HTMLTextAreaElement | null>(null)
// 打开时聚焦输入框；ESC 关闭（键盘无障碍）
watch(reportOpen, (v) => {
  if (v) nextTick(() => reportBox.value?.focus())
})
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && reportOpen.value) reportOpen.value = false
}
async function submitReport() {
  const content = reportText.value.trim()
  if (content.length < 2) { reportMsg.value = '请填写要反馈的内容（如：价格已变 / 链接失效）'; return }
  reportSending.value = true
  reportMsg.value = ''
  try {
    await $fetch(`/api/articles/${id.value}/report`, {
      method: 'POST',
      body: { fp: getFp(), content },
    })
    reportOpen.value = false
    reportText.value = ''
    reportDone.value = true
    setTimeout(() => (reportDone.value = false), 2000)
  } catch (e: any) {
    reportMsg.value = e?.data?.statusMessage || '提交失败，请重试'
  } finally {
    reportSending.value = false
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
    link: [{ rel: 'canonical', href: url }],
    meta: [
      { name: 'description', content: a.summary },
      { property: 'og:type', content: 'article' },
      { property: 'og:url', content: url },
      { property: 'og:title', content: a.title },
      { property: 'og:description', content: a.summary },
      { property: 'og:site_name', content: 'AI 文章站' },
      { property: 'og:image', content: 'https://www.wcbblll.cc/og-cover.png' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: a.title },
      { name: 'twitter:description', content: a.summary },
      { name: 'twitter:image', content: 'https://www.wcbblll.cc/og-cover.png' },
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

    <!-- 已下架/已删除：410 兜底页 + 搜索 + 相关推荐（流量回收） -->
    <div v-else-if="data.status === 'gone'" class="gone card">
      <div class="gone-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13h4l2 3h4l2-3h4"/><path d="M4 13V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8"/></svg></div>
      <h1>这篇文章已下架</h1>
      <p v-if="data.article.expiresAt">优惠/活动已于 {{ formatDate(data.article.expiresAt) }} 结束</p>
      <p class="gone-tip">试试搜索同类内容，或者看看下面的相关文章</p>
      <form class="gone-search" @submit.prevent="searchGone">
        <input v-model="goneKw" type="search" placeholder="搜索文章，如：牛奶 / 领券 / 网盘" aria-label="搜索文章" />
        <button type="submit" class="gone-btn-sm">搜索</button>
      </form>
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
      <p class="ai-note"><span class="ai-badge">AI 整理</span>文中含推广链接，价格与优惠以实际页面为准</p>
      <div class="meta">
        <div class="meta-info">
          <span v-if="data.article.expiresAt" class="expire">优惠截止：{{ data.article.expiresAt }}</span>
          <span class="published">发布于 {{ formatDate(data.article.createdAt) }}</span>
          <span class="time">更新于 {{ formatDate(data.article.updatedAt) }}</span>
        </div>
        <div class="meta-actions">
          <button
            class="fav-btn"
            :class="{ on: favorited }"
            :disabled="favBusy"
            @click="toggleFavorite"
          >
            <svg v-if="favorited" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.7-5.2 2.7 1-5.9L3.5 9.7l5.9-.9z"/></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.7-5.2 2.7 1-5.9L3.5 9.7l5.9-.9z"/></svg>
            <span>{{ favorited ? '已收藏' : '收藏' }}（{{ favoriteCount }}）</span>
          </button>
          <button class="share-btn" @click="copyLink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>
            <span>{{ shareDone ? '已复制' : '分享' }}</span>
          </button>
          <button class="report-btn" @click="reportOpen = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></svg>
            <span>{{ reportDone ? '已提交' : '纠错' }}</span>
          </button>
          <span v-if="favMsg" class="fav-msg">{{ favMsg }}</span>
        </div>
      </div>
      <Transition name="pop">
      <div v-if="reportOpen" class="report-mask" @click.self="reportOpen = false">
        <div class="report-panel" role="dialog" aria-modal="true" aria-label="纠错反馈">
          <div class="report-head">
            <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></svg>信息有误，反馈一下</h3>
            <button class="report-x" @click="reportOpen = false" aria-label="关闭">✕</button>
          </div>
          <p class="report-desc">价格已变 / 链接失效 / 描述不准确，告诉我们，编辑会尽快核对修正。</p>
          <textarea ref="reportBox" v-model="reportText" rows="3" maxlength="500" placeholder="如：价格已变化 / 链接失效 / 描述不准确…" aria-label="反馈内容"></textarea>
          <div class="report-counter">{{ reportText.length }}/500</div>
          <p v-if="reportMsg" class="report-msg">{{ reportMsg }}</p>
          <div class="report-actions">
            <button class="report-cancel" @click="reportOpen = false">取消</button>
            <button class="report-submit" :disabled="reportSending || reportText.trim().length < 2" @click="submitReport">{{ reportSending ? '提交中…' : '提交反馈' }}</button>
          </div>
        </div>
      </div>
      </Transition>
      <div v-if="copyFail" class="copy-fail-tip">
        <p>复制失败，请长按下面链接手动复制：</p>
        <code>{{ copyFail }}</code>
        <button class="tip-close" @click="copyFail = ''">知道了</button>
      </div>

      <!-- 正文（结构化块：text/h2/list/price/quote/ad/image，按模板布局） -->
      <article class="content card" :class="'tmpl-' + tmpl">
        <!-- deal 模板：购买入口前置 -->
        <div v-if="tmpl === 'deal' && mainLinks.length" class="links top-links">
          <span class="ad-note"><b class="ad-badge">广告</b>以下链接为第三方推广，请按需理性消费</span>
          <a
            v-for="(l, i) in mainLinks"
            :key="'m' + (l.id ?? i)"
            :href="l.url"
            target="_blank"
            rel="noopener nofollow sponsored"
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
                rel="noopener nofollow sponsored"
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
            <a v-if="block.link" :href="block.link" target="_blank" rel="noopener nofollow sponsored" class="ad-link">去看看 →</a>
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
            <img :src="block.url" :alt="block.alt || data.article.title" loading="lazy" referrerpolicy="no-referrer" />
            <figcaption>{{ block.caption ? block.caption + ' · ' : '' }}图源：网络</figcaption>
          </figure>
          <div v-else-if="isVideo(block)" class="block-video">
            <video
              v-if="isPlayableUrl(block.url)"
              :ref="setVideo"
              :src="block.url"
              :poster="block.poster || ''"
              controls
              playsinline
            ></video>
            <a v-else :href="block.url" target="_blank" rel="noopener nofollow sponsored" class="video-card">
              <span class="video-play">▶</span>
              <span class="video-info">
                <span class="video-title">{{ block.title || '视频' }}</span>
                <span class="video-src">来源：网络 · 点击前往观看</span>
              </span>
            </a>
            <p class="video-src-tip">{{ block.title ? block.title + ' · ' : '' }}视频来源：网络</p>
          </div>
          <p v-else class="text-block">{{ block.text }}</p>
        </template>

        <!-- 文末轻引导 -->
        <div class="read-end">
          <span>这篇对你有用吗？</span>
          <button class="end-btn" :class="{ on: favorited }" :disabled="favBusy" @click="toggleFavorite">
            <svg v-if="favorited" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.7-5.2 2.7 1-5.9L3.5 9.7l5.9-.9z"/></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.7-5.2 2.7 1-5.9L3.5 9.7l5.9-.9z"/></svg>
            {{ favorited ? '已收藏' : '收藏' }}
          </button>
          <button class="end-btn" @click="copyLink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>
            {{ shareDone ? '已复制' : '分享' }}
          </button>
        </div>

        <!-- 非 deal 模板：链接按钮放正文后 -->
        <div v-if="tmpl !== 'deal' && mainLinks.length" class="links">
          <span class="ad-note"><b class="ad-badge">广告</b>以下链接为第三方推广，请按需理性消费</span>
          <a
            v-for="(l, i) in mainLinks"
            :key="'m' + (l.id ?? i)"
            :href="l.url"
            target="_blank"
            rel="noopener nofollow sponsored"
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
                rel="noopener nofollow sponsored"
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
.summary { color: var(--text-muted); margin-bottom: 10px; font-size: 14px; }
.ai-note { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); margin: 0 0 12px; }
.ai-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  background: #eef2f7;
  border: 1px solid #e2e8f0;
  color: var(--text-muted);
  font-weight: 500;
  flex-shrink: 0;
}
.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 12px;
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 22px;
}
.meta-info { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
.meta-actions { display: flex; align-items: center; gap: 8px; }
.fav-msg { color: var(--danger); font-size: 12px; }
.meta .time { display: inline-flex; align-items: center; gap: 5px; }
.meta .published { display: inline-flex; align-items: center; gap: 5px; }
.meta .published::before {
  content: '';
  width: 13px;
  height: 13px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4.5' width='18' height='16.5' rx='3'/%3E%3Cpath d='M8 2.5v4M16 2.5v4M3 10h18'/%3E%3C/svg%3E") center/contain no-repeat;
}
.meta .time::before {
  content: '';
  width: 13px;
  height: 13px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 7v5l3 2'/%3E%3C/svg%3E") center/contain no-repeat;
}
.expire {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #b45309;
  background: var(--accent-weak);
  border-radius: 999px;
  padding: 3px 12px;
  font-weight: 600;
}
.expire::before {
  content: '';
  width: 13px;
  height: 13px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23d97706' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='13' r='8'/%3E%3Cpath d='M12 9.5v3.5l2.5 1.5'/%3E%3Cpath d='M4.5 4.5 3 6M19.5 4.5 21 6'/%3E%3C/svg%3E") center/contain no-repeat;
}
.fav-btn, .share-btn, .report-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 4px 13px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted);
  transition: all .2s;
}
.fav-btn svg, .share-btn svg, .report-btn svg { width: 13px; height: 13px; flex-shrink: 0; }
.fav-btn:disabled { opacity: .6; cursor: wait; }
.fav-btn:hover { border-color: #fbbf24; color: #d97706; }
.fav-btn.on { background: var(--accent-weak); border-color: #fcd34d; color: #d97706; font-weight: 600; }
.share-btn { color: var(--primary); }
.share-btn:hover { border-color: var(--primary); background: var(--primary-weak); }
.report-btn:hover { border-color: #f59e0b; color: #b45309; background: #fffbeb; }
.report-btn svg { color: var(--text-muted); }
.copy-fail-tip {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  width: min(92vw, 420px);
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .15);
  padding: 14px 16px;
  z-index: 100;
}
.copy-fail-tip p { margin: 0 0 8px; font-size: 13px; color: var(--text); }
.copy-fail-tip code {
  display: block;
  word-break: break-all;
  font-size: 12px;
  color: var(--primary);
  background: var(--primary-weak);
  border-radius: 8px;
  padding: 8px 10px;
  user-select: all;
}
.report-btn {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted);
  transition: all .2s;
}
.report-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, .38);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.report-panel {
  width: min(92vw, 420px);
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, .22), 0 2px 10px rgba(15, 23, 42, .08);
}
.report-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.report-head h3 {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 650;
  color: var(--text);
}
.report-head h3 svg { width: 17px; height: 17px; color: var(--primary); }
.report-x {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 15px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 8px;
  transition: color .2s, background .2s;
}
.report-x:hover { color: var(--text); background: #f3f4f6; }
.report-desc { margin: 0 0 12px; font-size: 13px; color: var(--text-muted); line-height: 1.5; }
.report-panel textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: border-color .2s, box-shadow .2s;
}
.report-panel textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, .12); }
.report-counter { text-align: right; font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.report-msg { color: #dc2626; font-size: 12px; margin: 6px 0 0; }
.report-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
.report-cancel {
  padding: 8px 18px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all .2s;
}
.report-cancel:hover { border-color: #d1d5db; color: var(--text); background: #f9fafb; }
.report-submit {
  padding: 8px 20px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(180deg, var(--primary), var(--primary-strong));
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(37, 99, 235, .25);
  transition: opacity .2s, transform .15s;
}
.report-submit:hover:not(:disabled) { opacity: .92; }
.report-submit:active:not(:disabled) { transform: translateY(1px); }
.report-submit:disabled { opacity: .5; cursor: not-allowed; }
/* 弹窗入场/离场动画 */
.pop-enter-active, .pop-leave-active { transition: opacity .2s ease; }
.pop-enter-active .report-panel, .pop-leave-active .report-panel { transition: transform .22s ease, opacity .22s ease; }
.pop-enter-from, .pop-leave-to { opacity: 0; }
.pop-enter-from .report-panel, .pop-leave-to .report-panel { transform: translateY(12px) scale(.97); opacity: 0; }
.copy-fail-tip .tip-close {
  margin-top: 10px;
  padding: 6px 18px;
  border-radius: 999px;
  border: none;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

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
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}
.more-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--primary-weak);
  border: 1px solid #bfdbfe;
  color: var(--primary);
  text-decoration: none;
  font-size: 13px;
  transition: background .2s;
}
.more-link::after { content: '→'; color: var(--primary); opacity: .55; flex-shrink: 0; }
.more-link:hover { background: #dbeafe; }

.gone { text-align: center; padding: 48px 24px; margin-bottom: 22px; }
.gone-icon { width: 56px; height: 56px; margin: 0 auto 12px; color: var(--primary); }
.gone-icon svg { width: 100%; height: 100%; }
.gone h1 { font-size: 20px; margin-bottom: 8px; color: var(--text); }
.gone p { color: var(--text-muted); font-size: 14px; margin: 4px 0; }
.gone-tip { margin-bottom: 16px !important; }
.gone-search { display: flex; gap: 10px; justify-content: center; max-width: 420px; margin: 0 auto 20px; }
.gone-search input {
  flex: 1;
  min-width: 0;
  padding: 9px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  background: #fff;
  color: var(--text);
}
.gone-search input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, .12); }
.gone-btn-sm {
  padding: 9px 18px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(180deg, var(--primary), var(--primary-strong));
  color: #fff;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
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

.content { margin-bottom: 22px; padding: 24px; max-width: 760px; margin-left: auto; margin-right: auto; }
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
.block-quote.warn::before {
  content: '';
  display: inline-block;
  width: 15px;
  height: 15px;
  margin-right: 6px;
  vertical-align: -2px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23b91c1c' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3.5 21 20H3z'/%3E%3Cpath d='M12 10v4.5'/%3E%3Cpath d='M12 17.5h.01'/%3E%3C/svg%3E") center/contain no-repeat;
}
.block-quote.info {
  background: var(--primary-weak);
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
}
.block-quote.info::before {
  content: '';
  display: inline-block;
  width: 15px;
  height: 15px;
  margin-right: 6px;
  vertical-align: -2px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231d4ed8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18h6M10 21h4'/%3E%3Cpath d='M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.4 1.1 2.2h5c0-.8.3-1.6 1.1-2.2A6 6 0 0 0 12 3z'/%3E%3C/svg%3E") center/contain no-repeat;
}
.block-image { margin: 16px 0; }
.block-image img {
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  border-radius: 12px;
  display: block;
  box-shadow: var(--shadow-sm);
  background: #eef2f7;
}
.block-image figcaption { font-size: 12px; color: var(--text-muted); margin-top: 6px; text-align: center; }
.block-video { margin: 16px 0; }
.block-video video, .block-video .plyr { width: 100%; border-radius: 12px; display: block; }
.video-src-tip { font-size: 12px; color: var(--text-muted); margin-top: 6px; text-align: center; }
.video-card {
  display: flex; align-items: center; gap: 14px;
  border: 1px solid var(--border); border-radius: 12px;
  padding: 14px 16px; text-decoration: none; background: #fff;
  transition: box-shadow .2s, transform .15s;
}
.video-card:hover { box-shadow: var(--shadow); transform: translateY(-1px); }
.video-play {
  width: 44px; height: 44px; flex-shrink: 0;
  border-radius: 50%; background: linear-gradient(180deg, var(--primary), var(--primary-strong));
  color: #fff; font-size: 16px; display: flex; align-items: center; justify-content: center;
}
.video-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.video-title { font-size: 14px; font-weight: 600; color: var(--text); }
.video-src { font-size: 12px; color: var(--text-muted); }
.top-links { margin: 0 0 18px; }
.read-end {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 14px 16px; margin: 6px 0 18px;
  background: var(--primary-weak); border-radius: 12px;
  color: var(--text); font-size: 14px;
}
.read-end .end-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border); background: #fff; border-radius: 999px;
  padding: 5px 14px; font-size: 13px; cursor: pointer; color: var(--text-muted);
  text-decoration: none; transition: all .2s;
}
.read-end .end-btn svg { width: 13px; height: 13px; }
.read-end .end-btn:disabled { opacity: .6; cursor: wait; }
.read-end .end-btn:hover { border-color: var(--primary); color: var(--primary); }
.read-end .end-btn.on { background: var(--primary); color: #fff; border-color: transparent; }

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

.faq { margin-bottom: 22px; padding: 20px 24px; max-width: 760px; margin-left: auto; margin-right: auto; }
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
.faq summary::before {
  content: '';
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.8.3-1.4.9-1.4 1.7'/%3E%3Cpath d='M12 17h.01'/%3E%3C/svg%3E") center/contain no-repeat;
}
.faq details p { color: var(--text-muted); margin: 2px 0 10px 18px; font-size: 14px; line-height: 1.75; }

.links { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 22px; }
.ad-note { flex-basis: 100%; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
.ad-badge {
  font-weight: 600;
  color: #b45309;
  background: var(--accent-weak);
  border: 1px solid #fde68a;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 1.6;
}
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

.related { margin-bottom: 22px; padding: 20px 24px; max-width: 760px; margin-left: auto; margin-right: auto; }
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
.friend { padding: 20px 24px; max-width: 760px; margin-left: auto; margin-right: auto; }
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

.loading, .empty { text-align: center; color: var(--text-muted); padding: 10px 0; font-size: 14px; }

@media (max-width: 600px) {
  .title { font-size: 19px; }
  .content { padding: 18px 16px; }
  .link-btn { width: 100%; text-align: center; }
  .related, .friend, .faq { padding: 16px; }
  .block-price { flex-wrap: wrap; }
  .meta { flex-direction: column; align-items: flex-start; }
  .meta-actions { width: 100%; flex-wrap: wrap; }
}
</style>
