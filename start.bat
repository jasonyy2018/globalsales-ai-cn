@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ============================================================
echo   自媒体AI运营平台 - Next.js 全栈版
echo ============================================================
echo.

where pnpm >nul 2>nul
if not errorlevel 1 (
  set PKG_MGR=pnpm
  goto RUN
)

where npm >nul 2>nul
if not errorlevel 1 (
  set PKG_MGR=npm
  goto RUN
)

echo [ERROR] 未检测到 Node.js 或 pnpm/npm，请先安装 Node.js。
pause
exit /b 1

:RUN
set PORT=8766
set OCCUPIED_PID=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
  set OCCUPIED_PID=%%p
)

if defined OCCUPIED_PID (
  echo [WARN] 端口 %PORT% 已被进程 PID=%OCCUPIED_PID% 占用，正在关闭旧进程...
  taskkill /F /PID %OCCUPIED_PID% >nul 2>nul
  timeout /t 1 /nobreak >nul
)

echo.
echo   端口:  %PORT%
echo   地址:  http://localhost:%PORT%
echo   启动:  %PKG_MGR% run dev
echo.
echo ============================================================
echo.

start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:%PORT%"

%PKG_MGR% run dev
