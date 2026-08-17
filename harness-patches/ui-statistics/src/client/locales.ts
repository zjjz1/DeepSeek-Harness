/** `statistics` namespace dictionaries: the sidebar-foot entry and panel copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'entry.label': '数据统计',
  'entry.tooltip': '打开数据统计',
  'panel.title': '数据统计',
  'panel.close': '关闭数据统计',
  'panel.loading': '正在汇总会话数据…',
  'panel.error': '统计加载失败',
  'panel.retry': '重试',
  'panel.empty': '暂无统计数据（还没有完成过请求）',
  'panel.rangeToday': '今天',
  'panel.range7d': '近 7 天',
  'panel.range30d': '近 30 天',
  'panel.rangeAll': '全部',
  'panel.cardRequests': '请求次数',
  'panel.cardInput': '输入',
  'panel.cardOutput': '输出',
  'panel.cardCacheHit': '缓存命中',
  'panel.cardCost': '花费',
  'panel.chartTitle': 'Token 消耗趋势',
  'panel.chartPeak': '峰值 {value}',
  'panel.chartLegendInput': '输入',
  'panel.chartLegendOutput': '输出',
  'panel.tipTotal': '总 token',
  'panel.sessionsTitle': '会话明细',
  'panel.colSession': '会话',
  'panel.colRequests': '请求',
  'panel.colInput': '输入',
  'panel.colOutput': '输出',
  'panel.colCost': '花费',
  'panel.peakHint': '高峰时段（北京时间 9-12、14-18）按双倍价估算',
} satisfies Record<string, string>

/** The statistics namespace key union. */
export type StatisticsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'entry.label': 'Statistics',
  'entry.tooltip': 'Open statistics',
  'panel.title': 'Statistics',
  'panel.close': 'Close statistics',
  'panel.loading': 'Aggregating session data…',
  'panel.error': 'Failed to load statistics',
  'panel.retry': 'Retry',
  'panel.empty': 'No statistics yet (no completed requests)',
  'panel.rangeToday': 'Today',
  'panel.range7d': '7 days',
  'panel.range30d': '30 days',
  'panel.rangeAll': 'All',
  'panel.cardRequests': 'Requests',
  'panel.cardInput': 'Input',
  'panel.cardOutput': 'Output',
  'panel.cardCacheHit': 'Cache hit',
  'panel.cardCost': 'Cost',
  'panel.chartTitle': 'Token usage trend',
  'panel.chartPeak': 'Peak {value}',
  'panel.chartLegendInput': 'Input',
  'panel.chartLegendOutput': 'Output',
  'panel.tipTotal': 'Total tokens',
  'panel.sessionsTitle': 'Sessions',
  'panel.colSession': 'Session',
  'panel.colRequests': 'Requests',
  'panel.colInput': 'Input',
  'panel.colOutput': 'Output',
  'panel.colCost': 'Cost',
  'panel.peakHint': 'Peak hours (Beijing 09-12, 14-18) are estimated at double rate',
} satisfies Record<StatisticsKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'statistics'
