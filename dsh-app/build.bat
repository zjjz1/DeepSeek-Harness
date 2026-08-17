@echo off
title DeepSeek Harness build
cd /d "%~dp0"

set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

echo.
echo ==============================================================
echo  DeepSeek Harness installer builder
echo  Takes 5-15 minutes. Do NOT close this window.
echo ==============================================================
echo.

echo [STEP 1/3] Cleaning old build files...
if exist "%~dp0dist" rmdir /s /q "%~dp0dist"
if exist "%LOCALAPPDATA%\electron-builder\Cache" rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache"
echo [OK] cleaned
echo.

echo [STEP 2/3] Installing packaging tools...
call npm.cmd install
if errorlevel 1 goto fail
echo [OK] packaging tools ready
echo.

echo [STEP 3/3] Building installer...
call npm.cmd run dist
if errorlevel 1 goto fail
echo [OK] installer built
echo.

echo ==============================================================
echo  DONE! Installer is in this folder:
echo  %~dp0dist
echo  Find a file named: DeepSeek Harness Setup ... .exe
echo ==============================================================
echo.
pause
exit /b 0

:fail
echo.
echo ==============================================================
echo  ERROR! Screenshot the red text and send it to me.
echo ==============================================================
echo.
pause
exit /b 1
