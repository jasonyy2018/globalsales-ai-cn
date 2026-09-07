@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0.."

REM ============================================================
REM  自媒体AI运营平台 · 一键上传并部署到服务器
REM  用法：双击本文件，按提示输入服务器 IP 和登录用户
REM  依赖：Windows 自带的 ssh / scp / tar（Win10 1803+ 都有）
REM ============================================================

echo ============================================================
echo   自媒体AI运营平台 - 一键部署到服务器
echo ============================================================
echo.

where ssh >nul 2>nul || (echo [错误] 找不到 ssh 命令。请在"设置-应用-可选功能"里安装 OpenSSH 客户端 & pause & exit /b 1)
where tar >nul 2>nul || (echo [错误] 找不到 tar 命令。需要 Windows 10 1803 或更高版本 & pause & exit /b 1)

set /p SRV=服务器公网IP或域名:
if "%SRV%"=="" (echo [错误] 必须填服务器地址 & pause & exit /b 1)
set /p SSHUSER=SSH登录用户名 [默认 root]:
if "%SSHUSER%"=="" set SSHUSER=root
set APPDIR=/opt/globalsales

REM ---------- 密钥文件检查 ----------
REM server.py 里没有回落字面量，密钥只能来自 .env / systemd env。
REM 不带上去的话部署完能登录，但生成文章/图片会全部报鉴权错。
set ENVARG=.env
if not exist .env (
  set "ENVARG="
  echo [注意] 项目根没有 .env，密钥不会被带上去。
  echo        部署后需在服务器执行：sudo nano /etc/globalsales.env 手填密钥
  echo.
)

REM ---------- 是否迁移本地数据 ----------
REM data\ 里是 SQLite 用户库 + 用户生成的图片视频。默认不传（避免本地覆盖线上用户数据）。
REM 只在服务器**首次**部署、线上还没有任何数据时选 Y，否则会覆盖掉线上用户的账号和资产。
REM 注意：提示语里不能出现半角右括号 —— 它会提前闭合下面这个 if 块。
set SENDDATA=N
if exist data\app.db (
  echo   检测到本地 data\app.db，你的账号、提示词、资产都在里面
  echo   ------------------------------------------------------------
  echo   传过去 = 服务器沿用你本地的账号密码、提示词、资产、图片视频
  echo   不传   = 服务器建全新空库，管理员密码随机生成
  echo.
  echo   [警告] 如果服务器上已经有其他用户在用，选 y 会覆盖掉他们的数据！
  set /p SENDDATA=是否把本地 data 一起传上去覆盖服务器? [y/N]:
)
if /i "%SENDDATA%"=="y" (set "DATAARG=data") else (set "DATAARG=")

echo.
echo   服务器    %SSHUSER%@%SRV%
echo   部署目录  %APPDIR%
if "%DATAARG%"=="" (
  echo   本地数据  不上传，服务器 data/ 保持原样
) else (
  echo   本地数据  一并上传，将覆盖服务器上的 data/
)
if "%ENVARG%"=="" (echo   API 密钥  未带上，部署后需手填) else (echo   API 密钥  随 .env 带上，将写入 /etc/globalsales.env)
echo.
pause

REM ---------- 打包：只带运行必需的文件 ----------
REM demo.mp4（55MB）必须带上 —— 「操作演示」菜单直接播它，不传的话页面上是个
REM 加载失败的黑框。其余 mp4（旧的演示素材）仍排除，纯占带宽。
REM data/ 默认排除（服务器上的用户数据不能被本地覆盖）；上面选了 y 才带上。
REM .env 会被打包 -> 上传后 deploy.sh 把它读进 /etc/globalsales.env（权限 600），
REM 然后从服务器项目目录里安全擦除（先覆写再删），不会留在 HTTP 可达的地方。
echo.
echo [1/4] 打包代码（含 55MB 演示视频，上传耗时取决于带宽）...
if exist deploy\upload.tar del /q deploy\upload.tar
if "%DATAARG%"=="" (set "EXDATA=--exclude=data") else (set "EXDATA=")
if exist demo.mp4 (set "DEMOARG=demo.mp4") else (set "DEMOARG=" & echo       [提示] 本地没有 demo.mp4，「操作演示」页在服务器上会显示加载失败)
tar -cf deploy\upload.tar ^
  %EXDATA% ^
  --exclude=__pycache__ ^
  --exclude=.claude ^
  --exclude=*.log ^
  --exclude=.svclog.txt ^
  --exclude=.svlog.txt ^
  --exclude=arkmodels.tmp.json ^
  --exclude=deploy/upload.tar ^
  server.py index.html icon.png Logo.png logo2.png logo3.png %DEMOARG% %ENVARG% %DATAARG% deploy
if errorlevel 1 (echo [错误] 打包失败 & pause & exit /b 1)
for %%A in (deploy\upload.tar) do echo       大小 %%~zA 字节

REM ---------- 上传 ----------
echo.
echo [2/4] 上传到服务器（可能需要输入密码）...
ssh %SSHUSER%@%SRV% "mkdir -p %APPDIR%"
if errorlevel 1 (echo [错误] SSH 连接失败，检查 IP / 用户名 / 安全组是否放行 22 端口 & pause & exit /b 1)
scp deploy\upload.tar %SSHUSER%@%SRV%:%APPDIR%/upload.tar
if errorlevel 1 (echo [错误] 上传失败 & pause & exit /b 1)

REM ---------- 解包 ----------
echo.
echo [3/4] 解包...
ssh %SSHUSER%@%SRV% "cd %APPDIR% && tar -xf upload.tar && rm -f upload.tar && chmod +x deploy/deploy.sh && ls -la"
if errorlevel 1 (echo [错误] 解包失败 & pause & exit /b 1)

REM ---------- 部署 ----------
echo.
echo [4/4] 执行部署脚本...
echo.
ssh -t %SSHUSER%@%SRV% "cd %APPDIR% && sudo bash deploy/deploy.sh"

del /q deploy\upload.tar 2>nul

echo.
echo ============================================================
echo   完成。请到云厂商控制台的【安全组】放行 8766 端口
echo   然后浏览器访问   http://%SRV%:8766
echo ============================================================
pause
