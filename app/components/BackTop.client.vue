<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
// 全局返回顶部：滚动超 400px 出现，平滑回顶；.client 后缀 → 仅客户端渲染，SSR 安全
const show = ref(false)
let ticking = false
function onScroll() {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    show.value = window.scrollY > 400
    ticking = false
  })
}
function toTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <Transition name="bounce">
    <button v-if="show" class="back-top" aria-label="返回顶部" @click="toTop">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
    </button>
  </Transition>
</template>

<style scoped>
.back-top {
  position: fixed;
  right: 18px;
  bottom: 96px;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(180deg, var(--primary), var(--primary-strong));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(37, 99, 235, .35);
  z-index: 90;
  transition: transform .15s, opacity .2s, box-shadow .2s;
}
.back-top:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(37, 99, 235, .45); }
.back-top:active { transform: translateY(1px) scale(.96); }
.back-top svg { width: 20px; height: 20px; }
.bounce-enter-active, .bounce-leave-active { transition: opacity .22s ease, transform .22s ease; }
.bounce-enter-from, .bounce-leave-to { opacity: 0; transform: translateY(8px) scale(.92); }
@media (max-width: 600px) {
  .back-top { right: 14px; bottom: 88px; width: 40px; height: 40px; }
}
</style>
