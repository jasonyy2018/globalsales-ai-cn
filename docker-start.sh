#!/usr/bin/env bash
set -e

echo "============================================================"
echo "  自媒体AI运营平台 - Docker 容器化启动 (Linux / macOS)"
echo "============================================================"

if ! command -v docker &> /dev/null; then
    echo "[ERROR] 未检测到 Docker，请先安装 Docker。"
    exit 1
fi

echo "[1/2] 正在构建与启动 Docker 容器..."
docker compose up -d --build

echo ""
echo "[2/2] 启动完成！"
echo "============================================================"
echo "  服务地址: http://localhost:8766"
echo "  查看日志: docker compose logs -f"
echo "  停止服务: docker compose down"
echo "============================================================"
