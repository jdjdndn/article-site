// 站点配置（常量驱动，改这里即可，无需动数据库/代码结构）
// 首页分类 tab：想新增分类 = 在这里加一项，前台/后台/API 全部生效
export const SITE_CATEGORIES = ['优惠', '攻略', '好物', '副业']

// 首页顶部公告条（可多条；留空数组 = 不显示）
export interface Banner {
  text: string
  link?: string
  highlight?: boolean // 是否高亮强调
}
export const SITE_BANNERS: Banner[] = [
  { text: '🛒 每日更新优惠好物，收藏功能已上线', link: '/favorites' },
]
