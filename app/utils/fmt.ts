// 北京时间显示工具（固定 UTC+8 偏移，SSR/CSR 永远一致，避免 hydration mismatch）
// - ISO 时间字符串 → 转北京时间；纯日期（YYYY-MM-DD，无 T）→ 原样返回前 10 位
// - withTime=true 返回 "YYYY-MM-DD HH:mm"，否则仅日期
export function fmtCN(v: string | null | undefined, withTime = false): string {
  if (!v) return ''
  const s = String(v)
  if (!s.includes('T')) return s.slice(0, 10)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const t = new Date(d.getTime() + 8 * 3600e3)
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`
  return withTime ? `${date} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}` : date
}
