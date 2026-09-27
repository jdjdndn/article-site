<script setup lang="ts">
// 全局错误页：404 兜底（死链回收：返回首页/收藏），其他错误通用提示
const props = defineProps<{ error: { statusCode?: number; statusMessage?: string } }>()
const notFound = props.error?.statusCode === 404
// SEO：错误页返回真实状态码（404/500），避免死链被当正常页收录；已下架文章走 gone(200+noindex) 不受影响
setResponseStatus(notFound ? 404 : (props.error?.statusCode && props.error.statusCode >= 500 ? props.error.statusCode : 500))
useHead({ title: notFound ? '页面不存在 - AI 文章站' : '出错了 - AI 文章站', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
</script>

<template>
  <div class="err">
    <div class="err-icon">{{ notFound ? '🔍' : '⚠️' }}</div>
    <h1>{{ notFound ? '页面不存在' : '出错了' }}</h1>
    <p>{{ notFound ? '你访问的页面不存在、已删除或已下架。' : (error?.statusMessage || '服务器开小差了，请稍后再试。') }}</p>
    <div class="err-actions">
      <NuxtLink to="/" class="btn">返回首页</NuxtLink>
      <NuxtLink to="/favorites" class="btn ghost">我的收藏</NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.err { text-align: center; padding: 80px 16px; }
.err-icon { font-size: 46px; margin-bottom: 12px; }
.err h1 { font-size: 22px; margin-bottom: 8px; color: var(--text); }
.err p { color: var(--text-muted); font-size: 14px; margin-bottom: 24px; }
.err-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.btn {
  display: inline-block;
  padding: 10px 26px;
  background: linear-gradient(180deg, var(--primary), var(--primary-strong));
  color: #fff;
  border-radius: 10px;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
}
.btn.ghost { background: #fff; border: 1px solid var(--border); color: var(--text-muted); }
</style>
