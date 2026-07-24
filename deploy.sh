#!/bin/bash
# ML Pricing Tool 部署脚本
set -e

SERVER="ubuntu@159.75.27.216"
KEY="/tmp/tencent_key"
REMOTE_DIR="/home/ubuntu/hermes-workspace/ml-pricing-tool"
LOCAL_DIR="/home/ubuntu/hermes-workspace/ml-pricing-tool"

echo "=== 同步文件到服务器 ==="
rsync -avz -e "ssh -i $KEY -o ConnectTimeout=10 -o StrictHostKeyChecking=no" \
    --exclude __pycache__ \
    --exclude '*.pyc' \
    --exclude '.db' \
    --exclude 'node_modules' \
    "$LOCAL_DIR/backend/" "$SERVER:$REMOTE_DIR/backend/"
rsync -avz -e "ssh -i $KEY -o ConnectTimeout=10 -o StrictHostKeyChecking=no" \
    "$LOCAL_DIR/frontend/" "$SERVER:$REMOTE_DIR/frontend/"

echo "=== 安装后端依赖 ==="
ssh -i $KEY -o ConnectTimeout=10 -o ServerAliveInterval=5 "$SERVER" \
    "cd $REMOTE_DIR/backend && pip3 install --break-system-packages -i https://pypi.org/simple sqlalchemy python-jose[cryptography] stripe mercadopago fastapi uvicorn 2>&1 | tail -3"

echo "=== 杀掉旧进程 ==="
ssh -i $KEY -o ConnectTimeout=10 -o ServerAliveInterval=5 "$SERVER" \
    "ps aux | grep 'main.py' | grep -v grep | awk '{print \$2}' | xargs -r kill 2>/dev/null; sleep 1"

echo "=== 启动后端 ==="
ssh -i $KEY -o ConnectTimeout=10 -o ServerAliveInterval=5 "$SERVER" \
    "cd $REMOTE_DIR/backend && nohup python3 main.py > /tmp/ml-pricing.log 2>&1 &"

sleep 2

echo "=== 检查服务 ==="
ssh -i $KEY -o ConnectTimeout=10 -o ServerAliveInterval=5 "$SERVER" \
    "curl -s http://localhost:8899/api/health"

echo ""
echo "=== 完成 ==="
