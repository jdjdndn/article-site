<script setup lang="ts">
useHead({
  title: '关于本站 - AI 文章站',
  link: [{ rel: 'canonical', href: 'https://www.wcbblll.cc/about' }],
  meta: [
    { name: 'description', content: 'AI 文章站：优惠攻略、好物推荐、副业指南，关于本站与推广免责声明。' },
    { property: 'og:title', content: '关于本站 - AI 文章站' },
    { property: 'og:description', content: 'AI 文章站：优惠攻略、好物推荐、副业指南，关于本站与推广免责声明。' },
    { property: 'og:image', content: 'https://www.wcbblll.cc/og-cover.png' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: '关于本站 - AI 文章站' },
    { name: 'twitter:description', content: 'AI 文章站：优惠攻略、好物推荐、副业指南，关于本站与推广免责声明。' },
    { name: 'twitter:image', content: 'https://www.wcbblll.cc/og-cover.png' },
  ],
})
</script>

<template>
  <div class="card">
    <h1>关于本站</h1>
    <p>AI 文章站：优惠攻略、好物推荐、副业指南。</p>
    <ul>
      <li>内容由 AI 初稿 + 开源工具去 AI 味生成</li>
      <li>手动文章管理（URL 参数进入后台）</li>
    </ul>
    <h2>推广与免责声明</h2>
    <p>本站为个人兴趣分享，部分文章含第三方推广链接（已在文中标注）。请注意：</p>
    <ul>
      <li>商品价格、库存、优惠券均以商家页面实时显示为准，本站不保证其长期有效；</li>
      <li>点击推广链接将跳转到第三方平台，跳转后产生的交易、售后、纠纷由相应平台负责，本站不承担相关责任；</li>
      <li>文中图片与视频等素材均来自网络，版权归原作者所有，仅作说明用途，如涉侵权请联系删除；</li>
      <li>攻略/经验类内容基于公开信息整理，仅供参考，请结合自身情况判断。</li>
    </ul>
    <h2>友链</h2>
    <p>
      <a href="https://jdjdndn.github.io" target="_blank" rel="noopener">jdjdndn.github.io</a> ·
      <a href="https://wcbblll.cc" target="_blank" rel="noopener">wcbblll.cc</a>
    </p>
  </div>
</template>

<style scoped>
h1 { font-size: 20px; margin-bottom: 12px; }
ul { margin: 12px 0 12px 20px; }
</style>
