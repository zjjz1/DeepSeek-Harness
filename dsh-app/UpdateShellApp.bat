@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   UpdateShellApp - rebuild desktop app.asar
echo ============================================
echo.

set STAGE=%~dp0build\app-stage
set ASAR=%~dp0dist\win-unpacked\resources\app.asar

if not exist "%ASAR%" (
  echo [ERROR] app.asar not found: %ASAR%
  echo         Run "npm run pack" first to generate dist\win-unpacked.
  echo.
  pause
  exit /b 1
)

if exist "%STAGE%" rmdir /S /Q "%STAGE%"
mkdir "%STAGE%" 2>nul
if errorlevel 1 (
  echo [ERROR] Cannot create staging dir: %STAGE%
  pause
  exit /b 1
)

echo [1/6] Copy main.js / voice-xfyun.js / preload.js / webview-preload.js / package.json ...
copy /Y "%~dp0main.js" "%STAGE%\main.js" >nul || (echo [ERROR] copy main.js failed & pause & exit /b 1)
copy /Y "%~dp0voice-xfyun.js" "%STAGE%\voice-xfyun.js" >nul || (echo [ERROR] copy voice-xfyun.js failed & pause & exit /b 1)
copy /Y "%~dp0preload.js" "%STAGE%\preload.js" >nul || (echo [ERROR] copy preload.js failed & pause & exit /b 1)
copy /Y "%~dp0webview-preload.js" "%STAGE%\webview-preload.js" >nul || (echo [ERROR] copy webview-preload.js failed & pause & exit /b 1)
copy /Y "%~dp0package.json" "%STAGE%\package.json" >nul || (echo [ERROR] copy package.json failed & pause & exit /b 1)

echo [2/6] Copy renderer / assets ...
xcopy /E /I /Y "%~dp0renderer" "%STAGE%\renderer" >nul || (echo [ERROR] copy renderer failed & pause & exit /b 1)
xcopy /E /I /Y "%~dp0assets" "%STAGE%\assets" >nul || (echo [ERROR] copy assets failed & pause & exit /b 1)

echo [3/6] Copy ws package (WebSocket client for voice transcribe) ...
if not exist "%~dp0node_modules\ws" (
  echo [ERROR] ws package missing at %~dp0node_modules\ws
  echo         Copy ws@8.21.0 from harness .pnpm to dsh-app\node_modules\ws first.
  pause
  exit /b 1
)
mkdir "%STAGE%\node_modules" 2>nul
xcopy /E /I /Y "%~dp0node_modules\ws" "%STAGE%\node_modules\ws" >nul || (echo [ERROR] copy ws failed & pause & exit /b 1)

echo [4/6] Backup old app.asar to app.asar.bak ...
copy /Y "%ASAR%" "%ASAR%.bak" >nul || (echo [WARN] backup failed, continuing)

echo [5/6] Repack app.asar ...
node "%~dp0node_modules\@electron\asar\bin\asar.js" pack "%STAGE%" "%ASAR%"
if errorlevel 1 (
  echo.
  echo [ERROR] asar pack failed. Old app.asar is backed up at app.asar.bak
  echo         Check node and @electron\asar:
  echo            node --version
  echo            dir "%~dp0node_modules\@electron\asar"
  echo.
  pause
  exit /b 1
)

rmdir /S /Q "%STAGE%"
echo.
echo [6/6] DONE! app.asar has been updated.
echo.
echo Close DeepSeek Harness.exe first, then restart it to apply.
echo To roll back: restore resources\app.asar from app.asar.bak
echo.
pause
endlocal
