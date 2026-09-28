<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

// 收藏列表（设备指纹免登录；CSR：指纹在 localStorage，SSR 拿不到）
// 游标分页（服务端 createdAt|id 复合游标）+ 分类服务端过滤；分享失败给可见兜底
const list = ref<any[]>([])
const loading = ref(true)
const err = ref('')
const removeErr = ref('')
const cursor = ref('')
const hasMore = ref(false)
const loadingMore = ref(false)

function getFp() {
  let f = localStorage.getItem('article_fp')
  if (!f) {
    f = 'fp-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('article_fp', f)
  }
  return f
}

const favCat = ref('all')
const cats = computed(() => ['all', ...Array.from(new Set(list.value.map((f: any) => f.category || '文章')))] as string[])
const filtered = computed(() => favCat.value === 'all' ? list.value : list.value.filter((f: any) => (f.category || '文章') === favCat.value))
// 网络图防盗链/失效时隐藏缩略图，避免破图占位
function onImgErr(e: Event) { (e.target as HTMLElement).style.display = 'none' }

async function load(append = false) {
  const fp = getFp()
  const res: any = await $fetch('/api/favorites', {
    query: {
      fp,
      category: favCat.value === 'all' ? undefined : favCat.value,
      cursor: cursor.value || undefined,
      limit: 30,
    },
  })
  if (append) list.value = [...list.value, ...(res.list || [])]
  else list.value = res.list || []
  cursor.value = res.nextCursor || ''
  hasMore.value = !!res.nextCursor
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try { await load(true) } catch (e: any) { removeErr.value = e?.data?.statusMessage || '加载失败，请重试' } finally { loadingMore.value = false }
}

onMounted(async () => {
  try {
    await load(false)
  } catch (e: any) {
    err.value = e?.data?.statusMessage || e?.message || '加载失败'
  } finally {
    loading.value = false
  }
})

// 切换分类：服务端重新过滤 + 重置游标（避免前端过滤与分页错位）
function switchCat(c: string) {
  if (favCat.value === c) return
  favCat.value = c
  cursor.value = ''
  list.value = []
  loading.value = true
  load(false).catch((e: any) => { err.value = e?.data?.statusMessage || '加载失败' }).finally(() => { loading.value = false })
}

let sharedId = ''
const shareFail = ref('')
async function shareFav(id: string) {
  const item = list.value.find((f: any) => f.id === id)
  const url = location.origin + '/article/' + id
  const shareText = `${item?.title || 'AI 文章站好文'}｜${item?.summary || ''}\n${url}`
  shareFail.value = ''
  try {
    if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) && navigator.share) {
      await navigator.share({ title: item?.title || 'AI 文章站', text: shareText, url })
    } else {
      await navigator.clipboard.writeText(shareText)
    }
    sharedId = id
    setTimeout(() => (sharedId = ''), 2000)
  } catch {
    // 系统分享取消/剪贴板失败 → 旧版 execCommand 兜底
    try {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) {
        sharedId = id
        setTimeout(() => (sharedId = ''), 2000)
        return
      }
    } catch { /* 继续 */ }
    // 真失败：可见提示 + 链接可长按手动复制（与详情页一致）
    shareFail.value = url
  }
}

async function removeFav(id: string) {
  try {
    await $fetch(`/api/articles/${id}/favorite`, { method: 'POST', body: { fp: getFp(), action: 'remove' } })
    list.value = list.value.filter((f: any) => f.id !== id)
    removeErr.value = ''
  } catch (e: any) {
    removeErr.value = e?.data?.statusMessage || '取消失败，请重试'
  }
}

useHead({ title: '我的收藏 - AI 文章站', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
</script>

<template>
  <div class="favorites">
    <h1 class="page-title">我的收藏</h1>
    <p class="hint">收藏保存在当前设备（无需注册）。</p>

    <div v-if="loading" class="empty">加载中…</div>
    <div v-else-if="err" class="empty">{{ err }}</div>
    <div v-else-if="!list.length" class="empty">
      还没有收藏。去 <NuxtLink to="/" class="link">首页</NuxtLink> 逛逛，在文章里点「收藏」即可。
    </div>

    <div v-else class="fav-list">
      <p v-if="removeErr" class="remove-err">{{ removeErr }}</p>
      <div v-if="shareFail" class="share-fail">
        <p>复制失败，请长按下面链接手动复制：</p>
        <code>{{ shareFail }}</code>
        <button class="mini" @click="shareFail = ''">知道了</button>
      </div>
      <div class="fav-filter">
        <button
          v-for="c in cats"
          :key="c"
          class="mini"
          :class="{ on: favCat === c }"
          @click="switchCat(c)"
        >{{ c === 'all' ? '全部' : c }}</button>
      </div>
      <p v-if="!filtered.length" class="empty-cat">该分类暂无收藏</p>
      <div v-for="f in filtered" :key="f.id" class="fav-item">
        <div class="fav-head">
          <span class="cat">{{ f.category || '文章' }}</span>
          <span v-if="f.expiresAt" class="exp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9.5v3.5l2.5 1.5"/><path d="M4.5 4.5 3 6M19.5 4.5 21 6"/></svg>{{ fmtCN(f.expiresAt) }}</span>
          <button class="share" @click="shareFav(f.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>
            {{ sharedId === f.id ? '已复制' : '分享' }}
          </button>
          <button class="unfav" @click="removeFav(f.id)">取消收藏</button>
        </div>
        <NuxtLink :to="`/article/${f.id}`" class="fav-body">
          <div v-if="f.firstImage" class="fav-thumb">
            <img :src="f.firstImage" :alt="f.title" loading="lazy" referrerpolicy="no-referrer" @error="onImgErr" />
          </div>
          <div class="fav-text">
            <div class="fav-title">{{ f.title }}</div>
            <div class="fav-summary">{{ f.summary }}</div>
          </div>
        </NuxtLink>
      </div>
      <div v-if="hasMore" class="pager">
        <button class="mini load-more" :disabled="loadingMore" @click="loadMore">{{ loadingMore ? '加载中…' : '加载更多' }}</button>
      </div>
      <p v-else class="list-end">已加载全部收藏</p>
    </div>
  </div>
</template>

<style scoped>
.favorites { max-width: 720px; margin: 0 auto; padding: 28px 16px 48px; }
.page-title { font-size: 22px; margin-bottom: 6px; color: var(--text); }
.hint { color: var(--text-muted); font-size: 13px; margin-bottom: 20px; }
.empty { text-align: center; color: var(--text-muted); padding: 10px 0; font-size: 14px; }
.link { color: var(--primary); text-decoration: none; }
.fav-list { display: flex; flex-direction: column; gap: 12px; }
.remove-err { color: #dc2626; font-size: 13px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 8px 12px; margin: 0; }
.share-fail {
  position: relative;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .12);
  padding: 12px 14px;
  margin: 0 0 4px;
}
.share-fail p { margin: 0 0 8px; font-size: 13px; color: var(--text); }
.share-fail code {
  display: block;
  word-break: break-all;
  font-size: 12px;
  color: var(--primary);
  background: var(--primary-weak);
  border-radius: 8px;
  padding: 8px 10px;
  user-select: all;
  margin-bottom: 8px;
}
.share-fail .mini { float: right; }
.fav-filter { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.empty-cat { color: var(--muted, #8a94a6); font-size: 14px; padding: 12px 0; text-align: center; }
.fav-filter .mini { padding: 4px 14px; }
.mini {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all .2s;
}
.mini:hover { border-color: var(--primary); color: var(--primary); }
.mini.on { background: var(--primary); border-color: transparent; color: #fff; font-weight: 600; }
.fav-item {
  display: block;
  padding: 16px 18px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 14px;
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: box-shadow .2s, transform .15s;
}
.fav-item:hover { box-shadow: var(--shadow); transform: translateY(-1px); }
.fav-head { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.share {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all .2s;
  flex-shrink: 0;
}
.share svg { width: 12px; height: 12px; }
.share:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-weak); }
.unfav {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all .2s;
  flex-shrink: 0;
}
.unfav:hover { border-color: #f87171; color: #dc2626; background: #fef2f2; }
.fav-body { display: flex; gap: 14px; text-decoration: none; }
.fav-thumb {
  width: 110px;
  height: 74px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: #eef2f7;
  align-self: center;
}
.fav-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fav-text { min-width: 0; flex: 1; }
.cat {
  background: var(--primary-weak);
  color: var(--primary);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 600;
}
.exp { display: inline-flex; align-items: center; gap: 3px; color: #d97706; font-size: 12px; }
.exp svg { width: 12px; height: 12px; }
.fav-title { font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
.fav-summary {
  font-size: 13px;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pager { text-align: center; margin-top: 4px; }
.load-more { padding: 8px 26px; }
.list-end { text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 6px; }
@media (max-width: 600px) {
  .fav-thumb { width: 92px; height: 64px; border-radius: 8px; }
}
</style>
