; ============================================================
; DeepSeek Harness 安装器自定义逻辑
;
; 打开安装器时先扫描分区：
;   - 检测到 D 盘 → 默认安装到 D:\Program Files\DeepSeek Harness
;   - 没有 D 盘   → 默认安装到 C:\Program Files\DeepSeek Harness
;
; 配合 electron-builder 的 oneClick:false + allowToChangeInstallationDirectory，
; 安装器会显示“选择安装目录”页：直接下一步 = 快速安装（用上面的默认路径），
; 手动改目录 = 自定义安装。
; ============================================================

!macro customInit
  ${If} ${FileExists} "D:\"
    StrCpy $INSTDIR "D:\Program Files\DeepSeek Harness"
  ${Else}
    StrCpy $INSTDIR "$PROGRAMFILES64\DeepSeek Harness"
  ${EndIf}
!macroend

; ============================================================
; 首启初始化时，应用要在 resources\harness 下执行 pnpm install
; （创建 node_modules、_tmp_* 临时文件、.dsh-* 标记等），
; 而 Program Files 默认只对普通用户只读 → 不授权会直接报
; [EPERM] operation not permitted（实测踩坑）。
;
; 这里在安装完成后把修改权限授给 Users 组：
;   - SID 用 *S-1-5-32-545（BUILTIN\Users），避免系统语言差异（如中文系统）
;   - (OI)(CI) 让子目录/文件继承，/T 对已存在的文件递归生效
; ============================================================
!macro customInstall
  DetailPrint "正在为运行目录授权写入权限（Users）…"
  nsExec::ExecToLog 'icacls "$INSTDIR" /grant "*S-1-5-32-545:(OI)(CI)M" /T /Q'
!macroend
