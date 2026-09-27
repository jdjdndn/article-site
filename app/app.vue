<template>
  <div class="site">
    <header class="site-header">
      <div class="container header-inner">
        <NuxtLink to="/" class="logo"><span class="logo-badge">文</span>AI 文章站</NuxtLink>
        <nav class="nav">
          <NuxtLink to="/" class="nav-link">首页</NuxtLink>
          <NuxtLink to="/favorites" class="nav-link">收藏</NuxtLink>
          <NuxtLink to="/about" class="nav-link">关于</NuxtLink>
          <!-- 后台入口已隐藏：通过 https://www.wcbblll.cc/admin?key=xxx 直接访问 -->
        </nav>
      </div>
    </header>

    <main class="container">
      <NuxtPage />
    </main>

    <footer class="site-footer">
      <div class="container footer-inner">
        <span class="footer-copy">© 2026 AI 文章站 · 优惠攻略 · 好物推荐 · 副业指南</span>
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

.site-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255, 255, 255, .85);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid rgba(229, 231, 235, .8);
}
.header-inner { display: flex; align-items: center; justify-content: space-between; height: 58px; }

.logo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 19px;
  font-weight: 700;
  color: var(--text);
  text-decoration: none;
  letter-spacing: .5px;
}
.logo-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(37, 99, 235, .35);
}

.nav { display: flex; align-items: center; gap: 4px; }
.nav-link {
  padding: 6px 14px;
  border-radius: 999px;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 14px;
  transition: color .2s, background .2s;
}
.nav-link:hover { color: var(--primary); background: var(--primary-weak); }
.nav-link.router-link-active { color: var(--primary); background: var(--primary-weak); font-weight: 600; }

main { flex: 1; padding: 28px 0 48px; }

.site-footer {
  border-top: 1px solid rgba(229, 231, 235, .8);
  padding: 22px 0;
  background: linear-gradient(180deg, #ffffff, #f1f5f9);
}
.footer-inner { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; color: var(--text-muted); font-size: 13px; }
.friend-links a {
  display: inline-block;
  padding: 3px 10px;
  margin-left: 6px;
  border-radius: 999px;
  background: var(--primary-weak);
  color: var(--primary);
  text-decoration: none;
  font-size: 12px;
  transition: background .2s;
}
.friend-links a:hover { background: #dbeafe; }

@media (max-width: 600px) {
  .header-inner { height: 54px; gap: 8px; }
  .footer-inner { flex-direction: column; align-items: flex-start; gap: 8px; }
  .logo { font-size: 17px; gap: 6px; }
  .logo-badge { width: 26px; height: 26px; font-size: 13px; border-radius: 8px; }
  .nav { gap: 2px; }
  .nav-link { padding: 5px 9px; font-size: 13px; }
}
</style>
