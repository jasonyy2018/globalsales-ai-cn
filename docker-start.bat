@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   自媒体AI运营平台 - Docker 容器化启动
echo ============================================================
echo.

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 未检测到 Docker，请确保 Docker Desktop 已安装并运行。
  pause
  exit /b 1
)

echo [1/2] 正在构建与启动 Docker 容器...
docker compose up -d --build

echo.
echo [2/2] 启动完成！正在打开浏览器...
start http://localhost:8766

echo.
echo ============================================================
echo   服务地址: http://localhost:8766
echo   查看日志: docker compose logs -f
echo   停止服务: docker compose down
echo ============================================================
echo.
pause
