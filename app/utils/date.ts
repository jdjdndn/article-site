/**
 * 日期格式化工具
 */

/**
 * 格式化日期为友好的中文格式
 * @param date ISO 字符串或 Date 对象
 * @param format 格式类型：'full' | 'short' | 'time'
 * @returns 格式化后的日期字符串
 */
export function formatDate(date: string | Date, format: 'full' | 'short' | 'time' = 'short'): string {
  if (!date) return ''

  const d = new Date(date)
  if (isNaN(d.getTime())) return ''

  // 转换为北京时间 (UTC+8)
  const beijingTime = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  const year = beijingTime.getUTCFullYear()
  const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0')
  const day = String(beijingTime.getUTCDate()).padStart(2, '0')
  const hours = String(beijingTime.getUTCHours()).padStart(2, '0')
  const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0')

  switch (format) {
    case 'full':
      return `${year}年${month}月${day}日 ${hours}:${minutes}`
    case 'time':
      return `${hours}:${minutes}`
    case 'short':
    default:
      return `${year}-${month}-${day}`
  }
}

/**
 * 相对时间格式化（如：3分钟前、2小时前）
 * @param date ISO 字符串或 Date 对象
 * @returns 相对时间字符串
 */
export function relativeTime(date: string | Date): string {
  if (!date) return ''

  const d = new Date(date)
  if (isNaN(d.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays < 7) return `${diffDays}天前`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}个月前`
  return `${Math.floor(diffDays / 365)}年前`
}
