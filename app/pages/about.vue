<script setup lang="ts">
// 关于页：站点说明 + 推广免责 + 联系方式 + 友链（GEO：Organization JSON-LD 补全站点实体信息）
useHead({
  title: '关于本站 - AI 文章站',
  link: [{ rel: 'canonical', href: 'https://www.wcbblll.cc/about' }],
  meta: [
    { name: 'description', content: 'AI 文章站：优惠攻略、好物推荐、副业指南，关于本站、内容来源与推广免责声明。' },
    { property: 'og:title', content: '关于本站 - AI 文章站' },
    { property: 'og:description', content: 'AI 文章站：优惠攻略、好物推荐、副业指南，关于本站与推广免责声明。' },
    { property: 'og:image', content: 'https://www.wcbblll.cc/og-cover.png' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: '关于本站 - AI 文章站' },
    { name: 'twitter:description', content: 'AI 文章站：优惠攻略、好物推荐、副业指南，关于本站与推广免责声明。' },
    { name: 'twitter:image', content: 'https://www.wcbblll.cc/og-cover.png' },
  ],
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify([{
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'AI 文章站',
      alternateName: 'wcbblll.cc',
      url: 'https://www.wcbblll.cc',
      logo: 'https://www.wcbblll.cc/og-cover.png',
      description: '优惠攻略、好物推荐、副业指南类内容站，每日更新。',
      inLanguage: 'zh-CN',
      areaServed: 'CN',
    }]),
  }],
})
</script>

<template>
  <div class="about">
    <div class="card">
      <h1>关于本站</h1>
      <p class="lead">AI 文章站：优惠攻略、好物推荐、副业指南，每天 8 点更新 3 篇实用内容。</p>

      <h2>内容是怎么来的</h2>
      <ul>
        <li>AI 初稿 + 开源工具去 AI 味 + 人工后台管理，非流水线搬运；</li>
        <li>素材来源：运营整理的热搜选题、商品/活动信息、读者投稿（搜索无结果时可提交选题）；</li>
        <li>正文图片与视频均来自网络，渲染时已标注"来源：网络"。</li>
      </ul>

      <h2>推广与免责声明</h2>
      <ul>
        <li>本站为个人兴趣分享，部分文章含第三方推广链接（文中已标注"广告"）；</li>
        <li>商品价格、库存、优惠券均以商家页面实时显示为准，本站不保证其长期有效；</li>
        <li>点击推广链接将跳转到第三方平台，跳转后产生的交易、售后、纠纷由相应平台负责，本站不承担相关责任；</li>
        <li>文中图片与视频等素材均来自网络，版权归原作者所有，仅作说明用途，如涉侵权请联系删除；</li>
        <li>攻略/经验类内容基于公开信息整理，仅供参考，请结合自身情况判断。</li>
      </ul>

      <h2>联系与合作</h2>
      <p>友链、内容合作、侵权反馈：<a href="mailto:2667389861@qq.com">2667389861@qq.com</a>（工作日回复）</p>

      <!-- <h2>友链</h2>
      <p class="friend-line">
        <a href="https://jdjdndn.github.io" target="_blank" rel="noopener">jdjdndn.github.io</a> ·
        <a href="https://wcbblll.cc" target="_blank" rel="noopener">wcbblll.cc</a>
      </p> -->
    </div>
  </div>
</template>

<style scoped>
.about { max-width: 720px; margin: 0 auto; }
.card { padding: 28px 30px; }
h1 { font-size: 22px; margin-bottom: 10px; color: var(--text); }
.lead { color: var(--text-muted); font-size: 14px; margin-bottom: 18px; }
h2 { font-size: 16px; margin: 22px 0 10px; color: var(--text); }
ul { margin: 0 0 4px 20px; }
li { margin-bottom: 6px; font-size: 14px; color: #374151; line-height: 1.7; }
p { font-size: 14px; color: #374151; line-height: 1.7; }
.friend-line a { color: var(--primary); text-decoration: none; }
.friend-line a:hover { text-decoration: underline; }
@media (max-width: 600px) {
  .card { padding: 20px 18px; }
}
</style>
