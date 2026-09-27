<script setup lang="ts">
import { ref } from 'vue'

const route = useRoute()
const config = useRuntimeConfig()
const key = route.query.key as string | undefined

// 后台 key 校验（与 MANAGE_KEY 环境变量比对；后续接管理 API）
const authed = computed(() => !!key && key === config.public.manageKey)

// 新文章草稿表单（手动新增）
const draft = ref({
  title: '',
  summary: '',
  category: '优惠',
  content: JSON.stringify([{ type: 'text', text: '' }], null, 2),
  links: JSON.stringify([], null, 2),
})

async function createArticle() {
  if (!authed.value) return
  const res = await $fetch('/api/admin/articles', {
    method: 'POST',
    body: draft.value,
  })
  alert(`已创建：${res.id}`)
}
</script>

<template>
  <div>
    <div v-if="!authed" class="card warn">
      <p>需要后台权限：请在 URL 末尾加 <code>?key=你的管理密钥</code></p>
      <p class="hint">示例：/admin?key=xxx（密钥与部署环境变量 MANAGE_KEY 一致）</p>
    </div>

    <div v-else class="card">
      <h2>新建文章（草稿）</h2>
      <form @submit.prevent="createArticle">
        <label>标题
          <input v-model="draft.title" required />
        </label>
        <label>摘要
          <textarea v-model="draft.summary" rows="2"></textarea>
        </label>
        <label>分类
          <select v-model="draft.category">
            <option>优惠</option><option>攻略</option><option>好物</option><option>副业</option>
          </select>
        </label>
        <label>正文（JSON 段落数组，text/ad）
          <textarea v-model="draft.content" rows="8"></textarea>
        </label>
        <label>链接（JSON [{label,url}]）
          <textarea v-model="draft.links" rows="3"></textarea>
        </label>
        <button type="submit" class="submit">创建</button>
      </form>
      <p class="hint">管理 API 尚未实现，表单先留接口占位。</p>
    </div>
  </div>
</template>

<style scoped>
.warn { color: #fa541c; }
.hint { color: #999; font-size: 13px; margin-top: 8px; }
form label { display: block; margin-bottom: 12px; font-size: 14px; color: #555; }
input, textarea, select { width: 100%; margin-top: 4px; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; font-family: inherit; box-sizing: border-box; }
.submit { margin-top: 8px; padding: 8px 24px; background: #1677ff; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
</style>
