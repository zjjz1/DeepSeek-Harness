// 预加载脚本：安全地暴露 IPC 接口给渲染层
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dsh', {
  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  // 窗口控制
  windowControl: (action) => ipcRenderer.send('window-control', action),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  isActuallyMaximized: () => ipcRenderer.invoke('window-is-actually-maximized'),
  // 同步还原（titlebar mousedown 用）：必须在 Chromium 启动原生拖动前完成，
  // 异步 IPC 会错过时机，故用 sendSync
  restoreIfMaximized: () => ipcRenderer.sendSync('window-restore-if-maximized'),
  // 服务
  serviceStatus: () => ipcRenderer.invoke('service-status'),
  serviceRestart: () => ipcRenderer.invoke('service-restart'),
  // 应用信息
  appInfo: () => ipcRenderer.invoke('app-info'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  // 退出选择（自绘弹窗回传）
  exitChoice: (choice, remember) => ipcRenderer.invoke('exit-choice', choice, remember),
  // 事件监听
  onServiceCrashed: (cb) => ipcRenderer.on('service-crashed', () => cb()),
  onServiceReady: (cb) => ipcRenderer.on('service-ready', () => cb()),
  onExitRequest: (cb) => ipcRenderer.on('exit-request', () => cb()),
  onMultiInstance: (cb) => ipcRenderer.on('multi-instance', () => cb()),
  onMouseInTop: (cb) => ipcRenderer.on('mouse-in-top', () => cb()),
  onMouseOutTop: (cb) => ipcRenderer.on('mouse-out-top', () => cb()),
  // 首次初始化（下载运行组件）
  onInitStatus: (cb) => ipcRenderer.on('init-status', (e, payload) => cb(payload)),
  getInitStatus: () => ipcRenderer.invoke('get-init-status'),
  confirmNodeInstall: () => ipcRenderer.send('confirm-node-install'),
  cancelNodeInstall: () => ipcRenderer.send('cancel-node-install'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  // Harness 地址
  harnessUrl: 'http://127.0.0.1:3080'
});
