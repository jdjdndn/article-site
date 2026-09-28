import { getHeader, createError } from 'h3'
import { useRuntimeConfig } from '#imports'

// 管理接口鉴权：仅接受 Authorization: Bearer <key>
// （?key= 已移除：密钥走 URL 会进浏览器历史/分享链接/CF 访问日志，属泄漏面）
// 与部署环境变量 MANAGE_KEY 比对（runtimeConfig.manageKey，server 端 secret）
export function requireAdmin(event: any) {
  const config = useRuntimeConfig(event)
  const bearer = getHeader(event, 'authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!config.manageKey || bearer !== config.manageKey) {
    throw createError({ statusCode: 401, statusMessage: '未授权：需要管理密钥' })
  }
}
