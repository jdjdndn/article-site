// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-27',
  devtools: { enabled: true },

  // Cloudflare Pages 部署 preset（构建输出 .output/public）
  nitro: {
    preset: 'cloudflare_pages'
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
      commentProvider: 'artalk',
      commentServer: ''
    }
  }
})
