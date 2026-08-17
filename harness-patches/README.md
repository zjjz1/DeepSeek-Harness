# harness-patches — 对官方 deepseek-harness 的补丁包

本目录包含桌面端对 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（官方 MIT 项目）的**新增插件**与**增量修改**。

## 目录

### 新增插件（完整包，含 `src/` + `package.json`）

| 包 | 类型 | 功能 |
|---|---|---|
| `ui-statistics` | client | 数据统计面板（今天按小时 / 按天聚合、随柱高悬浮窗、按范围加载） |
| `ui-plugin-market` | client | 插件市场（本地清单 + 在线市场） |
| `ui-voice-input` | client | 语音输入（长按空格录音、覆盖层、讯飞转写拼接发送） |
| `ui-startup-launch` | client | 设置-开机自启动三态（配合壳层 webview 桥） |
| `ui-export` | client | 会话导出（Markdown / HTML / SVG / 复制） |
| `ui-schedule` | client | 定时提醒 UI（配合官方 `dsh-schedule` 引擎） |
| `ui-compare` | client | 多会话对比与合并导出 |
| `ui-knowledge-base` | client | 知识库设置 UI（配合 `knowledge-base` 宿主插件） |
| `ui-speech` | client | 助手消息朗读（系统语音） |
| `ui-team` | client | 团队模式三面板视图（对话切换 / 成员互发 / Markdown 渲染） |
| `voice-input` | host | 语音输入配置命名空间（`voice-input` settings） |
| `notify-windows` | host | Windows 系统通知（提醒到期 / 任务完成 toast，带应用图标） |
| `knowledge-base` | host | 本地知识库检索工具（`kb_search` / `kb_list`，关键词检索） |
| `team-mode` | host | 队长-成员团队模式（任务派发 / 成员互发 / 终止会话） |

### 增量修改（仅改动文件 + 说明）

| 包 | 文件 | 修改内容 |
|---|---|---|
| `apiproxy` | `src/api-proxy.ts` | `WEB_SETTINGS_NAMESPACES` 白名单追加 `voice-input` / `knowledge-base` / `team-mode`（否则这些设置能读不能写） |
| `ui-conversation` | `src/client/chat/pricing.ts` | 双时段价格表（V4 定价：高峰 9-12/14-18 ×2）+ 缓存拆分成本 |

## 应用步骤

1. 将各包目录复制到官方仓库对应位置：

   - client 包 → `packages/client/<name>/`
   - host 包 → `packages/host/<name>/`（`knowledge-base` → `packages/knowledge/`，`team-mode` → `packages/team/`）

2. 注册三处（新增包必需，缺一处会静默不加载）：

   - `tsconfig.client.json`：`references` 添加各 client 包
   - `packages/bundle/web-app/cordis.patch.yml`：`dsh.client` roster 添加各 client 包行
   - `packages/bundle/web-app/package.json`：dependencies 添加各 client 包（`workspace:^`）

3. 构建（**每个 client 包内执行，必须带 client face**）：

   ```bash
   tsc -b
   tsdown --env.DSH_BUILD_FACE=client
   ```

   > ⚠️ 切勿不带 face 在根目录跑 tsdown——会以 host face 重打全部 client 包，破坏 externals。

4. host 包（`voice-input` / `notify-windows` / `knowledge-base` / `team-mode` / `apiproxy`）构建：

   ```bash
   tsc -b tsconfig.host.json
   tsdown   # 根配置，host face
   ```

5. 同步构建产物到 `packages/bundle/web-app/node_modules/@deepseek-ai/` 等运行时路径，重启 `dsh web` 服务生效。

## 注意

- `team-mode` 构建入口是 `src/index-fixed.ts`（`tsdown.config.ts` 指向它），改代码时两文件需同步。
- 新增 host settings 命名空间后必须同步更新 `apiproxy` 白名单。
