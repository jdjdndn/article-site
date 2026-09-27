// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-27',
  devtools: { enabled: true },

  // Cloudflare Workers（module worker，原生支持 scheduled 事件 → cron 定时发布）
  nitro: {
    preset: 'cloudflare_module',
    // 定时发布由 server/plugins/publish-on-schedule.ts 挂 cloudflare:scheduled hook 实现
    // （Nitro scheduledTasks 在 cloudflare_module preset 下未生效，已弃用）
  },

  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'AI 文章站',
      meta: [
        { name: 'description', content: 'AI 文章站：优惠攻略、好物推荐、副业指南' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // 管理密钥（部署时在 Cloudflare Pages 设置环境变量 MANAGE_KEY）
    manageKey: '',
    public: {
      // 页面端校验占位；真实鉴权在 server 端（server/api/admin/*）
      manageKey: '',
      // 开源评论系统：provider = artalk | waline | twikoo；server 为对应后端地址
      commentProvider: 'waline',
      commentServer: 'https://comments.wcbblll.cc'
    }
  }
})
