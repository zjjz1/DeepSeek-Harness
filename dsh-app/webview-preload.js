// webview-preload.js
// Harness 网页运行在 <webview> 内，本脚本把桌面壳层的 IPC 桥暴露为
// window.__dshDesktop__，供 harness 客户端插件（如开机自启动设置行）调用。
// 仅在 webview 内部注入；普通浏览器打开 harness 时该对象不存在，插件需容错。
// 幂等：session.setPreloads 与标签 preload 均可能注入，重复执行不覆盖。
const { contextBridge, ipcRenderer } = require('electron');

const existing = (globalThis).__dshDesktop__;
if (existing === undefined) {
  contextBridge.exposeInMainWorld('__dshDesktop__', {
    // 开机自启动三态：'off' 开机不启动 / 'on' 开机启动 / 'background' 静默启动
    getStartupLaunch: () => ipcRenderer.invoke('startup-launch-get'),
    setStartupLaunch: (mode) => ipcRenderer.invoke('startup-launch-set', mode),
    // 语音输入转写：payload = { appId, accessToken, cluster, data(WAV base64) }
    // 返回 { ok, text } 或 { ok: false, error }
    transcribeAudio: (payload) => ipcRenderer.invoke('voice-transcribe', payload),
    // 在系统默认浏览器打开外部 http(s) 链接（在线插件市场「在浏览器打开」）
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
  });
}
