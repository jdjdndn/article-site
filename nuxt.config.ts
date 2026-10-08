// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-27',
  devtools: { enabled: false },

  // Cloudflare Workers（使用 durable preset 支持 Durable Object Alarms）
  // 定时改由 server/plugins/durable-alarm.ts 挂 cloudflare:durable:* hook 实现（替代原 */5 cron）
  nitro: {
    preset: 'cloudflare-durable',
    sourcemap: false,
  },

  // 关闭 source map 加速 build
  sourcemap: { server: false, client: false },

  // 边缘缓存分层（资源节约核心：内容站读多写少，命中即零 Worker/D1）
  // - 详情页 s-maxage=300（文章极少变；后台保存/删除/批量链接操作时 Cache API 定点 purge）
  // - 首页/分类 s-maxage=60；about/sitemap 1h；favorites 个性化不缓存
  // - /admin 与全部 API no-store（写入必须实时）；后台页禁止收录
  // 注：详情页 SSR 响应不依赖 fp（收藏状态由客户端 onMounted 刷新），缓存无个性化泄漏
  routeRules: {
    '/': { cache: { maxAge: 60, swr: false, staleMaxAge: 0 } },
    '/article/**': { cache: { maxAge: 300, swr: false, staleMaxAge: 0 } },
    '/about': { cache: { maxAge: 3600, swr: false, staleMaxAge: 0 } },
    '/sitemap.xml': { cache: { maxAge: 3600, swr: false, staleMaxAge: 0 } },
    '/feed.xml': { cache: { maxAge: 3600, swr: false, staleMaxAge: 0 } },
    '/favorites': { headers: { 'Cache-Control': 'no-store' } },
    '/admin': { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } },
    '/api/**': { headers: { 'Cache-Control': 'no-store' } },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'AI 文章站',
      meta: [
        { name: 'description', content: 'AI 文章站：优惠攻略、好物推荐、副业指南' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#2563eb' },
        { property: 'og:locale', content: 'zh_CN' },
        { property: 'og:site_name', content: 'AI 文章站' },
        { property: 'og:type', content: 'website' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'alternate', type: 'application/rss+xml', title: 'AI 文章站', href: '/feed.xml' },
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
    }
  }
})
