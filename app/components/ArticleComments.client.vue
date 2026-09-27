<script setup lang="ts">
// 开源评论系统通用接入组件（Artalk / Waline / Twikoo 三选一）
// 配置：NUXT_PUBLIC_COMMENT_PROVIDER（artalk|waline|twikoo）+ NUXT_PUBLIC_COMMENT_SERVER
// 评论数据存评论系统自身数据库，不占 D1（PLAN v13）
const props = defineProps<{ articleId: string }>()

const config = useRuntimeConfig()
const provider = (config.public.commentProvider as string) || 'artalk'
const server = (config.public.commentServer as string) || ''

const el = ref<HTMLElement>()

onMounted(async () => {
  if (!server || !el.value) return
  try {
    if (provider === 'waline') {
      const { init } = await import('@waline/client')
      init({
        el: el.value,
        serverURL: server,
        // 后端按完整页面 URL（url 列）匹配评论；path 须与 POST 时提交的 url 一致
        path: window.location.href,
        lang: 'zh-CN',
        dark: 'auto',
      })
    } else if (provider === 'twikoo') {
      const twikoo = (await import('twikoo')).default
      twikoo.init({
        el: el.value,
        envId: server,
        path: props.articleId,
        lang: 'zh-CN',
      })
    } else {
      // 默认 Artalk
      const Artalk = (await import('artalk')).default
      await import('artalk/dist/Artalk.css')
      Artalk.init({
        el: el.value,
        server,
        site: 'AI 文章站',
        pageKey: props.articleId,
        darkMode: 'auto',
      })
    }
  } catch (e) {
    console.error('[comments] 评论加载失败：', e)
  }
})
</script>

<template>
  <section v-if="server" id="comments" class="comments card">
    <h2>评论</h2>
    <div ref="el" class="comments-mount">
      <p v-if="!server" class="hint">评论服务未配置</p>
    </div>
  </section>
</template>

<style scoped>
.comments { margin-bottom: 22px; padding: 20px 24px; scroll-margin-top: 76px; }
.comments h2 { font-size: 17px; margin-bottom: 12px; color: var(--text); }
.hint { color: var(--text-muted); font-size: 13px; }
/* Waline/Artalk/Twikoo 内部控件细节统一 */
.comments :deep(.wl-card), .comments :deep(.atk-comment) { box-shadow: none !important; border-color: var(--border) !important; }
@media (max-width: 600px) {
  .comments { padding: 16px; }
}
</style>
