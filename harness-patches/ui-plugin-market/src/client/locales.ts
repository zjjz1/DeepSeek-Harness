/** `pluginMarket` namespace dictionaries: the sidebar-foot entry and panel chrome copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'entry.label': '插件市场',
  'entry.tooltip': '打开插件市场',
  'panel.title': '插件市场',
  'panel.close': '关闭插件市场',
  'panel.tabLocal': '本地插件',
  'panel.tabOnline': '在线市场',
  'panel.localLoading': '正在读取本地插件…',
  'panel.localError': '读取本地插件失败',
  'panel.localRetry': '重试',
  'panel.localEmpty': '暂无已注册插件',
  'panel.localEnabled': '已启用',
  'panel.localDisabled': '未启用',
  'panel.localPhasePending': '等待中',
  'panel.localPhaseLoading': '加载中',
  'panel.localPhaseActive': '运行中',
  'panel.localPhaseFailed': '加载失败',
  'panel.localPhaseUnloading': '卸载中',
  'panel.localPhaseUnobserved': '未观察',
  'panel.onlineNote': '在线市场托管于 GitHub Pages（默认：dsh-plugin-portal）；若网络不可达请用「在浏览器打开」。',
  'panel.onlineOpen': '在浏览器打开',
  'panel.onlineHint': '在线市场页面需要加载外部站点，可能较慢或不可达。',
  'panel.onlineLoad': '在此加载',
  'panel.onlineLoading': '正在加载市场…',
} satisfies Record<string, string>

/** The plugin market namespace key union. */
export type PluginMarketKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'entry.label': 'Plugin Market',
  'entry.tooltip': 'Open plugin market',
  'panel.title': 'Plugin Market',
  'panel.close': 'Close plugin market',
  'panel.tabLocal': 'Installed',
  'panel.tabOnline': 'Online',
  'panel.localLoading': 'Reading local plugins…',
  'panel.localError': 'Failed to read local plugins',
  'panel.localRetry': 'Retry',
  'panel.localEmpty': 'No registered plugins',
  'panel.localEnabled': 'Enabled',
  'panel.localDisabled': 'Disabled',
  'panel.localPhasePending': 'Pending',
  'panel.localPhaseLoading': 'Loading',
  'panel.localPhaseActive': 'Active',
  'panel.localPhaseFailed': 'Failed',
  'panel.localPhaseUnloading': 'Unloading',
  'panel.localPhaseUnobserved': 'Unobserved',
  'panel.onlineNote': 'The online market is hosted on GitHub Pages (default: dsh-plugin-portal); if the network cannot reach it, use "Open in browser".',
  'panel.onlineOpen': 'Open in browser',
  'panel.onlineHint': 'The online market loads an external site; it may be slow or unreachable.',
  'panel.onlineLoad': 'Load here',
  'panel.onlineLoading': 'Loading market…',
} satisfies Record<PluginMarketKey, string>
