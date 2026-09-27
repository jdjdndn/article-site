<script setup lang="ts">
import { ref, onMounted } from 'vue'

// 收藏列表（设备指纹免登录；CSR：指纹在 localStorage，SSR 拿不到）
const list = ref<any[]>([])
const loading = ref(true)
const err = ref('')

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
    const res = await $fetch('/api/favorites', { query: { fp } })
    list.value = res.list || []
  } catch (e: any) {
    err.value = e?.data?.statusMessage || e?.message || '加载失败'
  } finally {
    loading.value = false
  }
})

let sharedId = ''
async function shareFav(id: string) {
  const url = location.origin + '/article/' + id
  try {
    if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) && navigator.share) {
      await navigator.share({ title: '分享文章', url })
    } else {
      await navigator.clipboard.writeText(url)
    }
    sharedId = id
    setTimeout(() => (sharedId = ''), 2000)
  } catch { /* 取消/失败忽略 */ }
}

const favCat = ref('all')
const cats = computed(() => ['all', ...Array.from(new Set(list.value.map((f: any) => f.category || '文章')))] as string[])
const filtered = computed(() => favCat.value === 'all' ? list.value : list.value.filter((f: any) => (f.category || '文章') === favCat.value))

async function removeFav(id: string) {
  try {
    await $fetch(`/api/articles/${id}/favorite`, { method: 'POST', body: { fp: getFp(), action: 'remove' } })
    list.value = list.value.filter((f: any) => f.id !== id)
  } catch (e: any) {
    alert(e?.data?.statusMessage || '取消失败，请重试')
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
      还没有收藏。去 <NuxtLink to="/" class="link">首页</NuxtLink> 逛逛，在文章里点「☆ 收藏」即可。
    </div>

    <div v-else class="fav-list">
      <div class="fav-filter">
        <button
          v-for="c in cats"
          :key="c"
          class="mini"
          :class="{ on: favCat === c }"
          @click="favCat = c"
        >{{ c === 'all' ? '全部' : c }}</button>
      </div>
      <div v-for="f in filtered" :key="f.id" class="fav-item">
        <div class="fav-head">
          <span class="cat">{{ f.category || '文章' }}</span>
          <span v-if="f.expiresAt" class="exp">⏰ {{ f.expiresAt }}</span>
          <button class="share" @click="shareFav(f.id)">{{ sharedId === f.id ? '✓ 已复制' : '🔗 分享' }}</button>
          <button class="unfav" @click="removeFav(f.id)">取消收藏</button>
        </div>
        <NuxtLink :to="`/article/${f.id}`" class="fav-body">
          <div class="fav-title">{{ f.title }}</div>
          <div class="fav-summary">{{ f.summary }}</div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.favorites { max-width: 720px; margin: 0 auto; padding: 28px 16px 48px; }
.page-title { font-size: 22px; margin-bottom: 6px; color: var(--text); }
.hint { color: var(--text-muted); font-size: 13px; margin-bottom: 20px; }
.empty { text-align: center; color: var(--text-muted); padding: 48px 0; font-size: 14px; }
.link { color: var(--primary); text-decoration: none; }
.fav-list { display: flex; flex-direction: column; gap: 12px; }
.fav-filter { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.fav-filter .mini { padding: 4px 14px; }
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
.share:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-weak); }
.unfav {
  margin-left: auto;
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
.fav-body { display: block; text-decoration: none; }
.cat {
  background: var(--primary-weak);
  color: var(--primary);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 600;
}
.exp { color: #d97706; font-size: 12px; }
.fav-title { font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
.fav-summary {
  font-size: 13px;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
