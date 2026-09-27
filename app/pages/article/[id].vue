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
  initPlyr()
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
  copyFail.value = ''
  // 1) 移动端系统分享
  if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) && navigator.share) {
    try {
      await navigator.share({ title: data.value?.article?.title, url })
      return
    } catch { /* 用户取消分享：继续尝试复制 */ }
  }
  // 2) 剪贴板 API
  try {
    await navigator.clipboard.writeText(url)
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
    shareDone.value = true
    setTimeout(() => (shareDone.value = false), 2000)
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
        <button class="report-btn" @click="reportOpen = true">纠错</button>
      </div>
      <div v-if="reportOpen" class="report-mask" @click.self="reportOpen = false">
        <div class="report-panel">
          <h3>信息有误？告诉我们</h3>
          <textarea v-model="reportText" rows="3" maxlength="500" placeholder="如：价格已变化 / 链接失效 / 描述不准确…"></textarea>
          <p v-if="reportMsg" class="report-msg">{{ reportMsg }}</p>
          <div class="report-actions">
            <button class="tip-close" @click="reportOpen = false">取消</button>
            <button class="mini primary" :disabled="reportSending || reportText.trim().length < 2" @click="submitReport">{{ reportSending ? '提交中…' : '提交反馈' }}</button>
          </div>
        </div>
      </div>
      <div v-if="copyFail" class="copy-fail-tip">
        <p>复制失败，请长按下面链接手动复制：</p>
        <code>{{ copyFail }}</code>
        <button class="tip-close" @click="copyFail = ''">知道了</button>
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

        <!-- 非 deal 模板：链接按钮放正文后 -->
        <div v-if="tmpl !== 'deal' && mainLinks.length" class="links">
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
.report-btn:hover { border-color: #f59e0b; color: #b45309; background: #fffbeb; }
.report-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .35);
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.report-panel {
  width: min(92vw, 420px);
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, .2);
}
.report-panel h3 { margin: 0 0 10px; font-size: 15px; color: var(--text); }
.report-panel textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}
.report-msg { color: #dc2626; font-size: 12px; margin: 8px 0 0; }
.report-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
.report-actions .mini { padding: 6px 18px; }
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
