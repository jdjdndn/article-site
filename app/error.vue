<script setup lang="ts">
// 全局错误页：404 兜底（死链回收：搜索框 + 返回首页/收藏），其他错误通用提示
const props = defineProps<{ error: { statusCode?: number; statusMessage?: string } }>()
const notFound = props.error?.statusCode === 404
// SEO：错误页返回真实状态码（404/500），避免死链被当正常页收录；已下架文章走 gone(200+noindex) 不受影响
setResponseStatus(notFound ? 404 : (props.error?.statusCode && props.error.statusCode >= 500 ? props.error.statusCode : 500))
useHead({ title: notFound ? '页面不存在 - AI 文章站' : '出错了 - AI 文章站', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

// 死链回收：直接搜索，跳首页 ?q= 命中的内容
const router = useRouter()
const q = ref('')
function doSearch() {
  const kw = q.value.trim()
  if (kw) router.push({ path: '/', query: { q: kw } })
}
</script>

<template>
  <div class="err">
    <div class="err-icon">
      <svg v-if="notFound" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/></svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 21 20H3z"/><path d="M12 10v4.5"/><path d="M12 17.5h.01"/></svg>
    </div>
    <h1>{{ notFound ? '页面不存在' : '出错了' }}</h1>
    <p>{{ notFound ? '你访问的页面不存在、已删除或已下架，试试搜索想看的内容。' : (error?.statusMessage || '服务器开小差了，请稍后再试。') }}</p>
    <form v-if="notFound" class="err-search" @submit.prevent="doSearch">
      <input v-model="q" type="search" placeholder="搜索文章，如：牛奶 / 领券 / 网盘" aria-label="搜索文章" />
      <button type="submit" class="btn">搜索</button>
    </form>
    <div class="err-actions">
      <NuxtLink to="/" class="btn">返回首页</NuxtLink>
      <NuxtLink to="/favorites" class="btn ghost">我的收藏</NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.err { text-align: center; padding: 80px 16px; max-width: 520px; margin: 0 auto; }
.err-icon { width: 54px; height: 54px; margin: 0 auto 14px; color: var(--primary); }
.err-icon svg { width: 100%; height: 100%; }
.err h1 { font-size: 22px; margin-bottom: 8px; color: var(--text); }
.err p { color: var(--text-muted); font-size: 14px; margin-bottom: 20px; }
.err-search { display: flex; gap: 10px; justify-content: center; margin-bottom: 22px; }
.err-search input {
  flex: 1;
  max-width: 360px;
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  background: #fff;
  color: var(--text);
  box-shadow: var(--shadow-sm);
}
.err-search input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, .12); }
.err-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.btn {
  display: inline-block;
  padding: 10px 26px;
  background: linear-gradient(180deg, var(--primary), var(--primary-strong));
  color: #fff;
  border: none;
  border-radius: 10px;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}
.btn.ghost { background: #fff; border: 1px solid var(--border); color: var(--text-muted); }
</style>
