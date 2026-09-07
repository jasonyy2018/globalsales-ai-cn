# 自媒体AI运营平台 · Ubuntu 服务器部署指南

> 本文针对 **Ubuntu 20.04 / 22.04 / 24.04 LTS** 公网部署，含一份必须做的加固。
> 通用 Linux 版看 [服务器部署指南.md](服务器部署指南.md)，装好之后怎么用看 [操作手册](../docs/操作手册.md)。

---

## ⚠️ 部署前必读：一个必须处理的问题

**17 条厂商 API 代理路由没有登录鉴权。** 这不是推测，是在本机实测的结果：

```
不带任何 cookie 直接请求：
POST http://<服务器>:8766/api/ark_text  {"messages":[{"role":"user","content":"say OK"}]}
→ HTTP 200，返回真实生成结果 content:'OK'，usage:{total_tokens:48}
```

烧的是**你服务端 `.env` 里的 `ARK_API_KEY`**。同样的情况适用于全部 17 条 `/api/*` 代理路由（MiniMax 文本/图片/视频、腾讯混元、Agnes、Seedance、火山方舟）。其中 `/api/ark_plan_text` 尤其要紧 —— 站内 7 个文本模块（热点发现 / 图文生成 / 文案创作 / 评论衍生 / 棘手回复 / 选品 / 自由问答）默认全走它，是最容易被薅的一条。

放大这个问题的还有两点：
- 服务端对每个响应发 `Access-Control-Allow-Origin: *` —— **任何第三方网站的 JS 都能匿名调用这些路由**
- `/api/web_search`、`/api/product_scrape` 两个 GET 端点同样无鉴权，可被当成免费抓取代理（原先还有第三个 `/api/overseas_search`，国内化时整条腿已删除，现在返回 404）

**所以：不要把 8766 端口直接暴露到公网。** 本文第四节给出 Nginx 加固配置，是本次部署的必做步骤，不是可选项。

> 相比之下这些是**已经修好的**：`GET /server.py`、`GET /.env`、`GET /data/app.db` 全部返回 404（本机实测确认）。静态文件走白名单 + 黑名单双闸，黑名单优先。

---

## 一、环境要求

**只需要 Python 3。没有任何 pip 包要装。**

`server.py` 只 import 标准库，所以项目里**没有也不需要 `requirements.txt`**。前端是单文件 SPA，无构建步骤，不需要 Node。

| 项目 | 要求 | Ubuntu 情况 |
|---|---|---|
| Python | **3.7+**（用到 `datetime.fromisoformat`） | 20.04 自带 3.8 ✅ / 22.04 自带 3.10 ✅ / 24.04 自带 3.12 ✅ |
| pip 包 | **零** | 不需要 venv |
| Node/npm | 不需要 | — |
| 数据库 | 不需要单独装 | SQLite 是 Python 标准库自带 |
| Nginx | **必需**（见上方警示） | `apt install nginx` |

**配置建议**：1 核 2G / 40G 硬盘。生成的图片视频会持续累积占盘，加上 `demo.mp4` 本身 53MB，别给 20G。

**网络**：服务器必须能出网（调 AI 接口 + 页面加载 Tailwind CDN）。

检查 Python：

```bash
python3 --version
```

如果是 `python3-minimal` 镜像，补齐标准库：

```bash
sudo apt update && sudo apt install -y python3 python3-venv
```

---

## 二、部署（三步）

### 第 1 步 · 上传代码

**方式 A：从 Windows 电脑一键推**（推荐）

双击 `deploy\一键部署到服务器.bat`，输入服务器 IP 和 SSH 用户名，其余全自动：打包 → 上传 → 解包 → 装 systemd → 放行端口 → 健康检查。

脚本会问**要不要把本地 `data\` 一起传**：

| 选择 | 结果 | 何时选 |
|---|---|---|
| **不传**（默认） | 服务器建全新空库，管理员密码随机生成 | 常规更新代码；线上已有用户在用 |
| **传** | 沿用你本地的账号、提示词、资产、图片视频 | **仅**首次部署，且线上还没有任何数据 |

> ⚠️ 选「传」会**覆盖**服务器上的 `data/`。线上已有其他用户注册过的话，他们的账号和资产会被抹掉。

`demo.mp4`（53MB）**会**上传 —— 「操作演示」页直接播它，不传的话线上是个加载失败的黑框。上传耗时主要就是这个文件。

**方式 B：手动上传**

```bash
sudo mkdir -p /opt/globalsales
# 本地执行（在项目根目录）：
# tar -czf gs.tar.gz --exclude=__pycache__ --exclude=.claude --exclude='*.log' .
# scp gs.tar.gz user@服务器:/tmp/
sudo tar -xzf /tmp/gs.tar.gz -C /opt/globalsales
```

### 第 2 步 · 配置密钥

```bash
cd /opt/globalsales
sudo cp .env.example .env
sudo chmod 600 .env
sudo nano .env
```

**必填**（不配对应模型就报鉴权错误）：

| 变量 | 用途 | 不配的后果 |
|---|---|---|
| `ARK_PLAN_API_KEY` | 火山方舟 Agent Plan —— **文案主力** | **7 个文本模块全部报鉴权错** |
| `ARK_API_KEY` | 火山方舟 Seedream —— **出图主力** | 图片生成不可用（图片类只有它可用） |
| `SEEDANCE_MINI_API_KEY` | Seedance 2 Mini —— 视频默认引擎 | 视频生成不可用 |
| `AGNES_API_KEY` | Agnes AI Video V2.0 | 少一个视频备选 |
| `MM_API_KEY` | MiniMax 文本 | 少一个文本备选 |
| `HY_API_KEY` | 腾讯混元 | 当前模型全部禁用，可留空 |

> ⚠️ **`ARK_PLAN_API_KEY` 和 `ARK_API_KEY` 是火山方舟的两把不同 key，不能互换填。**
> 前者打 `api/plan/v3/chat/completions`（文本 + 图片理解），后者打
> `api/v3/images/generations`（Seedream 出图）；填错会分别拿到 401
> `AuthenticationError` / 404 `UnsupportedModel`。
> 这是本项目部署时最容易漏的一格：只配了 `ARK_API_KEY` 的站点能登录、能出图、
> 能出视频，**但所有文案功能全线报鉴权错** —— 从首页看不出任何异常。

**运行参数**：

| 变量 | 默认 | 说明 |
|---|---|---|
| `GS_PORT` | `8766` | 监听端口 |
| `GS_ADMIN_USER` | `martinxie` | 首次建库的管理员用户名 |
| `GS_ADMIN_PASS` | `sunny520` | **首次建库的管理员密码 —— 必须改** |
| `GS_COOKIE_SECURE` | `0` | 套了 HTTPS 改 `1`；纯 http 时**必须留 0** |

> **`GS_ADMIN_PASS` 的默认值 `sunny520` 明文写在源码里，是公开的。** 部署脚本会自动换成 20 位随机值；手动部署务必自己改。这组账号密码**只在首次建库时生效**（`data/app.db` 不存在时），库建好后改 `.env` 无效，要在「用户管理」页重置。

> **`GS_COOKIE_SECURE` 填错是最常见的部署事故**：设成 1 但用 http 访问，浏览器会静默丢掉 session cookie，表现为「登录成功后立刻跳回登录页」，而且不报任何错。第四节配完 HTTPS 后才改成 1。

### 第 3 步 · 安装服务

```bash
cd /opt/globalsales && sudo bash deploy/deploy.sh
```

脚本**幂等**，重复执行安全 —— 不会覆盖 `data/`，也不会重置已生成的管理员密码。它会：

1. 创建系统账号 `globalsales`（`nologin` shell，无家目录）
2. `data/` 权限设 700，归 `globalsales`
3. 把项目根 `.env` 转录进 `/etc/globalsales.env`（600、root 独占），再把项目里那份**覆写后删除** —— 不留在服务账号可读、且理论上可能被 HTTP 摸到的地方
4. 写 systemd 单元，开机自启 + 崩溃自动重启
5. 放行 ufw 端口
6. 健康检查（含 `curl /server.py`、`/.env`、`/data/app.db` 确认返回非 200）

**记下打印出来的管理员密码** —— 只打印这一次。忘了可以查：

```bash
sudo grep GS_ADMIN_PASS /etc/globalsales.env
```

---

## 三、systemd 服务

`deploy.sh` 生成 `/etc/systemd/system/globalsales.service`：

```ini
[Service]
User=globalsales
Group=globalsales
WorkingDirectory=/opt/globalsales
EnvironmentFile=/etc/globalsales.env
ExecStart=/usr/bin/python3 -u /opt/globalsales/server.py
Restart=always
RestartSec=3
StandardOutput=append:/var/log/globalsales.log
ProtectSystem=full
ReadWritePaths=/opt/globalsales/data
```

`ProtectSystem=full` + `ReadWritePaths` 只放开 `data/` —— **就算应用层出洞，攻击者也改不动 `server.py`**。

### 建议追加一项

`server.py` **没有注册 SIGTERM 处理器**，只有 Ctrl+C（SIGINT）会走优雅关闭路径。systemd 默认发 SIGTERM，进程会被直接掐断。加一行让优雅路径生效：

```bash
sudo systemctl edit globalsales
```

```ini
[Service]
KillSignal=SIGINT
```

```bash
sudo systemctl daemon-reload && sudo systemctl restart globalsales
```

> 不加也不会丢数据 —— SQLite 开了 WAL 且每次操作后立即 commit。加了只是让飞行中的请求有机会收尾。

### 常用命令

```bash
sudo systemctl status globalsales      # 看状态
sudo systemctl restart globalsales     # 重启
sudo journalctl -u globalsales -n 50 --no-pager   # 看崩溃原因
sudo tail -f /var/log/globalsales.log  # 看实时日志
```

---

## 四、Nginx 加固（必做）

解决三件事：把 8766 关回内网、给代理路由加访问控制、上 HTTPS。

### 4.1 只监听内网

`server.py` 硬编码绑 `0.0.0.0`（所有网卡，含公网）。改代码不如用防火墙关掉外部访问：

```bash
sudo ufw delete allow 8766/tcp    # 撤掉 deploy.sh 放行的规则
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

**同时去云控制台安全组删掉 8766，只留 22/80/443**：

| 云 | 位置 |
|---|---|
| 阿里云 | ECS → 安全组 → 配置规则 → 入方向 |
| 腾讯云 | 云服务器 → 安全组 → 入站规则 |
| 华为云 | ECS → 安全组 → 入方向规则 |
| AWS | EC2 → Security Groups → Inbound rules |

### 4.2 配置 Nginx

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/globalsales
```

```nginx
# 登录/注册限流区（应对无限流的登录接口）
limit_req_zone $binary_remote_addr zone=gs_auth:10m rate=6r/m;

server {
    listen 80;
    server_name your-domain.com;      # 没域名就写公网 IP

    # 代理路由的请求体上限（server.py 对这些路由不设上限）
    client_max_body_size 32m;

    # 视频生成是长轮询，超时给足
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    # ---- 关键：厂商 API 代理路由只许自己人用 ----
    # 这 17 条路由无登录鉴权，任何人可达即可烧你的 API 额度。
    # ark_plan_text 必须在列 —— 7 个文本模块默认都走它，漏了等于门开着。
    # 按需二选一：IP 白名单，或 Basic Auth。
    location ~ ^/api/(text|image|video|video_query|hy_image|hy_video_submit|hy_video_query|agnes_image|agnes_video_submit|agnes_video_query|agnes_video25_submit|agnes_video25_query|seedance_mini|ark_text|ark_plan_text|ark_image|web_search|product_scrape) {
        # 方案 1：IP 白名单（团队固定出口 IP 时最省事）
        # allow 203.0.113.0/24;
        # deny  all;

        # 方案 2：Basic Auth（IP 不固定时用这个）
        # realm 保持 ASCII —— 这串字会出现在浏览器弹出的登录框标题里，
        # 部分浏览器对非 ASCII realm 处理不一致，别写中文。
        auth_basic "Restricted API";
        auth_basic_user_file /etc/nginx/.htpasswd;

        proxy_pass http://127.0.0.1:8766;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ---- 登录/注册限流（server.py 无失败次数限制、无锁定）----
    location ~ ^/api/auth/(login|register)$ {
        limit_req zone=gs_auth burst=3 nodelay;
        proxy_pass http://127.0.0.1:8766;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ---- 其余（页面本体 + 已鉴权的用户 API）----
    location / {
        proxy_pass http://127.0.0.1:8766;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # demo.mp4 分片播放需要，别开缓冲
        proxy_buffering off;
    }
}
```

用 Basic Auth 方案的话建账号：

```bash
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd yourname
```

启用：

```bash
sudo ln -sf /etc/nginx/sites-available/globalsales /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

> **注意**：Basic Auth 会让浏览器在访问这些路由时弹一次账号密码框。前端页面调用这些接口时浏览器会自动带上凭据，所以只弹一次。如果嫌烦、且团队出口 IP 固定，用 IP 白名单方案。

### 4.3 上 HTTPS

有域名的话（**强烈建议** —— 否则登录密码在网络上是明文）：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

证书装好后，**改 cookie 标记**：

```bash
sudo sed -i 's/^GS_COOKIE_SECURE=.*/GS_COOKIE_SECURE=1/' /etc/globalsales.env
sudo systemctl restart globalsales
```

certbot 会自动配好续期。验证：

```bash
sudo certbot renew --dry-run
```

### 4.4 验证加固生效

```bash
D=your-domain.com   # 或公网 IP

# 页面应可访问
curl -s -o /dev/null -w "index      -> %{http_code}\n" https://$D/index.html

# 代理路由应被 Nginx 拦掉（401 或 403，不是 200/400）
curl -s -o /dev/null -w "ark_text   -> %{http_code}\n" -X POST https://$D/api/ark_text \
     -H 'Content-Type: application/json' -d '{"messages":[]}'

# 敏感文件应 404
for p in /server.py /.env /data/app.db; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" https://$D$p
done

# 8766 应从公网不可达（应超时或拒绝，不该返回内容）
curl -s -m 5 -o /dev/null -w "port8766  -> %{http_code}\n" http://$D:8766/index.html || echo "port8766  -> 不可达 ✅"
```

期望：`index` 200、`ark_text` **401/403**、三个敏感路径 404、8766 不可达。

若 `ark_text` 返回 200 或 400，说明 location 正则没匹配上 —— `sudo nginx -T | grep -A2 ark_text` 检查配置是否真的加载了。

---

## 五、日常运维

### 更新代码

再跑一次一键部署，或：

```bash
cd /opt/globalsales && sudo bash deploy/deploy.sh
```

`data/` 不会被动，用户账号和资产全部保留。

### 改配置

```bash
sudo nano /etc/globalsales.env && sudo systemctl restart globalsales
```

> 优先级：**真实环境变量（systemd `EnvironmentFile`）> 项目根 `.env`**。服务器上改 `/etc/globalsales.env` 才有效，改项目里的 `.env` 不生效（而且 `deploy.sh` 已经把它删了）。

管理员在「大模型配置」页保存内置模型密钥时，会写回 `.env` 并同步更新内存中的常量，**无需重启即时生效**。

### 备份

要备份的只有 `data/` 一个目录 —— SQLite 库 + 用户生成的图片视频：

```bash
sudo tar -czf /root/gs-backup-$(date +%F).tar.gz -C /opt/globalsales data
```

挂进 crontab 每天一次：

```bash
sudo crontab -e
```

```cron
17 4 * * * tar -czf /root/gs-backup-$(date +\%F).tar.gz -C /opt/globalsales data && find /root -name 'gs-backup-*.tar.gz' -mtime +14 -delete
```

> 用 `17 4` 而不是 `0 4` —— 整点是所有 cron 任务的堵点。

### 磁盘监控

用户生成的媒体只增不减（删资产会删文件，但用户一般不删）：

```bash
du -sh /opt/globalsales/data/users/
df -h /
```

### 会话表清理

过期 session 只在被访问时才删，长期运行会积累无用行。可选的定期清理：

```bash
sudo -u globalsales sqlite3 /opt/globalsales/data/app.db \
  "DELETE FROM sessions WHERE expires_at < datetime('now');"
```

（需 `apt install sqlite3`；不清也不影响功能，只是多占几 KB。）

---

## 六、安全机制现状

### 已有的（无需你操作）

| 机制 | 实现 |
|---|---|
| 密码存储 | PBKDF2-HMAC-SHA256，**20 万轮**，每用户独立 16 字节随机 salt，`hmac.compare_digest` 恒定时间比较 |
| 会话 | 256bit CSPRNG token，服务端 `sessions` 表，7 天过期。Cookie `HttpOnly` + `SameSite=Strict`（+ `Secure` 当 `GS_COOKIE_SECURE=1`） |
| SQL 注入 | **全部参数化**。三处 `%` 拼接只拼占位符个数（`','.join('?' ...)`），值仍走元组绑定 → 无注入面 |
| 数据隔离 | 一律 `WHERE user_id = ?` 写进 SQL，无"先查到再判属主"的时间窗 |
| 厂商密钥 | 三道闸：读时强制置空 + 写时拒绝落库 + 启动时清库。浏览器永远拿不到 |
| SSRF | `_assert_public_url` 挡私有网段/loopback/**169.254 云元数据**/multicast/reserved；遍历**所有** DNS 解析结果；媒体抓取**逐跳**重新校验，最多 3 跳 |
| 静态文件 | 白名单只放行 8 个文件（index.html + 图标 + demo.mp4）；黑名单**优先于**白名单，挡 `.py/.db/.env/.log/.md` 后缀和 `data/.git/.claude/deploy` 目录段；反斜杠归一化防 Windows 绕过 |
| 路径穿越 | 媒体文件名由服务端 `secrets.token_hex(12)` 生成，从不接受客户端传路径；删除前 `realpath` 前缀校验 |
| 请求体上限 | 用户 API 32MB，超限**不读那些字节**直接拒绝 |
| 上传类型 | 图片 `png/jpg/jpeg/webp/gif`，视频 `mp4/webm/mov/m4v`；媒体抓取 80MB 上限**边读边计数**（不信 `Content-Length`） |
| 进程隔离 | systemd `ProtectSystem=full` + `ReadWritePaths=data`，跑在 `nologin` 系统账号下 |
| 文件权限 | `data/` 700、`/etc/globalsales.env` 600 |
| 源码无凭据 | 6 个密钥常量都是 `os.environ.get(VAR, '')`，无回落字面量 |

### 部署后自查

```bash
# 源码里不该有密钥字面量。只应列出 .env 本身
# 相比宽松版收紧了两处：长度门槛 20→30，并排除 .claude ——
# 否则技能包目录名 ark-agentplan-seedream-skill 会被当成密钥误报
cd /opt/globalsales && sudo grep -rIl -E "(sk-|ark-)[A-Za-z0-9_-]{30,}" \
  --exclude-dir=data --exclude-dir=.git --exclude-dir=.claude --exclude-dir=__pycache__ .

# 编译产物会留下旧字面量的字节，顺手清掉
sudo rm -rf /opt/globalsales/__pycache__
```

### 需要你留意的

1. **代理路由无鉴权** —— 见开篇警示，靠第四节的 Nginx 配置解决。这是本次部署最重要的一件事。
2. **注册接口完全开放** —— 无邀请码、无验证码，任何人可自助注册。不想让陌生人注册，在 Nginx 里对 `/api/auth/register` 加 `deny all`（先注册完自己的账号）。
3. **登录无失败次数限制、无锁定** —— 仅靠 PBKDF2 的计算成本被动减速。第四节的 `limit_req` 是必要补充；更严的话上 fail2ban。
4. **默认 http 明文** —— 登录密码在网络上不加密。有域名就上 4.3 的 HTTPS。
5. **`ssl._create_unverified_context()`** —— 对外调用不验证证书，为绕过部分云环境的自签名拦截。服务器出网正常的话可以改回默认验证。
6. **`.claude/settings.local.json`** —— 会记录允许过的 Bash 命令原文，调试时的 `curl -H "Authorization: Bearer ..."` 可能被抄进去。已加进 `.gitignore` 和静态黑名单，但打包时注意排除。
7. **管理员之间无隔离** —— 一个管理员可以重置另一个管理员的密码（删除有防护，重置没有）。
8. **`/api/data/media/<id>` 的 Range 读取无分片上限** —— `bytes=0-` 会把整个视频（≤80MB）读进内存。并发观看多时留意内存。`demo.mp4` 不受影响（有 2MB 分片）。

---

## 七、故障排查

| 现象 | 排查 |
|---|---|
| **浏览器打不开** | ① 服务器本机 `curl localhost:8766/index.html` 通不通 ② `sudo nginx -t` ③ 云安全组放行 80/443 了吗 ④ `systemctl status globalsales` |
| **服务起不来** | `sudo journalctl -u globalsales -n 50 --no-pager`。最常见是端口被占：`sudo ss -lntp \| grep 8766` |
| **登录成功后立刻跳回登录页** | `GS_COOKIE_SECURE=1` 但用 http 访问 → 浏览器静默丢 cookie。改回 0，或配好 HTTPS |
| **502 Bad Gateway** | 后端没起：`systemctl status globalsales`。或 Nginx `proxy_pass` 端口与 `GS_PORT` 不一致 |
| **代理路由仍能匿名访问** | `sudo nginx -T \| grep -c ark_text` 确认配置已加载；检查 location 正则有没有被更靠前的 `location /` 抢走 |
| **视频生成中途 504** | Nginx `proxy_read_timeout` 不够（视频轮询最长 5 分钟），设 `300s` |
| **demo.mp4 播不动** | `proxy_buffering off` 加了吗；文件在不在：`ls -lh /opt/globalsales/demo.mp4`（应约 53MB） |
| **图片/视频生成失败** | 日志会打印厂商原始错误。多半是 key 余额用尽（MiniMax 返回 `status_code: 2056`；Agnes 返回 403 `insufficient_user_quota` 并附上剩余额度） |
| **视频报 400 `duration is not an allowed request field`** | 厂商 2026-08 换了 `/v1/videos` 的请求体，`duration`/`resolution` 已废弃，改用 `mode:'ti2vid'` + `seconds`（**字符串**）+ `size:'720P'`。代码已修；若自行改过 `callAgnesVideo` 请对照 [技术架构文档](../docs/技术架构文档.md) 的 schema 表 |
| **视频报 400 `Input should be 'ti2vid', 'keyframes' or 'multi_reference'`** | `mode` 是**枚举**不是自由字符串，文生视频只能填 `'ti2vid'`。代码已修。别按字段名猜取值 —— 厂商的报错会把合法枚举列全 |
| **视频报 503 `video_queue_full` / `Service busy: inference slot is in use` / 429 限流** | 都**不是**参数错：前两个是厂商队列或推理槽占满，等一两分钟重试；429 是视频接口限流 6 次/分钟。轮询侧已做退避重试。厂商繁忙时任务可能在 `queued` 停留数分钟，属正常 |
| **页面样式全乱** | Tailwind CDN 加载不出来 —— 服务器或客户端出网被墙 |
| **磁盘满** | `du -sh /opt/globalsales/data/users/*`，清掉不需要的用户媒体 |
| **想改端口** | 改 `/etc/globalsales.env` 的 `GS_PORT`，同步改 Nginx `proxy_pass`，重启两个服务 |
| **忘了管理员密码** | `sudo grep GS_ADMIN_PASS /etc/globalsales.env`（只在首次建库时生效）。库已建好则需另一个管理员在「用户管理」重置 |

---

## 八、迁移到新服务器

1. 老机器打包：`sudo tar -czf /root/gs-full.tar.gz -C /opt/globalsales data`
2. 新机器走第二节部署（**不传** `data/`）
3. 停服 → 解包覆盖 → 修权限 → 起服：

```bash
sudo systemctl stop globalsales
sudo tar -xzf /root/gs-full.tar.gz -C /opt/globalsales
sudo chown -R globalsales:globalsales /opt/globalsales/data
sudo chmod 700 /opt/globalsales/data
sudo systemctl start globalsales
```

> `assets.file_path` 存的是**绝对路径**。从 Windows 迁到 Linux 时 `deploy.sh` 会按文件名自动重指并打印迁移条数；Linux → Linux 同路径（都是 `/opt/globalsales`）无需处理。换了安装目录的话，重跑一次 `deploy.sh` 让它修。

---

相关文档：[功能清单](../docs/功能清单.md) · [操作手册](../docs/操作手册.md) · [通用 Linux 部署指南](服务器部署指南.md)
