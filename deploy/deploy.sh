#!/usr/bin/env bash
# 自媒体AI运营平台 · 服务器端一键部署脚本
#
# 在服务器上以 root 运行，幂等 —— 重复执行不会破坏已有数据。
#   bash deploy.sh
#
# 做四件事：
#   1. 确保有 python3（零 pip 依赖，只要解释器）
#   2. 首次部署时生成 .env（随机管理员密码 + API key 占位），权限 600
#   3. 装 systemd 服务，开机自启、崩溃自动重启
#   4. 放行端口 + 健康检查
#
# 绝不触碰 data/ —— 那里面是 SQLite 用户库和用户媒体文件。

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/globalsales}"
SERVICE="${SERVICE:-globalsales}"
PORT="${PORT:-8766}"
RUN_USER="${RUN_USER:-globalsales}"

log()  { printf '\033[36m[部署]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[注意]\033[0m %s\n' "$*"; }
die()  { printf '\033[31m[失败]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行：sudo bash deploy.sh"
[ -f "$APP_DIR/server.py" ] || die "$APP_DIR/server.py 不存在。先把代码上传到 $APP_DIR"

# ---------- 1. Python ----------
log "检查 Python..."
if command -v python3 >/dev/null 2>&1; then
    PY=$(command -v python3)
else
    log "未找到 python3，安装中..."
    if   command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -y -qq python3
    elif command -v dnf     >/dev/null 2>&1; then dnf install -y -q python3
    elif command -v yum     >/dev/null 2>&1; then yum install -y -q python3
    elif command -v apk     >/dev/null 2>&1; then apk add --no-cache python3
    else die "无法自动安装 Python，请手动装好 python3 后重跑"
    fi
    PY=$(command -v python3) || die "安装后仍找不到 python3"
fi
PYVER=$("$PY" -c 'import sys; print("%d.%d"%sys.version_info[:2])')
log "Python $PYVER  ($PY)"
"$PY" - <<'EOF' || die "Python 版本过低，需要 3.6 及以上"
import sys
sys.exit(0 if sys.version_info >= (3, 6) else 1)
EOF
# 本项目只用标准库，没有 requirements.txt，这里顺手确认一下依赖真的都在
"$PY" - <<'EOF' || die "标准库不完整（可能是 python3-minimal），请安装完整版 python3"
import ssl, sqlite3, http.server, urllib.request, hashlib, hmac, secrets, gzip, zlib
EOF
log "依赖检查通过：全部标准库，无需 pip install"

# ---------- 2. 运行用户 + 目录权限 ----------
if ! id "$RUN_USER" >/dev/null 2>&1; then
    log "创建运行账号 $RUN_USER（无登录 shell，缩小被拿下后的影响面）"
    useradd --system --no-create-home --shell /usr/sbin/nologin "$RUN_USER" 2>/dev/null \
        || useradd --system --no-create-home --shell /sbin/nologin "$RUN_USER"
fi
mkdir -p "$APP_DIR/data"
chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR/data"
chmod 700 "$APP_DIR/data"          # 用户库和媒体文件只给服务账号看
chown "$RUN_USER":"$RUN_USER" "$APP_DIR/index.html" 2>/dev/null || true

# ---------- 3. 环境变量文件（密钥不进源码） ----------
# 密钥来源优先级：真实环境变量（systemd EnvironmentFile）> 项目根 .env。
# server.py 里的 6 个密钥常量是 os.environ.get(VAR, '')，**没有回落字面量**，
# 所以这两处都不填 = 密钥为空 = 所有 AI 功能报鉴权错。这里必须真的填进去。
ENV_FILE="/etc/${SERVICE}.env"

# 从上传上来的项目根 .env 里取密钥（一键部署脚本会把本机 .env 一起打包）。
# 只取密钥类变量，GS_* 运行参数仍由本脚本决定（管理员密码要随机、端口要跟 $PORT 一致）。
UPLOADED_ENV="$APP_DIR/.env"
ADMIN_USER=""          # set -u 下后面的健康检查会引用它，必须先有定义
_key_from_upload() {
    # $1=变量名。没有文件、没有该行、值为空都返回空串
    [ -f "$UPLOADED_ENV" ] || return 0
    sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$UPLOADED_ENV" \
        | head -n1 | sed 's/^["'\'']//;s/["'\'']$//'
}

if [ -f "$ENV_FILE" ]; then
    log "$ENV_FILE 已存在，保留原有配置（不覆盖密钥/密码）"
    NEW_PASS=""
else
    log "生成 $ENV_FILE"
    NEW_PASS=$("$PY" -c 'import secrets,string;a=string.ascii_letters+string.digits;print("".join(secrets.choice(a) for _ in range(20)))')
    # 管理员用户名：允许通过环境变量覆盖，默认沿用本机 .env 里的那个（通常是你自己的账号），
    # 都没有才回落到 admin。密码一律随机 —— 源码里的 sunny520 是公开的，绑公网等于没锁门。
    ADMIN_USER="${GS_ADMIN_USER:-$(_key_from_upload GS_ADMIN_USER)}"
    [ -n "$ADMIN_USER" ] || ADMIN_USER="admin"
    {
        cat <<EOF
# 自媒体AI运营平台 运行配置。本文件权限 600，只有 root 可读。
# 改完执行：systemctl restart ${SERVICE}

GS_PORT=${PORT}

# 管理员账号。仅在首次建库（data/app.db 不存在）时生效。
GS_ADMIN_USER=${ADMIN_USER}
GS_ADMIN_PASS=${NEW_PASS}

# 前面套了 HTTPS（Nginx/Caddy 反代）后改成 1，让 session cookie 只走加密连接。
# 纯 http 直连必须留 0，否则浏览器丢 cookie 会导致永远登不上。
GS_COOKIE_SECURE=0

# ===== API 密钥 =====
# server.py 里**没有**默认值可回落（值为空就报鉴权错），这里必须填真实密钥。
# 下面的值是从上传的项目根 .env 自动带过来的；为空说明本机 .env 里也没有，需手填。
EOF
        # ARK_PLAN_API_KEY 必须在列：index.html 的 DEFAULT_MODULE_MODELS 把 7 个
        # 文本模块（热点发现/图文生成/文案创作/评论衍生/棘手回复/选品/自由问答）
        # 全指向 ark-plan-text，而它和出图用的 ARK_API_KEY 是两把不同的 key。
        # 漏掉这个变量的部署 = 能登录能出图但文案全报鉴权错。
        for V in MM_API_KEY HY_API_KEY AGNES_API_KEY ARK_PLAN_API_KEY ARK_API_KEY SEEDANCE_MINI_API_KEY; do
            printf '%s=%s\n' "$V" "$(_key_from_upload "$V")"
        done
    } > "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"

# 上传上来的 .env 已经把密钥转录进 /etc（600、root 独占）。项目目录里那份必须清掉：
# 它属于 $RUN_USER 可读范围，且一旦将来静态白名单被改坏就是一条明文密钥下载通道。
# 先覆写再删 —— unlink 只断链接，内容仍可从磁盘恢复。
if [ -f "$UPLOADED_ENV" ]; then
    "$PY" - "$UPLOADED_ENV" <<'EOF' 2>/dev/null || true
import os, sys
p = sys.argv[1]
n = os.path.getsize(p)
with open(p, 'r+b') as f:
    f.write(b'\x00' * n)
    f.flush(); os.fsync(f.fileno())
EOF
    rm -f "$UPLOADED_ENV"
    log "已把密钥转录进 $ENV_FILE，并安全擦除项目目录里的 .env"
fi

# ---------- 3b. 媒体路径迁移（Windows 绝对路径 → 本机路径） ----------
# assets.file_path 存的是**绝对路径**。从 Windows 迁库过来时会是 E:\ClaudeOut\...，
# 在 Linux 上 os.path.exists() 恒为假 → 图片视频全部 404。这里按文件名重新指向
# 本机的 data/users/<uid>/<kind>s/，只改能在本机找到实体文件的行，找不到的保持原样
# （宁可留着让人能查，也不要静默改成一个错路径）。幂等：已是本机路径的不动。
if [ -f "$APP_DIR/data/app.db" ]; then
    MIGRATED=$("$PY" - "$APP_DIR" <<'EOF' 2>/dev/null || echo 0
import os, sqlite3, sys
app = sys.argv[1]
db = os.path.join(app, 'data', 'app.db')
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row
fixed = 0
rows = conn.execute(
    "SELECT id, user_id, kind, file_path FROM assets"
    " WHERE file_path IS NOT NULL AND file_path != ''").fetchall()
for r in rows:
    fp = r['file_path']
    if os.path.exists(fp):
        continue                      # 本机能读到，不动
    name = fp.replace('\\', '/').rstrip('/').split('/')[-1]
    if not name:
        continue
    cand = os.path.join(app, 'data', 'users', str(r['user_id']),
                        (r['kind'] or '') + 's', name)
    if os.path.exists(cand):
        # 参数化占位符，路径值不拼进 SQL
        conn.execute('UPDATE assets SET file_path=? WHERE id=?', (cand, r['id']))
        fixed += 1
conn.commit(); conn.close()
print(fixed)
EOF
)
    [ "${MIGRATED:-0}" = "0" ] || log "媒体路径已迁移 ${MIGRATED} 条（Windows 绝对路径 → 本机路径）"
fi
chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR/data"

# ---------- 4. systemd ----------
log "写入 systemd 服务 ${SERVICE}.service"
cat > "/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=自媒体AI运营平台
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${PY} -u ${APP_DIR}/server.py
Restart=always
RestartSec=3
StandardOutput=append:/var/log/${SERVICE}.log
StandardError=append:/var/log/${SERVICE}.log

# 收紧权限：只有 data/ 可写，其余文件系统只读。
# 这样即使应用层出漏洞，也改不了 server.py 本身。
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ProtectHome=yes
ReadWritePaths=${APP_DIR}/data

[Install]
WantedBy=multi-user.target
EOF

touch "/var/log/${SERVICE}.log"
chown "$RUN_USER":"$RUN_USER" "/var/log/${SERVICE}.log"

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1 || true
systemctl restart "$SERVICE"

# ---------- 5. 防火墙 ----------
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
    ufw allow "${PORT}/tcp" >/dev/null && log "ufw 已放行 ${PORT}/tcp"
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port="${PORT}/tcp" >/dev/null && firewall-cmd --reload >/dev/null
    log "firewalld 已放行 ${PORT}/tcp"
else
    warn "未检测到本机防火墙。别忘了在云厂商控制台的【安全组】里放行 ${PORT} 端口 —— 这一步脚本管不了"
fi

# ---------- 6. 健康检查 ----------
log "等待服务起来..."
OK=0
for i in $(seq 1 15); do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/index.html" 2>/dev/null || echo 000)
    [ "$CODE" = "200" ] && { OK=1; break; }
    sleep 1
done

echo
if [ "$OK" = "1" ]; then
    # 顺手复验必须挡住的路径，防止哪次改动把静态白名单弄坏了
    S=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/server.py")
    D=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/data/app.db")
    E=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/.env")
    printf '\033[32m✓ 部署成功\033[0m\n'
    echo "  访问地址   http://$(curl -s -m 3 ifconfig.me 2>/dev/null || echo '<你的公网IP>'):${PORT}"
    echo "  源码防护   GET /server.py    → ${S}（应为 404）"
    echo "  数据库防护 GET /data/app.db  → ${D}（应为 404）"
    echo "  密钥防护   GET /.env         → ${E}（应为 404）"
    [ "$S" = "404" ] && [ "$D" = "404" ] && [ "$E" = "404" ] \
        || warn "防护检查异常！请勿对公网开放，先排查静态白名单"

    # 密钥自检。server.py 里没有回落字面量，密钥为空时站点能登录但所有 AI 功能报鉴权错 ——
    # 这种"半死"状态从首页 200 是看不出来的，必须在这里点出来，否则用户会以为部署成功了。
    MISSING=""
    for V in MM_API_KEY HY_API_KEY AGNES_API_KEY ARK_PLAN_API_KEY ARK_API_KEY SEEDANCE_MINI_API_KEY; do
        VAL=$(sed -n "s/^[[:space:]]*${V}[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | head -n1)
        [ -n "$VAL" ] || MISSING="${MISSING} ${V}"
    done
    if [ -n "$MISSING" ]; then
        echo
        warn "以下 API 密钥为空：${MISSING}"
        echo "       源码里没有默认值可回落 —— 空密钥 = 对应模型报鉴权错，文案/图片/视频生成会失败。"
        echo "       填写：sudo nano ${ENV_FILE} && sudo systemctl restart ${SERVICE}"
        echo "       其中 ARK_PLAN_API_KEY 最关键：7 个文本模块默认全走它，空着文案功能全废。"
        echo "       ARK_API_KEY 是另一把（Seedream 出图专用），两者不能互相顶替。"
    else
        echo "  API 密钥   6 个全部已配置 ✓"
    fi

    if [ -n "$NEW_PASS" ]; then
        echo
        printf '\033[33m管理员账号（只显示这一次，请立刻记下来）\033[0m\n'
        echo "  用户名  ${ADMIN_USER}"
        echo "  密码    ${NEW_PASS}"
        echo "  （已存进 ${ENV_FILE}，root 可查）"
        echo
        echo "  注意：仅在首次建库时生效。如果你把本地 data/ 一起传了上来，"
        echo "        库里已有账号，请用你本地原来的用户名密码登录，上面这组不会生效。"
    fi
else
    printf '\033[31m✗ 服务未能正常响应\033[0m\n'
    echo "  查日志：journalctl -u ${SERVICE} -n 50 --no-pager"
    echo "         tail -50 /var/log/${SERVICE}.log"
    exit 1
fi

echo
echo "常用命令"
echo "  重启   systemctl restart ${SERVICE}"
echo "  状态   systemctl status ${SERVICE}"
echo "  日志   tail -f /var/log/${SERVICE}.log"
echo "  改配置 nano ${ENV_FILE} && systemctl restart ${SERVICE}"
