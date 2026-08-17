// ============================================================
//  DeepSeek Harness 桌面启动器 - 渲染层交互逻辑
//  （已移除：自定义设置菜单 / JS 手动拖动。改用顶部原生 app-region 拖动）
// ============================================================
(function () {
  'use strict';

  // ---------- DOM 引用 ----------
  const chrome = document.getElementById('chrome');
  const winBtns = document.getElementById('win-btns');
  const btnMin = document.getElementById('btn-min');
  const btnMax = document.getElementById('btn-max');
  const btnClose = document.getElementById('btn-close');
  const crashOverlay = document.getElementById('crash-overlay');
  const initOverlay = document.getElementById('init-overlay');
  const initText = document.getElementById('init-text');
  const harnessView = document.getElementById('harness-view');
  const titlebarDrag = document.getElementById('titlebar-drag');

  // ---------- 状态 ----------
  let chromeVisible = false;      // 控制层是否显示
  let chromeHovering = false;     // 鼠标是否在控制层上
  let chromeHideTimer = null;

  // ============ 顶部控制层显隐（幂等 + 状态同步） ============
  let zoneHoverTimer = null;   // 悬停延迟计时
  const ZONE_DELAY = 400;      // 悬停 400ms 后显示按钮

  function showChrome() {
    clearTimeout(chromeHideTimer);
    if (chromeVisible) { armChromeHideTimer(); return; }
    chromeVisible = true;
    chrome.classList.add('chrome-visible');
    chrome.classList.remove('chrome-hidden');
    animateWinBtnsIn();
    void chrome.offsetWidth;
    armChromeHideTimer();
  }

  function hideChrome() {
    if (!chromeVisible) return;
    if (winBtnsHovering) return;   // 鼠标在按钮上时不隐藏
    chromeVisible = false;
    chromeHovering = false;
    chrome.classList.remove('chrome-visible');
    chrome.classList.add('chrome-hidden');
    animateWinBtnsOut();
  }

  function armChromeHideTimer() {
    clearTimeout(chromeHideTimer);
    chromeHideTimer = setTimeout(() => {
      if (!chromeHovering && !winBtnsHovering) hideChrome();
    }, 500);
  }

  chrome.addEventListener('mouseenter', () => {
    chromeHovering = true;
    clearTimeout(chromeHideTimer);
  });
  chrome.addEventListener('mouseleave', () => {
    chromeHovering = false;
    armChromeHideTimer();
  });

  // 按钮组自身悬停保护：鼠标停在按钮上时绝不自动隐藏
  let winBtnsHovering = false;
  winBtns.addEventListener('mouseenter', () => {
    winBtnsHovering = true;
    clearTimeout(chromeHideTimer);
  });
  winBtns.addEventListener('mouseleave', () => {
    winBtnsHovering = false;
    armChromeHideTimer();
  });

  // 顶部触发：系统级鼠标检测（主进程 screen.getCursorScreenPoint，绕开 webview 命中问题）
  window.dsh.onMouseInTop(() => {
    chromeHovering = true;
    clearTimeout(zoneHoverTimer);
    zoneHoverTimer = setTimeout(() => showChrome(), 0);
  });
  window.dsh.onMouseOutTop(() => {
    chromeHovering = false;
    clearTimeout(zoneHoverTimer);
    armChromeHideTimer();
  });

  // 三按钮动画（从上方滑下；透明度固定）
  function animateWinBtnsIn() {
    winBtns.classList.remove('win-btns-hidden');
    winBtns.classList.add('win-btns-visible');
    // 两段式滑入：先放到上方，再滑到最终位
    winBtns.style.transition = 'none';
    winBtns.style.transform = 'translate(-50%, -22px)';
    void winBtns.offsetWidth;
    winBtns.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
    winBtns.style.transform = 'translate(-50%, 0)';
  }
  function animateWinBtnsOut() {
    winBtns.classList.remove('win-btns-visible');
    winBtns.classList.add('win-btns-hidden');
    winBtns.style.transition = 'transform 0.2s ease-in';
    winBtns.style.transform = 'translate(-50%, -48px)';   // 滑出完整高度，完全出屏
  }

  // ============ 顶部原生拖动条 ============
  // frameless 窗口最大化时 -webkit-app-region: drag 在 Windows 上无效（已知
  // 限制：系统不会把最大化窗口拖下来）。mousedown 时若窗口已实际最大化，
  // 同步还原，原生拖动随即接管（还原后即可正常拖动 / Aero Snap）。
  if (titlebarDrag) {
    titlebarDrag.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const btn = e.target.closest('#btn-min, #btn-max, #btn-close');
      if (btn) return;   // 按钮区 no-drag，不处理
      // sendSync：必须在 Chromium 启动原生拖动前完成还原
      window.dsh.restoreIfMaximized();
    });
  }

  // ============ 窗口控制按钮（click 事件触发：窗口操作必须等鼠标按键释放） ============
  function fireWin(action) {
    window.dsh.windowControl(action);
  }

  // 全局捕获阶段监听 click（鼠标松开后触发——窗口操作必须等按键释放，
  // 否则 Windows 在鼠标按键按住期间会忽略最小化/还原等窗口状态变更）
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#btn-min, #btn-max, #btn-close');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (btn.id === 'btn-min') fireWin('minimize');
    else if (btn.id === 'btn-max') fireWin('maximize');
    else if (btn.id === 'btn-close') fireWin('close');
  }, true);

  // ============ 崩溃弹窗 ============
  function showCrash() {
    crashOverlay.classList.remove('hidden');
  }
  document.getElementById('crash-later').addEventListener('click', () => {
    crashOverlay.classList.add('hidden');
  });
  document.getElementById('crash-restart').addEventListener('click', async () => {
    crashOverlay.classList.add('hidden');
    const ok = await window.dsh.serviceRestart();
    if (ok) {
      setTimeout(() => { try { harnessView.reload(); } catch (e) {} }, 500);
    } else {
      alert('重启失败，请检查服务窗口');
    }
  });
  window.dsh.onServiceCrashed(() => showCrash());

    // 启动/重启期间不做“自动 kill + restart”，只周期探测，服务就绪后重载。
    let waitForServiceTimer = null;
    let waitForServiceAttempts = 0;
    async function waitForServiceThenReloadNew() {
      waitForServiceAttempts++;
      if (waitForServiceAttempts > 20) {
        showCrash();
        return;
      }
      const st = await window.dsh.serviceStatus();
      if (st.running) {
        waitForServiceAttempts = 0;
        setTimeout(() => { try { harnessView.reload(); } catch (e) {} }, 300);
        return;
      }
      clearTimeout(waitForServiceTimer);
      waitForServiceTimer = setTimeout(waitForServiceThenReloadNew, 1500);
    }


  // webview 加载失败 → 先确认服务；服务不在就自动拉起（限 2 次），仍失败才弹崩溃窗
  let webviewFailed = false;
  let autoRecoverAttempts = 0;
  harnessView.addEventListener('did-fail-load', async (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // 只处理主框架（harness 页面本身）加载失败：内嵌 iframe（如在线插件
    // 市场）加载失败也会触发本事件，若一并处理会把整个 harness 页面重载
    // （白屏闪动 + 界面重新进入）——子框架失败必须直接忽略。
    if (isMainFrame === false) return;
    const st = await window.dsh.serviceStatus();
      if (!st.running) {
        webviewFailed = true;
        waitForServiceThenReloadNew();
        return;
      }

    if (!st.running) {
      webviewFailed = true;
      if (autoRecoverAttempts < 2) {
        autoRecoverAttempts++;
        const ok = await window.dsh.serviceRestart();
        if (ok) {
          setTimeout(() => { try { harnessView.reload(); } catch (e) {} }, 600);
        } else {
          showCrash();
        }
      } else {
        showCrash();
      }
    } else {
      setTimeout(() => { try { harnessView.reload(); } catch (e) {} }, 1000);
    }
  });
  window.dsh.onServiceReady(() => {
    autoRecoverAttempts = 0;
    if (webviewFailed) {
      webviewFailed = false;
      crashOverlay.classList.add('hidden');
      setTimeout(() => { try { harnessView.reload(); } catch (e) {} }, 300);
    }
  });

  // ============ 退出确认弹窗 ============
  const exitOverlay = document.getElementById('exit-overlay');
  const exitRemember = document.getElementById('exit-remember');
  function showExitDialog() {
    exitRemember.checked = false;
    exitOverlay.classList.remove('hidden');
  }
  function hideExitDialog() {
    exitOverlay.classList.add('hidden');
  }
  window.dsh.onExitRequest(() => showExitDialog());
  document.getElementById('exit-min').addEventListener('click', () => {
    const remember = exitRemember.checked;
    hideExitDialog();
    window.dsh.exitChoice('minimize', remember);
  });
  document.getElementById('exit-quit').addEventListener('click', () => {
    const remember = exitRemember.checked;
    hideExitDialog();
    window.dsh.exitChoice('quit', remember);
  });

  // ============ 多开提示弹窗 ============
  const multiOverlay = document.getElementById('multi-overlay');
  function showMultiDialog() {
    multiOverlay.classList.remove('hidden');
  }
  document.getElementById('multi-open').addEventListener('click', () => {
    multiOverlay.classList.add('hidden');
    window.dsh.showWindow();
  });
  document.getElementById('multi-cancel').addEventListener('click', () => {
    multiOverlay.classList.add('hidden');
  });
  window.dsh.onMultiInstance(() => showMultiDialog());

  // ============ 首次初始化（下载运行组件） ============
  let depsReady = false;

  function updateInitUI(status) {
    if (!status) return;
    const initBtns = document.getElementById('init-btns');
    if (status.state === 'need-node') {
      initOverlay.classList.remove('hidden');
      initText.textContent = status.message || '需要安装 Node.js 运行环境';
      if (initBtns) initBtns.classList.remove('hidden');
    } else if (status.state === 'installing' || status.state === 'installing-node') {
      initOverlay.classList.remove('hidden');
      initText.textContent = status.message || '请稍候…';
      if (initBtns) initBtns.classList.add('hidden');
    } else if (status.state === 'done') {
      initOverlay.classList.add('hidden');
      depsReady = true;
      setTimeout(checkServiceUp, 3000);
    } else if (status.state === 'error') {
      initOverlay.classList.remove('hidden');
      initText.textContent = (status.message || '初始化失败') + '\n请关闭后重新打开本应用。';
      if (initBtns) initBtns.classList.add('hidden');
    } else if (status.state === 'idle') {
      depsReady = true;
    }
  }

  function checkServiceUp() {
    if (!depsReady) return;
    window.dsh.serviceStatus().then((st) => { if (!st.running) waitForServiceThenReloadNew(); });
  }

  window.dsh.onInitStatus(updateInitUI);
  document.getElementById('init-ok').addEventListener('click', () => { window.dsh.confirmNodeInstall(); });
  document.getElementById('init-cancel').addEventListener('click', () => { window.dsh.cancelNodeInstall(); });

  // ============ 启动 ============
  async function init() {
    updateInitUI(await window.dsh.getInitStatus());
    if (depsReady) setTimeout(checkServiceUp, 3000);
  }

  init();
})();
