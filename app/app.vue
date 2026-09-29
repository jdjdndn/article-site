<script setup lang="ts">
// 页脚分类入口与导航共用配置（单一数据源：app/config/site.ts）
import { SITE_CATEGORIES } from './config/site'
</script>

<template>
  <div class="site">
    <a href="#main" class="skip-link">跳到正文</a>
    <header class="site-header">
      <div class="container header-inner">
        <NuxtLink to="/" class="logo"><span class="logo-badge">文</span>AI 文章站</NuxtLink>
        <nav class="nav">
          <NuxtLink to="/" class="nav-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
            <span>首页</span>
          </NuxtLink>
          <NuxtLink to="/favorites" class="nav-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.7-5.2 2.7 1-5.9L3.5 9.7l5.9-.9z"/></svg>
            <span>收藏</span>
          </NuxtLink>
          <NuxtLink to="/about" class="nav-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></svg>
            <span>关于</span>
          </NuxtLink>
          <!-- 后台入口已隐藏：直接访问 https://www.wcbblll.cc/admin 输入管理密钥 -->
        </nav>
      </div>
    </header>

    <main id="main" class="container">
      <NuxtPage />
    </main>

    <BackTop />

    <footer class="site-footer">
      <div class="container footer-inner">
        <div class="footer-col">
          <span class="footer-copy">© 2026 AI 文章站 · 优惠攻略 · 好物推荐 · 副业指南</span>
          <nav class="footer-nav">
            <NuxtLink v-for="c in SITE_CATEGORIES" :key="c" :to="{ path: '/', query: { cat: c } }" class="footer-link">{{ c }}</NuxtLink>
          </nav>
        </div>
        <div class="friend-links">
          <a href="https://jdjdndn.github.io" target="_blank" rel="noopener">jdjdndn.github.io</a>
          <a href="https://wcbblll.cc" target="_blank" rel="noopener">wcbblll.cc</a>
          <a href="https://www.wcbblll.cc" target="_blank" rel="noopener">www.wcbblll.cc</a>
          <a href="https://sy.wcbblll.cc" target="_blank" rel="noopener">sy.wcbblll.cc</a>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.site { min-height: 100vh; display: flex; flex-direction: column; }
/* 键盘用户可访问性：跳转正文链接（默认隐藏，聚焦时显示） */
.skip-link {
  position: absolute;
  left: 12px;
  top: -48px;
  z-index: 100;
  padding: 8px 14px;
  border-radius: 8px;
  background: var(--primary, #2563eb);
  color: #fff;
  font-size: 13px;
  text-decoration: none;
  transition: top .15s;
}
.skip-link:focus { top: 12px; }
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 999px;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 14px;
  line-height: 1;
  transition: color .2s, background .2s, box-shadow .2s;
}
.nav-link svg { width: 15px; height: 15px; opacity: .85; }
.nav-link:hover { color: var(--primary); background: var(--primary-weak); }
.nav-link.router-link-active {
  color: var(--primary);
  background: var(--primary-weak);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, .18);
}

main { flex: 1; padding: 28px 0 48px; }

.site-footer {
  border-top: 1px solid rgba(229, 231, 235, .8);
  padding: 22px 0;
  background: linear-gradient(180deg, #ffffff, #f1f5f9);
}
.footer-inner { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; color: var(--text-muted); font-size: 13px; }
.footer-col { display: flex; flex-direction: column; gap: 10px; }
.footer-nav { display: flex; gap: 8px; flex-wrap: wrap; }
.footer-link {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 999px;
  background: var(--primary-weak);
  color: var(--primary);
  text-decoration: none;
  font-size: 12px;
  transition: background .2s;
}
.footer-link:hover { background: #dbeafe; }
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
  .nav-link { padding: 6px 10px; font-size: 13px; gap: 4px; }
  .nav-link svg { width: 14px; height: 14px; }
}
</style>
