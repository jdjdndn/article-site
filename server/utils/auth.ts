import { getHeader, getQuery, createError } from 'h3'
import { useRuntimeConfig } from '#imports'

// 管理接口鉴权：Authorization: Bearer <key> 或 ?key=<key>
// 与部署环境变量 MANAGE_KEY 比对（runtimeConfig.manageKey，server 端 secret）
export function requireAdmin(event: any) {
  const config = useRuntimeConfig(event)
  const query = getQuery(event)
  const bearer = getHeader(event, 'authorization')?.replace(/^Bearer\s+/i, '') || ''
  const key = typeof query.key === 'string' && query.key ? query.key : bearer
  if (!config.manageKey || key !== config.manageKey) {
    throw createError({ statusCode: 401, statusMessage: '未授权：需要管理密钥' })
  }
}
