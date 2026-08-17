// ============================================================
//  DeepSeek Harness 桌面启动器 - 主进程
//  作者：小鲸
// ============================================================
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn, execFile } = require('child_process');

// 设置应用名（托盘菜单、任务栏显示用）
app.setName('DeepSeek Harness');
// Windows 任务栏正确识别应用身份（跳转列表/右键菜单显示应用名而非 Electron）
try { app.setAppUserModelId('com.deepseek.harness'); } catch (e) {}

// 静默启动（开机自启 background 模式）：登录项带 --hidden 参数，启动后不显示主窗口
const SILENT_LAUNCH = process.argv.includes('--hidden');

// ---------------- 常量 ----------------
const HARNESS_URL = 'http://127.0.0.1:3080';
const DEV_HARNESS_DIR = 'C:\\Users\\31773\\Desktop\\deepseek-harness';  // 开发态兜底路径
const MIN_W = 800;
const MIN_H = 600;

// 定位 harness 目录：打包后随包放在 resources/harness 下，开发态用桌面路径
function resolveHarnessDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'harness');
  }
  return DEV_HARNESS_DIR;
}

// 依赖安装完成标记文件（写在 harness 目录内）
const DEPS_MARKER = '.dsh-deps-installed';

// 更新初始化状态并通知渲染层
function setInitStatus(state, message) {
  initStatus = { state, message };
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('init-status', initStatus);
  } catch (e) {}
}

// 等待用户确认安装 Node.js 的回调（含 resolve）
let pendingNodeInstall = null;

// 系统 Node.js 官方 MSI 默认安装路径（兜底；实际位置用 detectNode 自动探测）
const SYSTEM_NODE = 'C:\\Program Files\\nodejs\\node.exe';

// ---------------- 系统 Node 自动检测 ----------------
// 不假设 Node 一定装在官方路径：依次探测官方 MSI 路径、用户级安装、
// nvm-windows 符号链接、以及 PATH 上的 node.exe（fnm/volta 等 shim 也在 PATH），
// 对每个候选实际跑一次 `node -v` 验证（还能排除 Windows 商店的假 node 占位符）。
let detectedNode = null;   // { path, version }，首次检测后缓存

// 跑 node -v 验证候选并取版本号（5 秒超时）
function getNodeVersion(nodeExe) {
  return new Promise((resolve) => {
    const child = spawn(nodeExe, ['-v'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch (e) {}
      resolve('');
    }, 5000);
    child.stdout.on('data', (d) => { out += String(d); });
    child.on('error', () => { clearTimeout(timer); resolve(''); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out.trim() : '');
    });
  });
}

async function detectNode() {
  const candidates = new Set();
  const push = (p) => { if (typeof p === 'string' && p) candidates.add(p); };
  // 1) 官方 MSI 默认路径（也是 nvm-windows 默认符号链接位置）
  push('C:\\Program Files\\nodejs\\node.exe');
  push('C:\\Program Files (x86)\\nodejs\\node.exe');
  // 2) 安装器“仅为当前用户安装”的路径
  if (process.env.LOCALAPPDATA) push(path.join(process.env.LOCALAPPDATA, 'Programs', 'nodejs', 'node.exe'));
  // 3) nvm-windows：NVM_SYMLINK 或默认 %APPDATA%\nvm
  if (process.env.NVM_SYMLINK) push(path.join(process.env.NVM_SYMLINK, 'node.exe'));
  if (process.env.APPDATA) push(path.join(process.env.APPDATA, 'nvm', 'node.exe'));
  // 4) PATH 上的 node.exe（fnm/volta 的 shim、绿色版等都能扫到）
  (process.env.PATH || '').split(';').forEach((dir) => {
    const d = dir.trim().replace(/^"|"$/g, '');
    if (!d) return;
    if (d.toLowerCase().includes('windowsapps')) return;  // 跳过 Windows 商店的假 node
    push(path.join(d, 'node.exe'));
  });
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const version = await getNodeVersion(p);
    if (version) return { path: p, version };
  }
  return null;
}

// pnpm 11 需要 Node >= 20.19；解析不出版本号时不拦截，交给 pnpm 自行判定
function nodeVersionOk(version) {
  const m = /^v?(\d+)\.(\d+)/.exec(version || '');
  if (!m) return true;
  const major = parseInt(m[1], 10);
  const minor = parseInt(m[2], 10);
  return major > 20 || (major === 20 && minor >= 19);
}

// 当前可用的系统 Node（检测结果优先，官方路径兜底），没有则返回 ''
function getSystemNode() {
  if (detectedNode && detectedNode.path && fs.existsSync(detectedNode.path)) return detectedNode.path;
  return fs.existsSync(SYSTEM_NODE) ? SYSTEM_NODE : '';
}

// 首启（或依赖缺失）时：确保 Node.js 环境 → 用 pnpm 安装 harness 依赖（直连官方源 + 超时保护）
function ensureHarnessDeps() {
  return new Promise(async (resolve) => {
    const harnessDir = resolveHarnessDir();
    if (fs.existsSync(path.join(harnessDir, 'node_modules'))) { resolve(true); return; }
    if (fs.existsSync(path.join(harnessDir, DEPS_MARKER))) { resolve(true); return; }
    if (!app.isPackaged) { resolve(true); return; }  // 开发态：直接用现有 node_modules

    // 自动检测系统 Node.js：官方路径 / 用户级安装 / nvm / PATH 上的 node 都能认出来
    try {
      if (!detectedNode) detectedNode = await detectNode();
    } catch (e) { detectedNode = null; }

    // 没检测到 → 提示安装（随包 MSI 静默安装）
    if (!detectedNode) {
      pendingNodeInstall = { resolve, harnessDir };
      setInitStatus('need-node', '未检测到 Node.js 运行环境（需要 v20.19 及以上，约 30 MB），是否继续？');
      return;
    }
    // 检测到了但版本过旧 → 提示安装新版
    if (!nodeVersionOk(detectedNode.version)) {
      pendingNodeInstall = { resolve, harnessDir };
      setInitStatus('need-node', `检测到 Node ${detectedNode.version} 版本过旧（需要 v20.19 及以上），是否安装新版 Node.js（约 30 MB）？`);
      return;
    }
    installDeps(harnessDir, resolve, detectedNode);
  });
}

// 用户点击“继续”后：静默安装 Node.js（需管理员权限，可能弹出系统 UAC 提示）
function installNodeThenDeps() {
  const pending = pendingNodeInstall;
  pendingNodeInstall = null;
  if (!pending) return;
  const { resolve, harnessDir } = pending;
  setInitStatus('installing-node', '正在安装 Node.js 运行环境…（若弹出系统提示，请点“是”）');
  const msi = path.join(process.resourcesPath, 'nodejs', 'node-v24.19.0-x64.msi');
  const child = spawn('C:\\Windows\\System32\\msiexec.exe', ['/i', msi, '/qn', '/norestart'], { windowsHide: true, stdio: 'ignore' });
  child.on('error', () => {
    setInitStatus('error', '无法启动 Node.js 安装程序，请重新打开本应用');
    resolve(false);
  });
  child.on('exit', async (code) => {
    if (code === 0 && fs.existsSync(SYSTEM_NODE)) {
      // 装好后重新检测一次（MSI 默认装到 C:\Program Files\nodejs），拿到版本号
      try { detectedNode = await detectNode(); } catch (e) { detectedNode = null; }
      installDeps(harnessDir, resolve, detectedNode);
    } else {
      setInitStatus('error', 'Node.js 安装失败（可能需要管理员权限），请以管理员身份重新打开本应用');
      resolve(false);
    }
  });
}

// 用户点击“取消”后：无法继续
function cancelNodeInstall() {
  const pending = pendingNodeInstall;
  pendingNodeInstall = null;
  if (!pending) return;
  pending.resolve(false);
  setInitStatus('error', '未安装 Node.js 运行环境，本应用无法运行。');
}

// 用系统 Node + 随包 pnpm 安装依赖：直连官方源，请求级超时 + 停滞检测
function installDeps(harnessDir, resolve, nodeInfo) {
  // 先把检测结果亮出来，确认“自动检测”生效
  setInitStatus('installing', nodeInfo && nodeInfo.version
    ? `已检测到 Node ${nodeInfo.version}，正在连接…`
    : '正在连接…');

  const nodeExe = getSystemNode();
  if (!nodeExe) {
    setInitStatus('error', '未检测到可用的 Node.js 运行环境，请重新打开本应用');
    resolve(false);
    return;
  }

  // 预检：安装目录必须可写。Program Files 默认对普通用户只读，
  // 写不进去会报 EPERM（新版安装包已在安装时自动授权，这里兜底给明确提示）
  try {
    const probe = path.join(harnessDir, '.dsh-write-probe');
    fs.writeFileSync(probe, '1');
    fs.unlinkSync(probe);
  } catch (e) {
    setInitStatus('error', '权限不足：无法写入应用安装目录（Program Files 默认只读）。请用最新版安装包重新安装，或右键本应用选择“以管理员身份运行”');
    resolve(false);
    return;
  }

  const pnpm = path.join(process.resourcesPath, 'pnpm', 'bin', 'pnpm.cjs');
  // 直连官方源（不加 registry 参数）；单次请求 30s 超时；append-only 输出便于解析进度
  const installArgs = [pnpm, 'install', '--reporter=append-only', '--fetch-timeout=30000'];
  const child = spawn(nodeExe, installArgs, {
    cwd: harnessDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  let finished = false;
  let stallTimer = null;

  const finish = (ok, msg) => {
    if (finished) return;
    finished = true;
    if (stallTimer) clearTimeout(stallTimer);
    if (ok) {
      try { fs.writeFileSync(path.join(harnessDir, DEPS_MARKER), String(Date.now())); } catch (e) {}
      setInitStatus('done', '');
      resolve(true);
    } else {
      setInitStatus('error', msg);
      resolve(false);
    }
  };

  // 停滞保护：10 分钟没有任何输出 → 判定挂死，杀掉并报错（不会无限等）
  const armStall = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      try { child.kill(); } catch (e) {}
      finish(false, '下载似乎已停滞（10 分钟无进展），请检查网络后重新打开本应用');
    }, 10 * 60 * 1000);
  };
  armStall();

  const onData = (d) => {
    armStall();
    const lines = String(d).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    const last = lines[lines.length - 1];
    const downloaded = /downloaded\s+(\d+)/i.exec(last);
    const resolved = /resolved\s+(\d+)/i.exec(last);
    if (downloaded) setInitStatus('installing', `正在下载运行组件…已下载 ${downloaded[1]} 个包`);
    else if (resolved) setInitStatus('installing', `正在解析运行组件…已解析 ${resolved[1]} 个包`);
    else setInitStatus('installing', last);
  };
  child.stdout.on('data', onData);
  let errText = '';
  child.stderr.on('data', (d) => {
    errText = (errText + String(d)).slice(-4096);
    onData(d);
  });
  child.on('error', () => finish(false, '无法启动安装程序，请重新打开本应用'));
  child.on('exit', (code) => {
    if (code === 0) { finish(true, ''); return; }
    let msg = '运行组件下载失败，请检查网络后重新打开本应用';
    // 识别权限类报错（EPERM / EACCES），给出可操作的提示而不是笼统的“网络问题”
    if (/EPERM|EACCES|permission denied|access is denied/i.test(errText)) {
      msg = '权限不足：无法写入应用安装目录（Program Files 默认只读）。请用最新版安装包重新安装，或右键本应用选择“以管理员身份运行”';
    }
    finish(false, msg);
  });
}

// ---------------- 状态 ----------------
let mainWindow = null;
let tray = null;
let isQuitting = false;
let serviceProc = null;
let serviceRestarting = false;   // 重启流程进行中：stale 子进程退出不触发崩溃提示
let serviceGeneration = 0;       // 每次启动递增，用于忽略已被新实例取代的旧进程退出
let settings = {};
let settingsPath = '';
let lastCrashNotify = 0;   // 崩溃提示防抖
let exitChoicePending = false;  // 退出选择弹窗进行中
let winMaximized = false;   // 自跟踪最大化状态（frameless 窗口 isMaximized() 不可靠）
let initStatus = { state: 'idle', message: '' };  // harness 依赖初始化状态

// ---- 系统级鼠标检测（绕开 webview 命中问题） ----
let mouseWatchTimer = null;
let mouseInTop = false;
let mouseInTopSince = 0;

// ---------------- 设置持久化 ----------------
function defaultSettings() {
  return {
    autoOpenWeb: true,
    defaultMaximized: true,
    startupLaunch: 'off',
    exitBehavior: null,
    exitBehaviorAsked: false
  };
}

function loadSettings() {
  try {
    settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      settings = Object.assign(defaultSettings(), raw);
    } else {
      settings = defaultSettings();
    }
  } catch (e) {
    console.error('加载设置失败:', e);
    settings = defaultSettings();
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {
    console.error('保存设置失败:', e);
  }
}

function applyAutoLaunch() {
  try {
    const mode = settings.startupLaunch;
    if (mode === 'off') {
      // 开机不启动：移除登录项
      app.setLoginItemSettings({ openAtLogin: false });
    } else if (mode === 'on') {
      // 开机启动：登录项正常启动（显示主窗口）
      app.setLoginItemSettings({ openAtLogin: true, args: [] });
    } else if (mode === 'background') {
      // 静默启动：登录项带 --hidden 参数，启动后驻留托盘不显示窗口
      // （Windows 上 openAsHidden 仅 macOS 有效，须用启动参数实现）
      app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
    }
  } catch (e) {
    console.error('设置开机自启失败:', e);
  }
}

// ---------------- 服务管理 ----------------
function isServiceRunning() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: 3080, timeout: 1500 }, (res) => {
      res.destroy();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// 统一崩溃提示出口：30 秒防抖，避免启动/重启竞态重复弹窗
function notifyServiceCrashed() {
  const now = Date.now();
  if (now - lastCrashNotify < 30000) {
    console.log('[dsh] 崩溃提示被防抖拦截');
    return;
  }
  lastCrashNotify = now;
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('service-crashed'); } catch (e) {}
}

function startService() {
  return new Promise((resolve) => {
    if (serviceProc) { resolve(true); return; }
    console.log('启动 DeepSeek Harness 服务...');
    const generation = ++serviceGeneration;
    const harnessDir = resolveHarnessDir();
    let cmd, args;
    if (app.isPackaged) {
      // 打包后：用系统 Node 直接跑 dsh CLI（等价于 pnpm dsh web）。
      // 注意：resources\nodejs 下打包的是 Node 安装包 MSI（node-v24.19.0-x64.msi），
      // 里面没有 node.exe，直接 spawn 会报 ENOENT（实测踩坑）；
      // 系统 Node 由 need-node 流程保证（自动检测：官方路径 / 用户级安装 / nvm / PATH）。
      const nodeExe = getSystemNode();
      if (!nodeExe) {
        console.error('[dsh] 未检测到可用的系统 Node.js，无法启动服务');
        resolve(false);
        return;
      }
      cmd = nodeExe;
      // 优先用构建产物（纯 Node 运行，无需 tsx/源码）：pnpm deploy 精简布局是 lib/bin.js，
      // 整仓构建布局是 apps/cli/lib/bin.js；两者都找不到时回退 tsx 源码模式。
      const builtBin = [
        path.join(harnessDir, 'lib', 'bin.js'),
        path.join(harnessDir, 'apps', 'cli', 'lib', 'bin.js'),
      ].find((p) => fs.existsSync(p));
      if (builtBin) {
        args = [builtBin, 'web'];
      } else {
        args = ['--import', 'tsx/esm', path.join(harnessDir, 'apps', 'cli', 'src', 'bin.ts'), 'web'];
      }
    } else {
      cmd = process.platform === 'win32' ? 'cmd.exe' : 'sh';
      args = process.platform === 'win32' ? ['/c', 'pnpm dsh web'] : ['-c', 'pnpm dsh web'];
    }
    const child = spawn(cmd, args, {
      cwd: harnessDir,
      windowsHide: true,
      // DSH_APP_EXE: the running app's own exe, for harness plugins that raise
      // Windows toasts (notify-windows uses it as the toast shortcut icon).
      env: { ...process.env, DSH_APP_EXE: app.getPath('exe') },
    });
    serviceProc = child;

      let settled = false;
      const settle = (ok) => {
        if (settled) return;
        settled = true;
        if (timer) clearInterval(timer);
        resolve(ok);
      };

    // 防御：spawn 本身失败（如可执行文件不存在）时不抛未捕获异常，直接判定启动失败
    child.on('error', (err) => {
      console.error('[dsh] 服务进程启动失败:', err.message);
      serviceProc = null;
      if (timer) clearInterval(timer);
      resolve(false);
    });
    child.stdout.on('data', d => console.log('[dsh]', String(d).trim()));
    child.stderr.on('data', d => console.error('[dsh-err]', String(d).trim()));
    child.on('exit', async (code) => {
      console.log('[dsh] 服务进程退出 code=', code, 'generation=', generation);
        const current = serviceProc === child;

        if (serviceRestarting || !current) {
          console.log('[dsh] 忽略预期/过期进程退出');
          return;
        }

      serviceProc = null;
      if (isQuitting) return;
      // 关键：先确认服务是否真的不可用（避免“假崩溃”——pnpm包装进程退出但服务还活着）
      await new Promise(r => setTimeout(r, 800)); // 等端口释放/稳定
      const stillUp = await isServiceRunning();
      if (stillUp) {
        console.log('[dsh] 服务实际仍在运行（包装进程退出），不提示崩溃');
        return;
      }

        // 服务确认不可用：走统一崩溃提示出口（含防抖），后续旧逻辑仅为兼容保留
        notifyServiceCrashed();
        return;

      // 防抖：30 秒内不重复提示
      const now = Date.now();
      notifyServiceCrashed(); if (false) {
        console.log('[dsh] 崩溃提示被防抖拦截');
        return;
      }
      lastCrashNotify = now;
      try { mainWindow && mainWindow.webContents.send('service-crashed'); } catch (e) {}
    });
    let waited = 0;
    const timer = setInterval(async () => {
      waited += 500;
      if (await isServiceRunning()) { clearInterval(timer); resolve(true); }
      else if (waited >= 30000) { clearInterval(timer); resolve(false); }
    }, 500);
  });
}

function stopService() {
  return new Promise((resolve) => {
    if (serviceProc) {
      const p = serviceProc;
      serviceProc = null;
      try { p.kill(); } catch (e) {}
      if (process.platform === 'win32') {
        try { execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], () => resolve()); }
        catch (e) { resolve(); }
      } else { resolve(); }
    } else { resolve(); }
  });
}

// 查找占用指定端口的进程 PID（仅 Windows；netstat 解析）
function getPortPids(port) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve([]); return; }
    execFile('netstat', ['-ano', '-p', 'tcp'], (err, stdout) => {
      if (err) { resolve([]); return; }
      const pids = [];
      stdout.split(/\r?\n/).forEach((line) => {
        if (line.includes(':' + port) && line.includes('LISTENING')) {
          const m = line.trim().split(/\s+/);
          const pid = m[m.length - 1];
          if (pid && /^\d+$/.test(pid)) pids.push(pid);
        }
      });
      resolve(pids);
    });
  });
}

async function restartService() {
  serviceRestarting = true;
  await stopService();
  serviceRestarting = true;

  // 如果服务不是本程序启动的（serviceProc 为 null），端口可能仍被外部进程占用
  // 查找并结束占用 3080 端口的进程
  if (process.platform === 'win32' && !serviceProc) {
    try {
      const pids = await getPortPids(3080);
      for (const pid of pids) {
        try { execFile('taskkill', ['/pid', pid, '/T', '/F']); } catch (e) {}
      }
    } catch (e) {}
  }
  await new Promise(r => setTimeout(r, 1500));
  const restarted = await startService();
  serviceRestarting = false;
  return restarted;
}

async function getServiceStatus() {
  const running = await isServiceRunning();
  return {
    running,
    url: HARNESS_URL,
    port: 3080,
    pid: serviceProc ? serviceProc.pid : null,
    memoryMB: null
  };
}

// ---------------- 系统级鼠标检测（顶部触发区） ----------------
const TOP_HOVER_MS = 200;   // 悬停多久触发显示
const TOP_BAND_PX = 90;     // 顶部触发区高度（容错更大：覆盖按钮区 + 部分移动轨迹）

function startMouseWatch() {
  mouseWatchTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const bounds = mainWindow.getBounds();
    const pt = screen.getCursorScreenPoint();
    const inTop = pt.x >= bounds.x && pt.x <= bounds.x + bounds.width &&
                  pt.y >= bounds.y && pt.y <= bounds.y + TOP_BAND_PX;
    const now = Date.now();
    if (inTop && !mouseInTop) {
      mouseInTop = true;
      mouseInTopSince = now;
      // 悬停满 TOP_HOVER_MS 后通知渲染层显示
      setTimeout(() => {
        if (mouseInTop && mainWindow && !mainWindow.isDestroyed()) {
          try { mainWindow.webContents.send('mouse-in-top'); } catch (e) {}
        }
      }, TOP_HOVER_MS);
    } else if (!inTop && mouseInTop) {
      mouseInTop = false;
      try { mainWindow.webContents.send('mouse-out-top'); } catch (e) {}
    }
  }, 60);
}

// ---------------- 窗口 ----------------
let lastNormalBounds = null;   // 还原用的普通窗口尺寸（手动管理最大化时记录）
let suppressMaximizeFix = false;  // 自绘 setBounds 修正期间抑制 unmaximize 状态翻转

// frameless 窗口在 Windows 上系统 maximize() 会覆盖整个屏幕（含任务栏）。
// 动画交给系统渲染（不自己插值 setBounds）：调用系统 maximize()/unmaximize()
// /minimize() 让 DWM 播放原生过渡，随后在 maximize 事件里把 bounds 修正到
// 工作区（不盖任务栏）。isMaximized() 对 frameless 不可靠，用 bounds 对比
// 工作区判断实际状态。
function doMaximize(win) {
  if (!isActuallyMaximized(win)) {
    lastNormalBounds = win.getBounds();
  }
  winMaximized = true;
  win.maximize();   // 系统动画，之后 maximize 事件会修正到工作区
}

function doRestore(win) {
  winMaximized = false;
  if (win.isMaximized()) {
    win.unmaximize();   // 系统动画，回普通尺寸
  } else if (lastNormalBounds) {
    // 之前被手动 setBounds 修正过（非系统最大化但铺满工作区）：手动还原
    suppressMaximizeFix = true;
    win.setBounds(lastNormalBounds);
    suppressMaximizeFix = false;
  }
  lastNormalBounds = null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    minWidth: MIN_W, minHeight: MIN_H,
    frame: false, show: false,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    backgroundColor: '#1f1f1f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      webSecurity: true,
      sandbox: false
    }
  });

  if (settings.defaultMaximized) {
    doMaximize(mainWindow);
  }
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    // 静默启动（开机自启 background）：启动后驻留托盘，不打扰用户
    if (SILENT_LAUNCH) {
      mainWindow.hide();
      return;
    }
    mainWindow.show();
  });

  // webview 日志转发（preload 由 session.setPreloads 注入，无需标签属性）
  mainWindow.webContents.on('did-attach-webview', (event, webContents) => {
    if (webContents) {
      try {
        webContents.on('console-message', (e, level, message) => {
          console.log('[webview:' + level + ']', message);
        });
        // 拦截 webview 内一切 window.open（在线插件市场「在浏览器打开」、
        // 门户站点的 target=_blank 链接等）：一律交给系统默认浏览器打开，
        // 绝不新开 Electron 窗口（webview 内 window.open 默认静默无效）。
        webContents.setWindowOpenHandler(({ url }) => {
          if (/^https?:\/\//i.test(url)) {
            try { shell.openExternal(url); } catch (e) {}
          }
          return { action: 'deny' };
        });
      } catch (e) {}
    }
  });

  // 调试日志转发
  mainWindow.webContents.on('console-message', (e, level, message) => {
    console.log('[renderer:' + level + ']', message);
  });
  mainWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.error('[did-fail-load]', code, desc, url);
  });

  // 同步最大化状态（供 window-control 使用；用户用 Win+↑/Aero Snap 触发
  // 的系统最大化也走这里——frameless 下同样可能盖住任务栏，系统动画播放
  // 完毕后手动把 bounds 收进工作区）
  mainWindow.on('maximize', () => {
    winMaximized = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const wa = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
        mainWindow.setBounds(wa);
      } catch (e) {}
    }
  });
  mainWindow.on('unmaximize', () => {
    if (suppressMaximizeFix) return;
    winMaximized = false;
  });

  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    handleExitRequest();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---------------- 退出逻辑（自绘弹窗，由渲染层展示） ----------------
function handleExitRequest() {
  // 已记住选择
  if (settings.exitBehaviorAsked && settings.exitBehavior) {
    if (settings.exitBehavior === 'minimize') mainWindow.hide();
    else quitApp();
    return;
  }
  // 首次/未记住：通知渲染层弹出自绘确认框
  if (exitChoicePending) return; // 避免重复弹
  exitChoicePending = true;
  try {
    mainWindow.webContents.send('exit-request');
  } catch (e) {
    exitChoicePending = false;
    quitApp();
  }
}

// 渲染层回传退出选择
function handleExitChoice(choice, remember) {
  exitChoicePending = false;
  if (remember) {
    settings.exitBehaviorAsked = true;
    settings.exitBehavior = choice; // 'minimize' | 'quit'
    saveSettings();
  }
  if (choice === 'minimize') mainWindow.hide();
  else quitApp();
}

function quitApp() {
  isQuitting = true;
  (async () => { await stopService(); app.quit(); })();
}

// ---------------- 托盘 ----------------
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.ico'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('DeepSeek Harness - 运行中');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '关闭程序', click: () => quitApp() }
  ]));
  tray.on('double-click', () => {
    if (!mainWindow) { createWindow(); return; }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

// ---------------- IPC ----------------
// 用窗口 bounds 对比工作区判断是否实际最大化（frameless 窗口 isMaximized() 不可靠）
// Windows 最大化时 bounds 会超出工作区（阴影边框），因此用“覆盖”判断而非“相等”
function isActuallyMaximized(win) {
  try {
    const bounds = win.getBounds();
    const workArea = screen.getDisplayMatching(bounds).workArea;
    return bounds.x <= workArea.x &&
           bounds.y <= workArea.y &&
           bounds.x + bounds.width >= workArea.x + workArea.width &&
           bounds.y + bounds.height >= workArea.y + workArea.height;
  } catch (e) {
    return false;
  }
}

function registerIpc() {
  // 窗口控制
  ipcMain.on('window-control', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (action === 'minimize') {
      win.minimize();   // 系统动画由 DWM 渲染
    } else if (action === 'maximize') {
      // isMaximized() 对 frameless 窗口不可靠（最大化后可能误报 false，
      // 导致还原操作永远走进 maximize() 分支、窗口无法还原）。
      // 统一用 bounds 对比工作区的 isActuallyMaximized 判断 + 手动管理。
      if (isActuallyMaximized(win)) {
        doRestore(win);
      } else {
        doMaximize(win);
      }
    } else if (action === 'close') {
      handleExitRequest();
    }
  });

  ipcMain.handle('get-settings', () => settings);
  // 窗口是否实际最大化（frameless 窗口 isMaximized() 不可靠，用 bounds 判断）；
  // renderer 在 titlebar mousedown 时查询，最大化则先还原再让原生拖动接管
  ipcMain.handle('window-is-actually-maximized', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    return isActuallyMaximized(mainWindow);
  });
  // 同步版还原：titlebar mousedown 同步调用，必须在 Chromium 启动原生
  // 拖动前完成（异步 IPC 会错过时机），故用 ipcMain.on + sendSync
  ipcMain.on('window-restore-if-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    if (isActuallyMaximized(win)) doRestore(win);
  });
  // 语音输入转写：把 webview 录制的 WAV(base64) 交给讯飞「录音文件转写极速版」
  // （上传 → 创建任务 → 轮询查询，HMAC-SHA256 签名，见 voice-xfyun.js）。
  // 失败时返回带具体步骤与 code/message 的详细诊断。
  const { transcribeXfyun } = require('./voice-xfyun.js');
  // 兜底：从 $DSH_HOME/settings.yaml 读取 voice-input 段。webview 内运行的
  // client bundle 可能因版本差异不传 secretKey 等字段，以配置文件为准补缺
  // （payload 优先，配置文件兜底），保证转写不受客户端版本影响。
  function readVoiceSettingsFromYaml() {
    try {
      const home = process.env.DSH_HOME || path.join(require('os').homedir(), '.dsh');
      const raw = fs.readFileSync(path.join(home, 'settings.yaml'), 'utf8');
      const out = {};
      let inBlock = false;
      for (const line of raw.split(/\r?\n/)) {
        if (/^voice-input:\s*$/.test(line)) { inBlock = true; continue; }
        if (!inBlock) continue;
        const m = /^ {2}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        if (!m) { if (/^\S/.test(line)) inBlock = false; continue; }
        let value = m[2].trim();
        const comment = value.indexOf(' #');
        if (comment >= 0) value = value.slice(0, comment).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        out[m[1]] = value;
      }
      return out;
    } catch (e) {
      return {};
    }
  }
  ipcMain.handle('voice-transcribe', async (_event, payload) => {
    const p = payload || {};
    // 字段映射：appId=讯飞 AppID；accessToken/apiKey=讯飞 APIKey；
    // secretKey/apiSecret=讯飞 APISecret；cluster 为火山遗留字段，忽略。
    const yaml = readVoiceSettingsFromYaml();
    const appId = String(p.appId || yaml.appId || '');
    const apiKey = String(p.apiKey || p.accessToken || yaml.apiKey || yaml.accessToken || '');
    const apiSecret = String(p.apiSecret || p.secretKey || yaml.apiSecret || yaml.secretKey || '');
    return transcribeXfyun({
      appId,
      apiKey,
      apiSecret,
      wavBase64: String(p.data || ''),
    });
  });
  // 开机自启动三态（供 harness 设置页经 webview preload 桥调用）
  ipcMain.handle('startup-launch-get', () => settings.startupLaunch || 'off');
  // 在系统默认浏览器打开外部链接（webview preload 桥 openExternal 用；
  // 仅放行 http/https，防被拿去打开本地文件或任意协议）
  ipcMain.handle('open-external', (e, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
    try { shell.openExternal(url); return true; } catch (err) { return false; }
  });
  ipcMain.handle('startup-launch-set', (e, mode) => {
    if (mode !== 'off' && mode !== 'on' && mode !== 'background') return false;
    settings.startupLaunch = mode;
    saveSettings();
    applyAutoLaunch();
    return true;
  });
  ipcMain.handle('get-init-status', () => initStatus);
  ipcMain.on('confirm-node-install', () => installNodeThenDeps());
  ipcMain.on('cancel-node-install', () => cancelNodeInstall());
  ipcMain.handle('save-settings', (e, newSettings) => {
    settings = Object.assign(defaultSettings(), newSettings || {});
    saveSettings();
    applyAutoLaunch();
    return true;
  });
  ipcMain.handle('service-status', () => getServiceStatus());
  ipcMain.handle('service-restart', async () => await restartService());
  ipcMain.handle('app-info', () => ({
    name: 'DeepSeek Harness 桌面启动器',
    version: app.getVersion(),
    author: '小鲸',
    credits: [
      { name: '齿轮图标', by: 'Ayub Irawan', source: 'Icon-Icons.com',
        url: 'https://icon-icons.com/zh/authors/654-ayub-irawan' },
      { name: '字体', by: 'OPPO Sans 3.0 (OPPO)', source: '开源免费商用字体' },
      { name: 'DeepSeek Harness', by: 'DeepSeek AI', source: 'https://github.com/deepseek-ai/deepseek-harness' }
    ]
  }));
  ipcMain.handle('quit-app', () => { quitApp(); return true; });
  ipcMain.handle('hide-window', () => { if (mainWindow) mainWindow.hide(); return true; });
  ipcMain.handle('exit-choice', (e, choice, remember) => {
    handleExitChoice(choice, remember);
    return true;
  });
  ipcMain.handle('show-window', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    return true;
  });
}

// ---------------- 多开限制 ----------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // 已有实例在运行，本实例直接退出（主实例会弹出自绘提示）
  app.quit();
} else {
  app.on('second-instance', () => {
    // 静默启动（后台驻留托盘）时再开一个实例 = 用户想调出主窗口
    if (SILENT_LAUNCH && mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      return;
    }
    // 通知主实例的渲染层弹自绘多开提示
    if (mainWindow && mainWindow.webContents) {
      try { mainWindow.webContents.send('multi-instance'); } catch (e) {}
    }
  });
}

// ---------------- 生命周期 ----------------
app.on('ready', async () => {
  loadSettings();
  applyAutoLaunch();
  registerIpc();

  // webview 桥注入：webview 标签的 preload 属性相对路径按应用根解析，
  // 打包后有兼容坑；改用 Electron 官方的 session.setPreloads，对 webview
  // guest 页面可靠生效，保证 harness 页面里 window.__dshDesktop__ 一定存在。
  try {
    const { session } = require('electron');
    session.defaultSession.setPreloads([path.join(__dirname, 'webview-preload.js')]);
    // 语音输入需要 webview 内的麦克风（MediaRecorder）；Electron 默认拒绝
    // 所有权限请求，这里只放行媒体（含系统弹窗让用户授权麦克风）。
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'media');
    });
  } catch (e) {
    console.error('[dsh] webview preload 注入失败:', e);
  }

  createWindow();
  createTray();
  startMouseWatch();

  const depsOk = await ensureHarnessDeps();
  if (!depsOk) return;   // 依赖安装失败，渲染层已显示错误提示

  // 关键：端口 3080 若被“别的” DeepSeek Harness 实例占用（旧版本残留服务、
  // 官方 CLI 手动起的 web 服务等），必须接管：先杀掉占用进程，再启动自己的服务。
  // 否则页面内容来自外部实例——外部实例一退出，本应用就“打不开”了。
  // （依赖已在上一步装好，此时接管不会影响后续服务启动）
  if (!serviceProc) {
    try {
      const pids = await getPortPids(3080);
      if (pids.length) {
        console.log('[dsh] 端口 3080 被外部进程占用（pid=' + pids.join(',') + '），接管中…');
        for (const pid of pids) {
          try { execFile('taskkill', ['/pid', pid, '/T', '/F']); } catch (e) {}
        }
        await new Promise(r => setTimeout(r, 1500));  // 等端口释放
      }
    } catch (e) {}
  }

  const running = await isServiceRunning();
  if (!running) {
    const ok = await startService();
    if (!ok) {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('service-crashed');
      });
    }
  }
  // 服务就绪后通知渲染层（用于重载 webview）
  setTimeout(() => {
    try { mainWindow && mainWindow.webContents.send('service-ready'); } catch (e) {}
  }, 500);
});

app.on('window-all-closed', () => {
  if (isQuitting) app.quit();
});

app.on('before-quit', () => { isQuitting = true; });
app.on('will-quit', () => {
  if (serviceProc) { try { serviceProc.kill(); } catch (e) {} }
});
