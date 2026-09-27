<template>
  <div class="site">
    <header class="site-header">
      <div class="container header-inner">
        <NuxtLink to="/" class="logo">AI 文章站</NuxtLink>
        <nav class="nav">
          <NuxtLink to="/">首页</NuxtLink>
          <NuxtLink to="/about">关于</NuxtLink>
          <NuxtLink to="/admin">后台</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="container">
      <NuxtPage />
    </main>

    <footer class="site-footer">
      <div class="container footer-inner">
        <span>© 2026 AI 文章站</span>
        <div class="friend-links">
          <a href="https://jdjdndn.github.io" target="_blank" rel="noopener">jdjdndn.github.io</a>
          <a href="https://wcbblll.cc" target="_blank" rel="noopener">wcbblll.cc</a>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.site { min-height: 100vh; display: flex; flex-direction: column; }
.container { width: 100%; max-width: 960px; margin: 0 auto; padding: 0 16px; box-sizing: border-box; }
.site-header { border-bottom: 1px solid #eee; background: #fff; }
.header-inner { display: flex; align-items: center; justify-content: space-between; height: 56px; }
.logo { font-size: 18px; font-weight: 700; color: #333; text-decoration: none; }
.nav a { margin-left: 16px; color: #666; text-decoration: none; }
.nav a:hover, .nav a.router-link-active { color: #1677ff; }
main { flex: 1; padding: 24px 0 40px; }
.site-footer { border-top: 1px solid #eee; padding: 20px 0; background: #fafafa; }
.footer-inner { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; color: #999; font-size: 13px; }
.friend-links a { margin-right: 12px; color: #1677ff; text-decoration: none; }

@media (max-width: 600px) {
  .footer-inner { flex-direction: column; align-items: flex-start; gap: 8px; }
  .nav a { margin-left: 10px; }
}
</style>
