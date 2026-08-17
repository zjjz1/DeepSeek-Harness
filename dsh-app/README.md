# dsh-app — Electron 桌面壳层

DeepSeek Harness 桌面端的 Electron 启动器（无边框沉浸式窗口）。

## 组成

| 文件 | 职责 |
|---|---|
| `main.js` | 主进程：窗口 / 托盘 / 服务管理（3080 端口接管、崩溃恢复）/ 首启初始化（Node 检测 + 依赖下载）/ 讯飞转写 IPC / 开机自启动 / 外部链接桥 |
| `preload.js` | 渲染层 contextBridge（`window.dsh.*`） |
| `renderer/` | 壳层界面：顶部控制层、窗口按钮、初始化 / 崩溃 / 退出 / 多开弹窗、webview |
| `webview-preload.js` | webview 内桥（`window.__dshDesktop__`：开机自启 / 语音转写 / 打开外部链接） |
| `voice-xfyun.js` | 讯飞「录音文件转写极速版」全流程（上传 → 建任务 → 轮询，HMAC-SHA256 签名，零依赖） |
| `build/installer.nsh` | NSIS 安装器：D 盘默认路径 + Users 写权限授权 |
| `build.bat` | 一键打包（管理员运行） |

## 启动流程

1. 检测系统 Node.js（≥ 20.19）；缺失或过旧 → 用随包 `node-v24.19.0-x64.msi` 静默安装
2. 检查 `resources/harness` 依赖，缺失则用随包 pnpm 下载（10 分钟停滞保护）
3. 启动 harness 服务（`dsh web`，端口 3080；被旧实例占用时先接管端口）
4. webview 加载 `http://127.0.0.1:3080`；服务崩溃自动重启（限 2 次）并弹窗提示

## 构建安装包

```bash
npm install
build.bat        # 管理员权限（NSIS 符号链接）
```

产物：`dist/DeepSeek Harness Setup 0.1.0.exe`

> `package.json` 的 `build.extraResources` 从 `C:/Users/31773/Desktop/deepseek-harness` 取 harness 源码，构建前请改为本地 harness 路径（需先应用 `harness-patches/` 并构建插件 `lib/`）。
