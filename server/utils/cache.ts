// 边缘缓存定点失效：文章变更后 purge 详情页 + 首页
// 详情页 s-maxage=300、首页 s-maxage=60，失败最多延迟对应 TTL，无需强一致
export async function purgePage(path: string) {
  const url = `https://www.wcbblll.cc${path}`
  try {
    // @ts-expect-error Cloudflare Workers 环境的 Cache API
    if (typeof caches !== 'undefined' && caches?.default) {
      await caches.default.delete(url)
    }
  } catch (e: any) {
    console.error('[purge]', path, e?.message)
  }
}

export async function purgeArticle(id: string) {
  await Promise.all([purgePage(`/article/${id}`), purgePage('/')])
}
