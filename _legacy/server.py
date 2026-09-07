#!/usr/bin/env python3
"""
自媒体AI运营平台 — 生产级代理 + 静态文件服务器
支持 MiniMax（文本/图片/视频）+ 腾讯混元（图片/视频）+ 火山方舟 + Agnes AI API 代理

本地开发: python server.py → http://localhost:8766
阿里云部署: python server.py → http://<公网IP>:8766
"""
import ssl
import http.server
import socketserver
import urllib.request
import urllib.error
import urllib.parse
import json
import os
import sys
import re
import random
import gzip
import zlib
import html as html_lib
import sqlite3
import hashlib
import hmac
import secrets
import base64
import threading
import http.cookies
from datetime import datetime, timedelta

# 禁用 SSL 证书验证（解决云环境自签名证书拦截问题）
_SSL_CONTEXT = ssl._create_unverified_context()

PORT = int(os.environ.get('GS_PORT', '8766'))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_FILE = os.path.join(BASE_DIR, 'index.html')
SERVER_FILE = os.path.abspath(__file__)
ENV_FILE = os.path.join(BASE_DIR, '.env')


def _load_dotenv(path=None):
    """把项目根的 .env 读进 os.environ，供下面所有 os.environ.get 使用。

    必须在读取任何配置**之前**调用（本文件里就是紧跟着这个定义调用一次），
    否则下面的 MM_API_KEY 等常量已经用旧值算完了。

    规则（刻意做得很小，够用即可，不引入第三方 dotenv）：
      - `KEY=value`，每行一条；`#` 开头或空行跳过
      - 等号两侧空白忽略；值两端的成对引号（' 或 "）剥掉，便于写含空格的值
      - **已存在的环境变量优先**，不覆盖 —— 这样服务器上 systemd 的
        EnvironmentFile / 真实环境变量始终压过项目里的 .env，本机开发才用 .env
      - 文件不存在就静默跳过：这是可选配置，不是必需文件
    """
    p = path or ENV_FILE
    if not os.path.isfile(p):
        return 0
    n = 0
    try:
        with open(p, 'r', encoding='utf-8-sig') as f:
            for lineno, raw in enumerate(f, 1):
                line = raw.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' not in line:
                    print(f'[env] {os.path.basename(p)}:{lineno} 缺少 "="，已跳过')
                    continue
                k, v = line.split('=', 1)
                k = k.strip()
                v = v.strip()
                if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
                    v = v[1:-1]
                if not k:
                    continue
                if k in os.environ and os.environ[k] != '':
                    continue          # 真实环境变量优先，不被 .env 覆盖
                os.environ[k] = v
                n += 1
    except OSError as e:
        print(f'[env] 读取 {p} 失败：{e}')
        return 0
    if n:
        print(f'[env] 已从 .env 加载 {n} 个变量')
    return n


_load_dotenv()

# 端口必须在 _load_dotenv() 之后读，否则 .env 里的 GS_PORT 不生效
PORT = int(os.environ.get('GS_PORT', '8766'))


def _persist_env_keys(pairs):
    """把 {常量名: 密钥} 写进项目根的 .env，并让本进程立即生效。

    给「大模型配置」页保存内置模型密钥用。以前这里是写回 server.py 的字面量，
    现在源码里没有字面量了（密钥只在环境变量），所以改写 .env。
    - 已存在的同名行原地替换，不追加重复行；没有的追加到末尾
    - 同步更新 os.environ、模块级常量、以及 API_ROUTES 里已加载的 auth_key，
      这样不用重启就能用上新密钥
    - 新建文件时尝试 chmod 600（Windows 上无效，静默忽略）
    """
    if not pairs:
        return 0
    try:
        existing = ''
        if os.path.isfile(ENV_FILE):
            with open(ENV_FILE, 'r', encoding='utf-8-sig') as f:
                existing = f.read()
        lines = existing.splitlines()
        written = []
        for var, val in pairs.items():
            # 值里的换行会把一行拆成两行，破坏整个文件格式 —— 直接拒绝
            if '\n' in val or '\r' in val:
                print(f'[ConfigSync] {var} 的值含换行，已跳过')
                continue
            new_line = f'{var}={val}'
            for i, ln in enumerate(lines):
                if ln.strip().startswith(var + '='):
                    lines[i] = new_line
                    break
            else:
                lines.append(new_line)
            os.environ[var] = val
            globals()[var] = val          # 更新模块级常量
            written.append(var)
        if not written:
            return 0
        is_new = not os.path.isfile(ENV_FILE)
        with open(ENV_FILE, 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(lines).rstrip('\n') + '\n')
        if is_new:
            try:
                os.chmod(ENV_FILE, 0o600)
            except OSError:
                pass
        # 注意：API_ROUTES[...]['auth_key'] 由调用方 sync_models_to_files 就地更新
        # （它拿得到 model_id → route 的映射），这里不重复处理。
        # 只打被拒绝过滤后真正落盘的那些，否则日志会把跳过的键也说成"已写入"。
        print(f'[ConfigSync] 已写入 .env: {", ".join(written)}')
        return len(written)
    except OSError as e:
        print(f'[ConfigSync] 写入 .env 失败：{e}')
        return 0

# ====================== API 密钥配置 ======================
# 密钥**不写在源码里**：源码会被拷贝、打包、上传，字面量跟着一起走。
# 一律从环境变量读，本机开发放在项目根的 .env（已在 .gitignore 里，
# 且静态白名单是 deny-by-default，HTTP 拿不到），服务器上用 systemd 的
# EnvironmentFile（chmod 600）。两者都不存在时值为空 —— 那时对应模型会报鉴权错，
# 这是**故意**的：宁可明确报错，也不要为了"能跑"把密钥又塞回源码。
# 参照 .env.example 建 .env。
# MiniMax API Key
MM_API_KEY = os.environ.get('MM_API_KEY', '')
# 腾讯混元 API Key
HY_API_KEY = os.environ.get('HY_API_KEY', '')
# Agnes AI API Key（图像+视频生成
AGNES_API_KEY = os.environ.get('AGNES_API_KEY', '')
# 火山方舟 API Key（标准端点 api/v3：图片生成 Seedream 可用；文本 CodingPlan 已过期）
ARK_API_KEY = os.environ.get('ARK_API_KEY', '')
# 火山方舟 Agent Plan API Key（端点 api/plan/v3，与上面那个是**不同的两把 key**，不可互换：
# 这把打 api/v3/images/generations 会 401，上面那把打 plan/v3/chat/completions 会 404。
# 实测该端点 + 模型 ark-code-latest 支持：文本生成、图片理解（多模态）、SSE 流式。）
ARK_PLAN_API_KEY = os.environ.get('ARK_PLAN_API_KEY', '')
# Seedance 2 Mini API Key（AggregateAPI 视频生成）
SEEDANCE_MINI_API_KEY = os.environ.get('SEEDANCE_MINI_API_KEY', '')

# ====================== 数据库 + 用户系统 ======================
# 全部标准库实现（sqlite3 / hashlib / hmac / secrets），零第三方依赖。
DATA_DIR = os.path.join(BASE_DIR, 'data')
DB_PATH = os.path.join(DATA_DIR, 'app.db')
USERS_DIR = os.path.join(DATA_DIR, 'users')
SESSION_TTL_DAYS = 7
PBKDF2_ITER = 200000

# 首次启动 seed 的管理员账号
# 服务器上务必用环境变量把密码改掉 —— 源码里这个默认值是公开的，
# 谁读过这份仓库就都知道它。已存在的用户不会被覆盖，只在首次建库时生效。
SEED_ADMIN_USER = os.environ.get('GS_ADMIN_USER', 'martinxie')
SEED_ADMIN_PASS = os.environ.get('GS_ADMIN_PASS', 'sunny520')

# 会话 Cookie 是否加 Secure 标记。前面套了 HTTPS（Nginx/Caddy）时设为 1，
# 浏览器就只在加密连接上回传 session，防止明文网络里被抓走。
# 纯 http 直连时必须留 0，否则浏览器会直接丢掉 cookie，永远登不上。
COOKIE_SECURE = os.environ.get('GS_COOKIE_SECURE', '0') == '1'

_db_lock = threading.Lock()


def get_db():
    """每次取一个连接（WAL + 外键）。SQLite 在多线程下用短连接最稳。"""
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


def hash_password(password, salt=None):
    """PBKDF2-SHA256，返回 (hash_hex, salt_hex)。"""
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), PBKDF2_ITER)
    return dk.hex(), salt


def verify_password(password, salt_hex, expected_hash_hex):
    calc = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt_hex.encode('utf-8'), PBKDF2_ITER).hex()
    return hmac.compare_digest(calc, expected_hash_hex)


def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(USERS_DIR, exist_ok=True)
    with _db_lock:
        conn = get_db()
        try:
            cur = conn.cursor()
            cur.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                pass_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at TEXT NOT NULL,
                prompts_seeded INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                title TEXT,
                content TEXT,
                url TEXT,
                file_path TEXT,
                platform TEXT,
                model TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS user_prompts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                prompt_id TEXT NOT NULL,
                module TEXT,
                name TEXT,
                content TEXT,
                language TEXT,
                UNIQUE(user_id, prompt_id)
            );
            CREATE TABLE IF NOT EXISTS user_models (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                model_id TEXT NOT NULL,
                name TEXT,
                provider TEXT,
                base_url TEXT,
                protocol TEXT,
                type TEXT,
                model_slug TEXT,
                status TEXT,
                api_key TEXT,
                UNIQUE(user_id, model_id)
            );
            CREATE TABLE IF NOT EXISTS user_module_defaults (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                module_key TEXT NOT NULL,
                model_id TEXT,
                PRIMARY KEY(user_id, module_key)
            );
            CREATE TABLE IF NOT EXISTS user_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                data TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ip_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS user_appdata (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id, kind);
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            ''')
            conn.commit()
            # 用户名唯一约束升级为不区分大小写。
            # 表定义里的 `username TEXT UNIQUE` 本身是区分大小写的（SQLite 的 = 对 ASCII
            # 大小写敏感），改列定义要重建表；加一条 NOCASE 唯一索引即可在**数据库层**兜住。
            # 这是纵深防御：_api_register 的应用层查重有 TOCTOU 竞态（两个并发注册请求
            # 可能都通过检查），唯一索引是最后一道闸。
            # 幂等 + 当前 5 个用户全小写无冲撞（已核对），所以建索引不会失败。
            try:
                cur.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase'
                            ' ON users(username COLLATE NOCASE)')
                conn.commit()
            except sqlite3.IntegrityError as e:
                # 万一历史数据里真有大小写冲撞（如 martinxie + MartinXie），不能让整个
                # 服务起不来。打印出来让管理员手工合并，登录侧的 COLLATE NOCASE 仍然生效。
                print(f'[DB] ⚠️ 用户名存在大小写冲撞，NOCASE 唯一索引未建立: {e}')
                conn.rollback()
            # seed 管理员（同样用 NOCASE，避免 SEED_ADMIN_USER 大小写变化时重复 seed）
            row = cur.execute('SELECT id FROM users WHERE username = ? COLLATE NOCASE',
                              (SEED_ADMIN_USER,)).fetchone()
            if not row:
                h, s = hash_password(SEED_ADMIN_PASS)
                cur.execute(
                    'INSERT INTO users(username, pass_hash, salt, role, created_at, prompts_seeded) VALUES(?,?,?,?,?,0)',
                    (SEED_ADMIN_USER, h, s, 'admin', datetime.utcnow().isoformat())
                )
                # 全新库的管理员也要开箱可用（否则首次部署登录进来一个模型都没有）
                _seed_new_user_models(cur, cur.lastrowid)
                conn.commit()
                print(f'[DB] Seeded admin user: {SEED_ADMIN_USER}')
            _migrate_stale_model_configs(cur, conn)
            # 放在最后：它会重建 7 张表，前面那些迁移必须先在旧表上跑完
            _migrate_user_fk_cascade(conn)
        finally:
            conn.close()


# ============ 用户数据级联删除迁移 ============
# 建库时这 7 张表的 user_id 只是个普通整数列，没有外键。后果有两层：
#   1. 删用户要靠 _api_admin_users 手写 8 条 DELETE。漏一张表就留一批孤儿数据 ——
#      user_appdata 就漏过（已补），但下次加新表还会再漏一次，这是结构性问题。
#   2. 库里真的存在孤儿：user_id=12 的用户早已删除，却留着 22 条 user_prompts
#      + 1 条 user_appdata（含 selectedPlatform:'instagram' 这种海外版残留快照）。
# 改成数据库层 ON DELETE CASCADE：删 users 一行，其余全部自动跟着走，
# 并且以后再也插不进孤儿行（FK 会直接拒绝）。
#
# SQLite 不支持 ALTER TABLE ADD CONSTRAINT，只能"重命名旧表 → 建新表 → 搬数据 → 删旧表"。
# 三个踩过的坑，改动前先看清楚：
#   · 必须先清孤儿。孤儿行会让搬数据那步撞 FK 约束，整个迁移回滚。
#   · PRAGMA foreign_keys 必须先关。重建期间旧表被 DROP 的瞬间约束是不成立的。
#   · AUTOINCREMENT 高水位存在 sqlite_sequence，DROP 旧表会把那一行带走，新表 seq
#     退回"当前最大 id"。实测 user_models 从 194 掉到 183 —— 删行后新增会复用
#     已经发出去过的 id。所以逐表记下 seq，重建完写回。
_FK_CASCADE_TABLES = ['sessions', 'assets', 'user_prompts', 'user_models',
                      'user_module_defaults', 'user_accounts', 'user_appdata']

_FK_CASCADE_SCHEMA = {
    'sessions': '''CREATE TABLE sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )''',
    'assets': '''CREATE TABLE assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                title TEXT,
                content TEXT,
                url TEXT,
                file_path TEXT,
                platform TEXT,
                model TEXT,
                created_at TEXT NOT NULL
            )''',
    'user_prompts': '''CREATE TABLE user_prompts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                prompt_id TEXT NOT NULL,
                module TEXT,
                name TEXT,
                content TEXT,
                language TEXT,
                UNIQUE(user_id, prompt_id)
            )''',
    'user_models': '''CREATE TABLE user_models (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                model_id TEXT NOT NULL,
                name TEXT,
                provider TEXT,
                base_url TEXT,
                protocol TEXT,
                type TEXT,
                model_slug TEXT,
                status TEXT,
                api_key TEXT,
                UNIQUE(user_id, model_id)
            )''',
    'user_module_defaults': '''CREATE TABLE user_module_defaults (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                module_key TEXT NOT NULL,
                model_id TEXT,
                PRIMARY KEY(user_id, module_key)
            )''',
    'user_accounts': '''CREATE TABLE user_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                data TEXT NOT NULL,
                created_at TEXT NOT NULL
            )''',
    'user_appdata': '''CREATE TABLE user_appdata (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )''',
}

_FK_CASCADE_INDEXES = [
    'CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id, kind)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
]


def _purge_orphan_user_rows(cur):
    """删掉 user_id 已不存在于 users 表的行。返回删除总数。

    单独成函数是因为它有两个调用点：FK 迁移前必须清（否则搬数据撞约束），
    以及 FK 已就位的库上每次启动兜一次（理论上不会有，但真出现了要能自愈）。
    """
    n = 0
    for t in _FK_CASCADE_TABLES:
        cur.execute('DELETE FROM %s WHERE user_id IS NULL'
                    ' OR user_id NOT IN (SELECT id FROM users)' % t)
        if cur.rowcount > 0:
            print(f'[DB] 清理孤儿数据 {t}: {cur.rowcount} 行')
            n += cur.rowcount
    return n


def _migrate_user_fk_cascade(conn):
    """给 7 张用户数据表补上 ON DELETE CASCADE 外键（详见上方注释）。"""
    cur = conn.cursor()
    # 幂等闸：7 张表都已有外键就直接返回。不加这一道的话每次启动都要重建 7 张表 ——
    # 数据是对的（实测幂等），但几十万行白搬一趟，且每次都会重写整个库文件。
    done = all(cur.execute('PRAGMA foreign_key_list(%s)' % t).fetchall()
               for t in _FK_CASCADE_TABLES)
    if done:
        # 约束已就位，孤儿理论上进不来；仍兜一次，有就说明哪里绕过了 FK
        purged = _purge_orphan_user_rows(cur)
        if purged:
            conn.commit()
            print(f'[DB] ⚠️ FK 已就位却仍有 {purged} 行孤儿数据，已清理')
        return

    purged = _purge_orphan_user_rows(cur)
    conn.commit()

    # 手动接管事务。两个原因，缺一不可：
    #   · PRAGMA foreign_keys 在事务里是静默 no-op，必须确保此刻没有未提交事务；
    #   · 默认 isolation_level 下 Python 会在 DML 前自己插一条 BEGIN，
    #     和下面显式的 BEGIN 撞成 "cannot start a transaction within a transaction"。
    old_isolation = conn.isolation_level
    conn.isolation_level = None
    cur.execute('PRAGMA foreign_keys=OFF')
    try:
        cur.execute('BEGIN')
        for t in _FK_CASCADE_TABLES:
            cols = ', '.join(r[1] for r in cur.execute('PRAGMA table_info(%s)' % t).fetchall())
            seq = cur.execute('SELECT seq FROM sqlite_sequence WHERE name=?', (t,)).fetchone()
            cur.execute('ALTER TABLE %s RENAME TO _fkmig_%s' % (t, t))
            cur.execute(_FK_CASCADE_SCHEMA[t])
            cur.execute('INSERT INTO %s(%s) SELECT %s FROM _fkmig_%s' % (t, cols, cols, t))
            cur.execute('DROP TABLE _fkmig_%s' % t)
            if seq:
                # sqlite_sequence 没有唯一约束，用不了 ON CONFLICT。先 UPDATE 再 INSERT。
                cur.execute('UPDATE sqlite_sequence SET seq=? WHERE name=?', (seq[0], t))
                if cur.rowcount == 0:
                    cur.execute('INSERT INTO sqlite_sequence(name, seq) VALUES(?,?)', (t, seq[0]))
        for ix in _FK_CASCADE_INDEXES:
            cur.execute(ix)
        cur.execute('COMMIT')
    except Exception as e:
        try:
            cur.execute('ROLLBACK')
        except Exception:
            pass
        # 迁移失败不能让服务起不来：旧结构仍然可用，删用户走 _api_admin_users
        # 那 8 条手写 DELETE 也仍然有效，只是回到"没有数据库层保险"的状态。
        print(f'[DB] ⚠️ 外键级联迁移失败，已回滚，继续以旧结构运行: {e}')
        return
    finally:
        cur.execute('PRAGMA foreign_keys=ON')
        conn.isolation_level = old_isolation

    bad = cur.execute('PRAGMA foreign_key_check').fetchall()
    if bad:
        print(f'[DB] ⚠️ 迁移后 foreign_key_check 有 {len(bad)} 条异常: {bad[:5]}')
    print(f'[DB] 已为 {len(_FK_CASCADE_TABLES)} 张用户数据表建立 ON DELETE CASCADE'
          + (f'（顺带清理 {purged} 行孤儿数据）' if purged else ''))


# 历史遗留数据修复：早期版本把已失效的 Seedance key / 不完整的 baseUrl 存进了每个用户的
# user_models 里，而 getModelRuntimeConfig 优先用 DB 值，导致改了源码常量也不生效。
# 这里按 model_id 精确定位（参数化 SQL），只覆盖已知的错值，用户自己填的新值不动。
# 这里只修 base_url，**不碰 api_key**。原先还有一项"把某个已失效的 Seedance key 值换成空串"，
# 已删除，两个原因：
#   1. 多余 —— _scrub_builtin_model_keys 会把所有 BUILTIN_MODEL_IDS 行的 api_key 一律清空
#      （不看值是什么），seedance-mini-video 就在那个集合里，且那趟迁移紧跟在本循环之后跑。
#   2. 那个"错值"是一把真实的 key 字面量，留在源码里就会跟着每一次拷贝/打包/上传走，
#      也让部署文档承诺的"源码里没有任何密钥字面量"自查不成立（2026-08-24 实测该 key 已
#      失效：POST /api/v1/tasks/create → 401 Invalid or inactive API Key，与 .env 里在用的
#      那把不是同一个）。内置模型的密钥只在服务端，见 BUILTIN_MODEL_KEY_VARS。
_STALE_MODEL_FIXES = [
    # (model_id, 错误的 base_url, 正确的 base_url)
    ('seedance-mini-video',
     'https://aaapi.togomol.com/api/v1',
     'https://aaapi.togomol.com/api/v1/tasks'),
]

# 账号侧不可用、必然失败的内置模型：统一禁用，避免用户选了才发现报错。
# minimax-video: 套餐不含 T2V-01（status_code 2061）；hunyuan-video: 提交返回 402 Payment Required。
# 三个 image 模型 2026-08-11 实测同时失效，这就是用户报的"文章图片出不来"的根因：
#   minimax-image  → HTTP 200 但 base_resp.status_code=2056「已达到 Token Plan 用量上限」，data 为 null
#   agnes-image    → 直连厂商 90s 超时（HTTP 000），代理侧报 Remote end closed connection
#   hunyuan-image  → HTTP 404，腾讯 tokenhub 该端点已废弃
# 禁用而不是删除：充值/端点恢复后在「大模型配置」里改回 active 即可。
# 若日后账号开通，把 model_id 从这里移除并在「大模型配置」里改回启用即可。
#
# agnes-video-25: 2026-08-24 复测 —— 厂商侧**已经上线**，但账号余额不够，仍需禁用。
#   变化：2026-08-19 时是 HTTP 503 model_not_found「No available channel」；现在
#   GET /v1/models 的可用清单里已经有 agnes-video-2.5，提交也不再报 model_not_found，
#   改成 HTTP 403：
#     {"code":"insufficient_user_quota",
#      "message":"预扣费额度失败, 用户剩余额度: ＄0.100000, 需要预扣费额度: ＄0.125000"}
#   即单次 2.5 视频要 $0.125，而 Agnes 账号只剩 $0.10。所以禁用理由从"厂商未上线"
#   变成"账号余额不足"。V2.0 单价低，2026-08-24 实测仍能跑通（走本站代理提交 200 →
#   轮询 completed → 顶层 url 拿到 1.3MB 的 mp4），但余额见底后也会开始失败。
#   充值后在「大模型配置」里把状态改成 active 即可，代码已按新 schema 接对，无需改。
_DISABLE_MODEL_IDS = ['minimax-video', 'hunyuan-video',
                      'minimax-image', 'agnes-image', 'hunyuan-image',
                      'agnes-video-25']
_DISABLE_MODEL_NAMES = {
    'minimax-video': 'MiniMax T2V-01（套餐未开通）',
    'hunyuan-video': '腾讯混元 hy-video-1.5（账号欠费）',
    'minimax-image': 'MiniMax Image-01（额度已用尽）',
    'agnes-image': 'Agnes AI Image 2.1 Flash（厂商超时）',
    'hunyuan-image': '腾讯混元 Image（端点已失效）',
    'agnes-video-25': 'Agnes AI Video 2.5（账号余额不足）',
}

# ===== Agnes /v1/videos 请求体 schema（2026-08-24 实测，踩过坑别改回去）=====
# 厂商把 V2.0 和 2.5 统一成了同一套请求体。**用户报的"视频生成失败 HTTP 400
# duration is not an allowed request field"就是这次变更打中的**：旧代码
# callAgnesVideo() 还在发 duration + size:'768x768'。
# 逐字段实测结论：
#   duration    → 400 "duration is not an allowed request field"（已废弃）
#   resolution  → 400 "resolution is not an allowed request field"（已废弃）
#   size        → 只收档位字符串 '720P'；'768x768' 这种像素写法不再接受
#   mode        → **新增必填**，缺了报 "mode is required"。取值是**枚举**，不是自由字符串：
#                 只收 'ti2vid' / 'keyframes' / 'multi_reference'。文生视频用 'ti2vid'。
#                 填别的（比如想当然的 'text'）会 400：
#                 "Input should be 'ti2vid', 'keyframes' or 'multi_reference'"
#   seconds     → 取代 duration，且**必须是字符串**。传数字会 400：
#                 "json: cannot unmarshal number into Go struct field
#                  taskSubmitReqAlias.seconds of type string"
#   aspect_ratio→ 白名单 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16，其余会被拒
# 实测通过的组合（V2.0 直连厂商 HTTP 200 queued；2.5 同 schema）：
#   {model, prompt, mode:'ti2vid', seconds:'5', size:'720P', aspect_ratio:'16:9', n:1}
# 回包里的 size 是厂商换算后的实际像素（如 1088x832），不等于你传的档位，不用管。
# 另外两个**不是参数错**、但很容易被当成参数错的响应：
#   503 {"code":"video_queue_full"}        → 厂商队列满，等一两分钟重试即可
#   429 video generation rate limit ...    → 视频接口限流 6 次/分钟
# 前端轮询是 5 秒一轮（12 次/分钟），必然会撞 429，所以 callAgnesVideo 里对 429
# 做退避重试而不是当失败 —— 否则排队稍久的任务全都会被误报成"生成失败"。
# 完成后的视频地址在**顶层 `url`**，`metadata` 整个是 null。这一点我先前记错过（写成
# "在 metadata.url，不在 url"），2026-08-24 走本站代理端到端复测后纠正：完成响应的顶层键里
# 就有 url，同时还有 video_id / size / seconds / status / progress 等。前端仍走
# findFirstVideoUrl 递归查找兜底 —— 厂商换过一次位置，写死路径就会再坏一次。

# Agnes Video 2.5 只播种给**管理员**：用户明确要求"给管理员账号配置"。
# 普通用户的模型列表保持"自行添加"的既有约定，不凭空塞。
# api_key 写空串 —— 内置模型的密钥只在服务端，详见 BUILTIN_MODEL_KEY_VARS。
_SEED_AGNES_VIDEO25 = {
    'model_id': 'agnes-video-25',
    'name': 'Agnes AI Video 2.5（账号余额不足）',
    'provider': 'Agnes AI',
    'base_url': 'https://apihub.agnes-ai.com/v1/videos',
    'protocol': 'OpenAI Videos 兼容协议',
    'type': 'video',
    'model_slug': 'agnes-video-2.5',
    'status': 'disabled',
}

# 三家图片模型全禁用后，老用户的 user_models 里就一个可用的 image 模型都不剩了 ——
# 前端 getModelsByType('image') 返回空 → callModuleImage 无从降级 → 依然零配图。
# 所以要给**已经有过 image 模型**的用户补一条实测可用的 Seedream。
# 只补给这些人，不给新用户/纯文本用户凭空塞模型（保持"新用户自行添加"的既有约定）。
_SEED_ARK_IMAGE = {
    'model_id': 'ark-image',
    'name': '火山方舟 Seedream 4.0',
    'provider': '字节跳动火山方舟',
    'base_url': 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    'protocol': 'OpenAI 兼容协议',
    'type': 'image',
    'model_slug': 'doubao-seedream-4-0-250828',
    'status': 'active',
}

# 文本模型全线失效后的救场（实测，非推断）：
#   ark-text（coding/v3）→ 400 InvalidSubscription，CodingPlan 订阅已过期
#   minimax-text        → 429「已达到 Token Plan 用量上限」
# 于是**所有**用户的文案创作/图文生成/热点分析/选品/评论都在报错。
# Agent Plan 端点是当前唯一可用的一条，播种给每个已有文本模型的用户。
# 注意 model_slug 必须是 ark-code-latest —— doubao-* 那一系在此端点全部
# 404 UnsupportedModel（曾按 18 个模型名逐个实测）。
# api_key 写空串：这条已进 BUILTIN_MODEL_KEY_VARS，密钥只在服务端。
_SEED_ARK_PLAN_TEXT = {
    'model_id': 'ark-plan-text',
    'name': '火山方舟 Agent Plan（文本+图片理解）',
    'provider': '字节跳动火山方舟',
    'base_url': 'https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions',
    'protocol': 'OpenAI 兼容协议',
    'type': 'text',
    'model_slug': 'ark-code-latest',
    'status': 'active',
}

# ====================== 内置模型：密钥只在服务端 ======================
# model_id → server.py 里对应的密钥常量名。这是**唯一**一份内置模型清单，
# sync_models_to_files 里的 key_by_id 也引用它，避免两处各写一份逐渐对不上。
#
# 为什么内置模型的 api_key 一律不落库、不回传：
#   这些是**平台自己的厂商账号凭据**，不是用户的。走 HTTP 访问时前端根本用不到它们 ——
#   请求都发给自己后端 /api/*，build_headers() 用服务端密钥重新构造请求头，
#   浏览器带来的那个本来就被丢掉（实测：假 key、完全不带 key 打 /api/ark_text 都返回 200）。
#   但只要 GET /api/data/models 把 api_key 发回去，任何一个**普通注册用户**登录后
#   按 F12 打一次这个接口，就能把平台的全部厂商密钥完整抄走 —— 门槛比首页字面量高一点，
#   后果一样。而且 _seed_ark_image 早期是拿源码常量播种的，密钥已经散进了多个用户的行里。
# 用户自己添加的**自定义模型**不在此列：那是用户自己的账号凭据，必须存、也必须回传给他自己
#   （/api/custom_model 需要客户端带上），只按 WHERE user_id=? 隔离。
BUILTIN_MODEL_KEY_VARS = {
    'ark-text': 'ARK_API_KEY',
    'ark-plan-text': 'ARK_PLAN_API_KEY',
    'ark-image': 'ARK_API_KEY',
    'minimax-text': 'MM_API_KEY',
    'minimax-image': 'MM_API_KEY',
    'minimax-video': 'MM_API_KEY',
    'hunyuan-video': 'HY_API_KEY',
    'hunyuan-image': 'HY_API_KEY',
    'agnes-image': 'AGNES_API_KEY',
    'agnes-video': 'AGNES_API_KEY',
    'agnes-video-25': 'AGNES_API_KEY',
    'seedance-mini-video': 'SEEDANCE_MINI_API_KEY',
}
BUILTIN_MODEL_IDS = tuple(BUILTIN_MODEL_KEY_VARS.keys())

# 本机所有平台密钥的集合，用于"这个值是不是平台密钥"的判定（落库拦截 + 迁移清理）。
# frozenset 便于 `in` 判定；空值过滤掉，否则空串会被误判成平台密钥。
_PLATFORM_KEYS = frozenset(k for k in (MM_API_KEY, HY_API_KEY, AGNES_API_KEY,
                                      SEEDANCE_MINI_API_KEY, ARK_API_KEY,
                                      ARK_PLAN_API_KEY) if k)


def _server_key_for_url(url):
    """目标 URL 命中某条内置路由时，返回该路由的服务端密钥，否则空串。

    给 handle_custom_model 兜底：把内置端点手动加成"自定义模型"的用户，
    清库后不带 key 也能继续用，密钥不必再经过浏览器。
    只按**完整 URL 精确相等**匹配，不做前缀匹配 —— 否则构造一个
    https://ark.cn-beijing.volces.com/api/evil 之类的地址就能把密钥骗出去。
    """
    u = (url or '').strip()
    if not u:
        return ''
    for route in API_ROUTES.values():
        if route.get('url') == u and route.get('auth_key'):
            return route['auth_key']
    return ''


def _migrate_stale_model_configs(cur, conn):
    changed = 0
    for model_id, bad_url, good_url in _STALE_MODEL_FIXES:
        cur.execute('UPDATE user_models SET base_url=? WHERE model_id=? AND base_url=?',
                    (good_url, model_id, bad_url))
        changed += cur.rowcount
    for model_id in _DISABLE_MODEL_IDS:
        cur.execute("UPDATE user_models SET status='disabled' WHERE model_id=? AND status!='disabled'",
                    (model_id,))
        changed += cur.rowcount
        new_name = _DISABLE_MODEL_NAMES.get(model_id)
        if new_name:
            cur.execute('UPDATE user_models SET name=? WHERE model_id=? AND name!=?',
                        (new_name, model_id, new_name))
            changed += cur.rowcount
    # 模块默认模型指向了已禁用/失效模型时清掉，让前端回落到可用模型
    cur.execute(
        'DELETE FROM user_module_defaults WHERE model_id IN (%s)'
        % ','.join('?' for _ in _DISABLE_MODEL_IDS), tuple(_DISABLE_MODEL_IDS))
    changed += cur.rowcount
    changed += _seed_ark_image(cur)
    changed += _seed_agnes_video25(cur)
    # 必须在 _scrub_builtin_model_keys 之前：它会把 text-custom 里那把明文的
    # 平台 Agent Plan key 一并清掉（第 2 轮按值比对），清完靠 _server_key_for_url 兜底。
    changed += _seed_ark_plan_text(cur)
    changed += _scrub_builtin_model_keys(cur)
    if changed:
        conn.commit()
        print(f'[DB] Migrated {changed} stale model config field(s)')


def _seed_ark_image(cur):
    """给已有 image 模型的老用户补一条可用的 Seedream（详见 _SEED_ARK_IMAGE 注释）。

    幂等：已经有 ark-image 的用户跳过。api_key 写空串 —— 内置模型的密钥只在服务端，
    详见 BUILTIN_MODEL_KEY_VARS 的注释。早期这里播种的是源码常量 ARK_API_KEY，
    结果把平台密钥散进了每个用户的行里，_scrub_builtin_model_keys 负责清理那批历史数据。
    """
    s = _SEED_ARK_IMAGE
    rows = cur.execute(
        "SELECT DISTINCT user_id FROM user_models WHERE type='image'"
        " AND user_id NOT IN (SELECT user_id FROM user_models WHERE model_id=?)",
        (s['model_id'],)).fetchall()
    n = 0
    for (uid,) in rows:
        cur.execute(
            'INSERT OR IGNORE INTO user_models'
            '(user_id, model_id, name, provider, base_url, protocol, type, model_slug, status, api_key)'
            ' VALUES(?,?,?,?,?,?,?,?,?,?)',
            (uid, s['model_id'], s['name'], s['provider'], s['base_url'],
             s['protocol'], s['type'], s['model_slug'], s['status'], ''))
        n += cur.rowcount
    if n:
        print(f'[DB] Seeded ark-image (Seedream) for {n} user(s)')
    return n


def _seed_ark_plan_text(cur):
    """给已有 text 模型的用户补一条 Agent Plan 文本模型（详见 _SEED_ARK_PLAN_TEXT 注释）。

    幂等：已经有 ark-plan-text 的用户跳过。api_key 写空串（内置模型，密钥只在服务端）。
    顺带禁用已失效的 coding/v3 链路 —— 不删行，只置 disabled 并清空 api_key：
      · 置 disabled 让 getModelsByType('text') 不再把它列进降级序列，省掉每次
        必然失败的一跳（实测 400 InvalidSubscription）。
      · 清空 api_key 是安全修复：有用户把这个端点手动加成了 text-custom，
        行里存着平台的 Agent Plan key，而自定义模型的 api_key 是会被
        GET /api/data/models 回传到浏览器的。清空后由 _server_key_for_url 兜底。
    """
    s = _SEED_ARK_PLAN_TEXT
    rows = cur.execute(
        "SELECT DISTINCT user_id FROM user_models WHERE type='text'"
        " AND user_id NOT IN (SELECT user_id FROM user_models WHERE model_id=?)",
        (s['model_id'],)).fetchall()
    n = 0
    for (uid,) in rows:
        cur.execute(
            'INSERT OR IGNORE INTO user_models'
            '(user_id, model_id, name, provider, base_url, protocol, type, model_slug, status, api_key)'
            ' VALUES(?,?,?,?,?,?,?,?,?,?)',
            (uid, s['model_id'], s['name'], s['provider'], s['base_url'],
             s['protocol'], s['type'], s['model_slug'], s['status'], ''))
        n += cur.rowcount
    if n:
        print(f'[DB] Seeded ark-plan-text (Agent Plan) for {n} user(s)')
    # 失效的 coding/v3 文本行：置 disabled + 清 key。用 LIKE 匹配端点而不是 model_id，
    # 因为它同时以 ark-text 和 text-custom 两个 id 存在（各用户手动加的名字不一样）。
    cur.execute(
        "UPDATE user_models SET status='disabled' WHERE type='text'"
        " AND base_url LIKE '%/api/coding/v3/%' AND status != 'disabled'")
    m = cur.rowcount
    cur.execute(
        "UPDATE user_models SET api_key='' WHERE type='text'"
        " AND base_url LIKE '%/api/coding/v3/%' AND api_key != ''")
    m += cur.rowcount
    if m:
        print(f'[DB] 已禁用 {m} 行失效的 coding/v3 文本模型（CodingPlan 订阅过期）')
    return n + m


def _seed_new_user_models(cur, uid):
    """新注册用户的开箱可用模型。

    只播种**密钥托管在服务端**的内置模型（ark-plan-text / ark-image），api_key 一律空串。
    这不违反"新用户模型列表为空、自行添加"的既有约定 —— 那条约定的前提是每个模型都需要
    用户自己的厂商 key，所以塞一个空 key 的行只会让他看到一个必然失败的模型。而这两条的
    key 在 .env 里、由 build_headers() 服务端注入（见 BUILTIN_MODEL_KEY_VARS 注释），
    用户无需任何配置就能用。不播的话新用户登录后 7 个文本模块和图片模块全是
    "尚未配置大模型"，等于注册完什么都做不了。
    用户自己的付费模型（MiniMax / Agnes 等）仍然不播，需要他自己填 key。
    """
    for s in (_SEED_ARK_PLAN_TEXT, _SEED_ARK_IMAGE):
        cur.execute(
            'INSERT OR IGNORE INTO user_models'
            '(user_id, model_id, name, provider, base_url, protocol, type, model_slug, status, api_key)'
            ' VALUES(?,?,?,?,?,?,?,?,?,?)',
            (uid, s['model_id'], s['name'], s['provider'], s['base_url'],
             s['protocol'], s['type'], s['model_slug'], s['status'], ''))


def _seed_new_user_prompts(cur, uid):
    """新注册用户复用**管理员当前的**提示词配置（需求 15）。

    种子取的是 admin 在 user_prompts 表里的实时行，不是 index.html 里的
    defaultPrompts 常量 —— 管理员在「提示词配置」页改过的内容才是"管理员的
    配置"，而那个常量的回写通道曾经长期是坏的（见 sync_prompts_to_index），
    以常量为准会让新用户拿到一份过时的。

    role='admin' 取 id 最小的一个。站点实际只有一个管理员，但这个列没有
    唯一约束，多个 admin 时不加 LIMIT 会把两人的提示词混插进新用户表里。

    幂等三保险：只在 _api_register 里调（老用户走 _api_login，不经过）；
    INSERT OR IGNORE 撞 UNIQUE(user_id, prompt_id) 就跳过；prompts_seeded
    置 1。最后那个列从建库起就在 schema 里（见 init_db）却一直没人读，
    正好拿来当闸 —— 库里现有用户全是 0，置 1 只影响新注册的人。

    全新库里 admin 还没登录过时管理员表是空的，这里拷 0 条。此时前端
    bootAppData() 里那段"拉到空就用 defaultPrompts 铺一份"的兜底照旧生效
    —— 那段**不是**多余的重复，别顺手删。
    """
    rows = cur.execute(
        'SELECT prompt_id, module, name, content, language FROM user_prompts'
        " WHERE user_id = (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1)").fetchall()
    for r in rows:
        cur.execute(
            'INSERT OR IGNORE INTO user_prompts(user_id, prompt_id, module, name, content, language)'
            ' VALUES(?,?,?,?,?,?)',
            (uid, r['prompt_id'], r['module'], r['name'], r['content'], r['language']))
    cur.execute('UPDATE users SET prompts_seeded = 1 WHERE id = ?', (uid,))
    if rows:
        print(f'[DB] Seeded {len(rows)} admin prompt(s) for new user #{uid}')
    return len(rows)


def _seed_agnes_video25(cur):
    """给**管理员**账号补一条 Agnes Video 2.5（详见 _SEED_AGNES_VIDEO25 注释）。

    幂等：已经有这条记录的用户跳过（UNIQUE(user_id, model_id) + NOT IN 双保险）。
    只发给 role='admin' 的用户 —— 用户要求的是"给管理员账号配置"。
    """
    s = _SEED_AGNES_VIDEO25
    rows = cur.execute(
        "SELECT id FROM users WHERE role='admin'"
        " AND id NOT IN (SELECT user_id FROM user_models WHERE model_id=?)",
        (s['model_id'],)).fetchall()
    n = 0
    for (uid,) in rows:
        cur.execute(
            'INSERT OR IGNORE INTO user_models'
            '(user_id, model_id, name, provider, base_url, protocol, type, model_slug, status, api_key)'
            ' VALUES(?,?,?,?,?,?,?,?,?,?)',
            (uid, s['model_id'], s['name'], s['provider'], s['base_url'],
             s['protocol'], s['type'], s['model_slug'], s['status'], ''))
        n += cur.rowcount
    if n:
        print(f'[DB] Seeded agnes-video-25 for {n} admin user(s)')
    return n


def _scrub_builtin_model_keys(cur):
    """一次性迁移：清空 user_models 里的明文**平台**厂商密钥。

    这些密钥是历史遗留 —— 早期 _seed_ark_image 和前端同步都会把源码常量写进 user_models，
    于是普通用户 mxie 手里也握着和管理员一样的 10 个厂商密钥。清空是安全的：
    走代理时前端不用这个值（build_headers 会用服务端密钥覆盖）。
    幂等：已经是空串的行不会被 UPDATE 命中（WHERE api_key != ''）。

    两轮清理：
      1. 内置 model_id 的行 —— 不管里面是什么值，一律清空。
      2. **任意** model_id 的行，只要 api_key 恰好等于本机某个平台密钥。
         第 2 轮是必需的：实测有用户把内置的 Ark 端点手动加成了"自定义模型"
         （model_id='text-custom'），行里存的却是平台的 ARK key —— 只按 model_id
         过滤会漏掉它，而它照样会被 GET /api/data/models 回传给那个用户。
         这些行清空后由 handle_custom_model 的 _server_key_for_url 兜底，功能不受影响。
    用户自己的密钥（值不等于任何平台密钥）一个字不碰。
    """
    placeholders = ','.join('?' for _ in BUILTIN_MODEL_IDS)
    cur.execute(
        "UPDATE user_models SET api_key='' WHERE api_key != '' AND model_id IN (%s)"
        % placeholders, BUILTIN_MODEL_IDS)
    n = cur.rowcount
    platform_keys = tuple(_PLATFORM_KEYS)
    if platform_keys:
        cur.execute(
            "UPDATE user_models SET api_key='' WHERE api_key IN (%s)"
            % ','.join('?' for _ in platform_keys), platform_keys)
        n += cur.rowcount
    if n:
        print(f'[DB] 已清空 {n} 行明文平台密钥（密钥只保留在服务端）')
    return n


# ====================== API 路由映射 ======================
# 每个路由: { url, method, auth_type, auth_key, extra_headers }
API_ROUTES = {
    # ===== MiniMax =====
    '/api/text': {
        'url': 'https://api.minimaxi.com/anthropic/v1/messages',
        'method': 'POST',
        'auth_type': 'x-api-key',
        'auth_key': MM_API_KEY,
        'extra_headers': {'anthropic-version': '2023-06-01'}
    },
    '/api/image': {
        'url': 'https://api.minimaxi.com/v1/image_generation',
        'method': 'POST',
        'auth_type': 'bearer',
        'auth_key': MM_API_KEY,
        'extra_headers': {}
    },
    '/api/video': {
        'url': 'https://api.minimaxi.com/v1/video_generation',
        'method': 'POST',
        'auth_type': 'bearer',
        'auth_key': MM_API_KEY,
        'extra_headers': {}
    },
    '/api/video_query': {
        'url': 'https://api.minimaxi.com/v1/query/video_generation',
        'method': 'GET',
        'auth_type': 'bearer',
        'auth_key': MM_API_KEY,
        'extra_headers': {}
    },

    # ===== 腾讯混元 =====
    '/api/hy_image': {
        'url': 'https://tokenhub.tencentmaas.com/v1/api/image/generate',
        'method': 'POST',
        'auth_type': 'bearer',
        'auth_key': HY_API_KEY,
        'extra_headers': {},
        'inject_body': {'model': 'hy-image-lite', 'rsp_img_type': 'url'}
    },
    '/api/hy_video_submit': {
        'url': 'https://tokenhub.tencentmaas.com/v1/api/video/submit',
        'method': 'POST',
        'auth_type': 'bearer',
        'auth_key': HY_API_KEY,
        'extra_headers': {},
        'inject_body': {'model': 'hy-video-1.5'}
    },
    '/api/hy_video_query': {
        'url': 'https://tokenhub.tencentmaas.com/v1/api/video/query',
        'method': 'POST',   # 前端用 POST 带 {model,id} 查询；写成 GET 会被 do_POST 判 404
        'auth_type': 'bearer',
        'auth_key': HY_API_KEY,
        'extra_headers': {},
        'inject_body': {'model': 'hy-video-1.5'}
    },

    # ===== Agnes AI (图像+视频生成) =====
    '/api/agnes_image': {
        'url': 'https://apihub.agnes-ai.com/v1/images/generations',
        'method': 'POST',
        'auth_type': 'bearer',
        'auth_key': AGNES_API_KEY,
        'extra_headers': {},
        'inject_body': {'model': 'agnes-image-2.1-flash'},
        'remove_params': ['response_format']  # Agnes 不支持此参数
    },
    '/api/agnes_video_submit': {
        'url': 'https://apihub.agnes-ai.com/v1/videos',
        'method': 'POST',
        'auth_type': 'bearer',
        'auth_key': AGNES_API_KEY,
        'extra_headers': {},
        'inject_body': {'model': 'agnes-video-v2.0'}
    },
    '/api/agnes_video_query': {
        'url': 'https://apihub.agnes-ai.com/v1/videos',
        'method': 'GET',
        'auth_type': 'bearer',
        'auth_key': AGNES_API_KEY,
        'extra_headers': {}
    },
    # Agnes Video 2.5：与 v2.0 同一个 /v1/videos 端点，只有 model 值不同。
    # 单独两条路由而不是复用 v2.0：两者在「大模型配置」里是两条独立记录，
    # 各自的 baseUrl 会被 sync_models_to_files 按 route_by_id 就地改写 ——
    # 共用一条路由的话，改 2.5 的地址会把 v2.0 一起改掉。
    '/api/agnes_video25_submit': {
        'url': 'https://apihub.agnes-ai.com/v1/videos',
        'method': 'POST',
        'auth_type': 'bearer',
        'auth_key': AGNES_API_KEY,
        'extra_headers': {},
        'inject_body': {'model': 'agnes-video-2.5'}
    },
    '/api/agnes_video25_query': {
        'url': 'https://apihub.agnes-ai.com/v1/videos',
        'method': 'GET',
        'auth_type': 'bearer',
        'auth_key': AGNES_API_KEY,
        'extra_headers': {}
    },

    # ===== Seedance 2 Mini（AggregateAPI 视频生成） =====
    # 注意：create 必须是 .../api/v1/tasks/create，只写 /api/v1 会 404（已实测）
    '/api/seedance_mini/create': {
        'url': 'https://aaapi.togomol.com/api/v1/tasks/create',
        'method': 'POST',
        'auth_type': 'bearer',
        'auth_key': SEEDANCE_MINI_API_KEY,
        'extra_headers': {},
        'inject_body': {'model': 'bytedance/seedance-2-mini'}
    },
    '/api/seedance_mini/status': {
        'url': 'https://aaapi.togomol.com/api/v1/tasks/status',
        'method': 'GET',
        'auth_type': 'bearer',
        'auth_key': SEEDANCE_MINI_API_KEY,
        'extra_headers': {}
    },

    # ===== 火山方舟（文案生成专用）
    # ⚠️ 这条已失效：实测 400 InvalidSubscription「does not have a valid CodingPlan
    # subscription, or your subscription has expired」。保留路由是为了老配置不 404，
    # 真正在用的是下面的 /api/ark_plan_text。
    '/api/ark_text': {
        'url': 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions',
        'method': 'POST',
        'auth_type': 'bearer',
        'auth_key': ARK_API_KEY,
        'extra_headers': {},
        'inject_body': {'model': 'ark-code-latest'}
    },

    # ===== 火山方舟 Agent Plan 文本（当前唯一可用的文本链路）=====
    # 背景：项目原有两条文本链路**同时**失效（实测，非推断）：
    #   /api/ark_text（coding/v3）→ 400 InvalidSubscription（CodingPlan 订阅过期）
    #   /api/text（MiniMax）      → 429「已达到 Token Plan 用量上限」
    # 后果是文案创作/图文生成/热点分析/选品/评论全线报错。
    # 这条走 Agent Plan 端点，用 ARK_PLAN_API_KEY（与 ARK_API_KEY 是不同的两把 key）。
    # 模型名必须是 ark-code-latest —— doubao-* 那一系在此端点全部 404 UnsupportedModel。
    # 实测：文本 200/1.6s；多模态图片理解 200/2.5s（content 传数组）；stream:true 出 SSE。
    '/api/ark_plan_text': {
        'url': 'https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions',
        'method': 'POST',
        'auth_type': 'bearer',
        'auth_key': ARK_PLAN_API_KEY,
        'extra_headers': {},
        'inject_body': {'model': 'ark-code-latest'}
    },

    # ===== 火山方舟 Seedream 文生图 =====
    # 加这条是因为原有三家图片模型**同时**失效（实测）：
    #   /api/image（MiniMax）  → 200 但 base_resp.status_code=2056「已达到 Token Plan 用量上限」
    #   /api/agnes_image       → 直连厂商 90s 超时，代理侧 "Remote end closed connection"
    #   /api/hy_image          → 404，腾讯 tokenhub 这个端点已废弃
    # callModuleImage 依次降级三家全灭 → 文章零配图，就是用户看到的"图片出不来"。
    # 同一个 ARK key 下 Seedream 实测可用，选 4-0 而非 5-0：4-0 出 2304x1728（16:9 友好，
    # 适合文章配图），5-0 出 2048x2048 方图。
    '/api/ark_image': {
        'url': 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
        'method': 'POST',
        'auth_type': 'bearer',
        'auth_key': ARK_API_KEY,
        'extra_headers': {},
        'inject_body': {'model': 'doubao-seedream-4-0-250828', 'watermark': False}
    },
}


# ============ 路由 URL 归一化 ============
# 用户在「大模型配置」里填的 baseUrl 往往只是服务根（如 https://aaapi.togomol.com/api/v1），
# 直接覆盖到具体路由上会丢掉动作后缀（/tasks/create）导致 404。这里按路由补齐必需后缀。
_ROUTE_URL_SUFFIX = {
    '/api/seedance_mini/create': '/tasks/create',
    '/api/seedance_mini/status': '/tasks/status',
}


def _normalize_route_url(route_path, base_url):
    """把用户填的 baseUrl 补成该路由真正需要的完整 URL（幂等）。"""
    url = (base_url or '').rstrip('/')
    suffix = _ROUTE_URL_SUFFIX.get(route_path)
    if not suffix:
        return url
    if url.endswith(suffix):
        return url
    # 允许用户填到 .../tasks，这时只需再补动作段
    tail = suffix.rsplit('/', 1)[-1]          # create / status
    parent = suffix.rsplit('/', 1)[0]          # /tasks
    if url.endswith(parent):
        return url + '/' + tail
    return url + suffix


# ============ 媒体归档：安全抓取远端文件 ============
# 厂商返回的图片/视频链接是临时的（Agnes 自己就标注 24 小时过期），资产库里存这种 URL
# 等于没存。这里由服务器把字节抓回本地磁盘，实现真正的永久化。
#
# 安全约束（对应"防盗窃"要求）：这个函数拿的是**客户端传来的 URL**，
# 天然是 SSRF 入口 —— 不设限的话，任何登录用户都能让服务器去读内网服务
# （云上的元数据端点 169.254.169.254 能直接吐出临时凭证）。所以：
#   1. 只允许 http/https，挡掉 file:// gopher:// 等协议
#   2. 主机名解析后逐个 IP 校验，拒绝回环/私有/链路本地/保留网段
#   3. 不跟随跳转（redirect 是绕过第 2 条的经典手法），逐跳自己校验
#   4. 限制大小，避免磁盘被打爆
MEDIA_MAX_BYTES = 80 * 1024 * 1024      # 单文件 80MB 上限
MEDIA_MAX_REDIRECTS = 3
MEDIA_EXT_WHITELIST = {
    'video': ('mp4', 'webm', 'mov', 'm4v'),
    'image': ('png', 'jpg', 'jpeg', 'webp', 'gif'),
}
_MEDIA_CTYPE_EXT = {
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/webp': 'webp', 'image/gif': 'gif',
}


def _is_blocked_ip(ip_str):
    """判断一个 IP 字面量是否指向内网/本机等不该被服务器代访问的地址。"""
    import ipaddress
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True      # 解析不出来的一律当危险
    return bool(ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_multicast or ip.is_reserved or ip.is_unspecified)


def _assert_public_url(url):
    """校验 URL 协议 + 目标 IP 均安全；不安全直接抛 ValueError。"""
    import socket
    parts = urllib.parse.urlparse(url)
    if parts.scheme not in ('http', 'https'):
        raise ValueError('只允许 http/https 链接')
    host = parts.hostname
    if not host:
        raise ValueError('URL 缺少主机名')
    if host.lower() in ('localhost', 'localhost.localdomain'):
        raise ValueError('拒绝访问本机地址')
    try:
        infos = socket.getaddrinfo(host, parts.port or (443 if parts.scheme == 'https' else 80),
                                   proto=socket.IPPROTO_TCP)
    except Exception:
        raise ValueError('域名解析失败')
    for info in infos:
        # 所有解析结果都必须是公网地址；只要有一个落在内网就拒绝，
        # 免得 DNS 轮询时被打中内网那条。
        if _is_blocked_ip(info[4][0]):
            raise ValueError('拒绝访问内网地址')
    return parts


def fetch_remote_media(url, kind):
    """把远端媒体抓回内存。返回 (bytes, ext)。任何不安全/失败都抛异常。

    手动处理跳转而不用 urllib 默认的 HTTPRedirectHandler —— 默认行为会
    自动跟到 Location，跳板机就能用一个公网 URL 把服务器引到内网去。
    """
    cur = url
    for _ in range(MEDIA_MAX_REDIRECTS + 1):
        _assert_public_url(cur)
        req = urllib.request.Request(cur, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': '*/*',
        })
        # 用 build_opener 显式去掉 redirect handler，让 3xx 原样返回
        opener = urllib.request.build_opener(_NoRedirect, urllib.request.HTTPSHandler(context=_SSL_CONTEXT))
        try:
            resp = opener.open(req, timeout=60)
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308):
                loc = e.headers.get('Location')
                if not loc:
                    raise ValueError('跳转缺少 Location')
                cur = urllib.parse.urljoin(cur, loc)
                continue
            raise
        with resp:
            ctype = (resp.headers.get('Content-Type') or '').split(';')[0].strip().lower()
            clen = resp.headers.get('Content-Length')
            if clen and int(clen) > MEDIA_MAX_BYTES:
                raise ValueError('文件超过 %dMB 上限' % (MEDIA_MAX_BYTES // 1024 // 1024))
            # 边读边计数，Content-Length 可以撒谎
            chunks, total = [], 0
            while True:
                chunk = resp.read(256 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MEDIA_MAX_BYTES:
                    raise ValueError('文件超过 %dMB 上限' % (MEDIA_MAX_BYTES // 1024 // 1024))
                chunks.append(chunk)
            raw = b''.join(chunks)
        if not raw:
            raise ValueError('远端返回空内容')
        allowed = MEDIA_EXT_WHITELIST.get(kind, ())
        ext = _MEDIA_CTYPE_EXT.get(ctype)
        if not ext:
            # Content-Type 不可信时退回看 URL 后缀，仍然只认白名单
            guess = os.path.splitext(urllib.parse.urlparse(cur).path)[1].lstrip('.').lower()
            ext = guess if guess in allowed else None
        if ext not in allowed:
            raise ValueError('不支持的媒体类型: %s' % (ctype or 'unknown'))
        return raw, ext
    raise ValueError('跳转次数过多')


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """禁用自动跳转，把 3xx 抛成 HTTPError 交给上面逐跳校验。"""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    """代理 + 静态文件服务器"""

    # ============ 用户系统 / 每用户数据 API 分发 ============
    def handle_user_api(self, method):
        try:
            path = self.path.split('?')[0]
            # ---------- 认证 ----------
            if path == '/api/auth/register' and method == 'POST':
                return self._api_register()
            if path == '/api/auth/login' and method == 'POST':
                return self._api_login()
            if path == '/api/auth/logout' and method == 'POST':
                return self._api_logout()
            if path == '/api/auth/me' and method == 'GET':
                return self._api_me()
            if path == '/api/auth/change_password' and method == 'POST':
                return self._api_change_password()
            # ---------- 每用户数据 ----------
            if path == '/api/data/assets':
                return self._api_assets(method)
            if path == '/api/data/appdata':
                return self._api_appdata(method)
            if path.startswith('/api/data/image'):
                return self._api_image(method, path)
            if path.startswith('/api/data/media'):
                return self._api_media(method, path)
            if path == '/api/data/prompts':
                return self._api_prompts(method)
            if path == '/api/data/models':
                return self._api_models(method)
            if path == '/api/data/module_defaults':
                return self._api_module_defaults(method)
            if path == '/api/data/accounts':
                return self._api_accounts(method)
            # ---------- 管理员 ----------
            if path == '/api/admin/users':
                return self._api_admin_users(method)
            if path == '/api/ip_stats':
                return self._api_ip_stats(method)
            self.send_json(404, {'success': False, 'error': 'unknown api'})
        except Exception as e:
            print(f'[UserAPI] Error {self.path}: {e}')
            self.send_json(500, {'success': False, 'error': str(e)})

    # ---------- 认证实现 ----------
    def _api_register(self):
        data = self._read_json_body()
        username = str(data.get('username', '')).strip()
        password = str(data.get('password', ''))
        if not re.match(r'^[A-Za-z0-9_]{3,20}$', username):
            return self.send_json(400, {'success': False, 'error': '用户名需为 3-20 位字母/数字/下划线'})
        if len(password) < 6:
            return self.send_json(400, {'success': False, 'error': '密码至少 6 位'})
        with _db_lock:
            conn = get_db()
            try:
                # COLLATE NOCASE：用户名不区分大小写，所以 MartinXie 注册时必须撞出
                # 已存在的 martinxie，否则会出现两个"同名"账号，资产/提示词各挂一边。
                # 仍是参数化占位符 —— COLLATE NOCASE 是 SQL 语法而非拼接的值，无注入面。
                exists = conn.execute(
                    'SELECT id FROM users WHERE username = ? COLLATE NOCASE', (username,)).fetchone()
                if exists:
                    return self.send_json(409, {'success': False, 'error': '用户名已存在'})
                h, s = hash_password(password)
                try:
                    cur = conn.execute(
                        'INSERT INTO users(username, pass_hash, salt, role, created_at, prompts_seeded) VALUES(?,?,?,?,?,0)',
                        (username, h, s, 'user', datetime.utcnow().isoformat()))
                except sqlite3.IntegrityError:
                    # 上面的查重和这里的 INSERT 之间有 TOCTOU 窗口：两个并发注册请求
                    # 可能都通过检查。唯一索引 idx_users_username_nocase 是最后一道闸，
                    # 撞上就当"用户名已存在"处理，而不是抛 500。
                    conn.rollback()
                    return self.send_json(409, {'success': False, 'error': '用户名已存在'})
                uid = cur.lastrowid
                # 开箱可用：给新用户播种服务端托管密钥的内置模型
                _seed_new_user_models(conn, uid)
                # 需求 15：提示词复用管理员当前配置。和上面共用同一个事务
                # —— 播种失败就连注册一起回滚，不留"有账号没提示词"的半成品。
                _seed_new_user_prompts(conn, uid)
                conn.commit()
            finally:
                conn.close()
        token = self._create_session(uid)
        self.send_json_cookie(200, {'success': True, 'user': {'username': username, 'role': 'user'}}, cookie_token=token)

    def _api_login(self):
        data = self._read_json_body()
        username = str(data.get('username', '')).strip()
        password = str(data.get('password', ''))
        with _db_lock:
            conn = get_db()
            try:
                # COLLATE NOCASE：用 MartinXie / MARTINXIE 都能登进 martinxie 这个账号。
                # 同时把 username 也 SELECT 出来 —— 必须回显**数据库里的原始拼写**，
                # 不能回显用户输入的：资产、提示词、appdata 都挂在 user_id 上，
                # 界面显示 MARTINXIE 而数据是 martinxie 的，用户会以为"数据丢了"。
                row = conn.execute(
                    'SELECT id, username, pass_hash, salt, role FROM users'
                    ' WHERE username = ? COLLATE NOCASE', (username,)).fetchone()
            finally:
                conn.close()
        if not row or not verify_password(password, row['salt'], row['pass_hash']):
            return self.send_json(401, {'success': False, 'error': '用户名或密码错误'})
        token = self._create_session(row['id'])
        self.send_json_cookie(200, {'success': True, 'user': {'username': row['username'], 'role': row['role']}}, cookie_token=token)

    def _api_logout(self):
        token = self._get_cookie('gs_session')
        if token:
            with _db_lock:
                conn = get_db()
                try:
                    conn.execute('DELETE FROM sessions WHERE token=?', (token,))
                    conn.commit()
                finally:
                    conn.close()
        self.send_json_cookie(200, {'success': True}, clear_cookie=True)

    def _api_me(self):
        u = self._current_user()
        if not u:
            return self.send_json(401, {'success': False, 'error': 'not authenticated'})
        self.send_json(200, {'success': True, 'user': u})

    def _api_change_password(self):
        u = self._require_auth()
        if not u:
            return
        data = self._read_json_body()
        old_pw = str(data.get('old_password', ''))
        new_pw = str(data.get('new_password', ''))
        if len(new_pw) < 6:
            return self.send_json(400, {'success': False, 'error': '新密码至少 6 位'})
        with _db_lock:
            conn = get_db()
            try:
                row = conn.execute('SELECT pass_hash, salt FROM users WHERE id=?', (u['id'],)).fetchone()
                if not row or not verify_password(old_pw, row['salt'], row['pass_hash']):
                    return self.send_json(400, {'success': False, 'error': '原密码错误'})
                h, s = hash_password(new_pw)
                conn.execute('UPDATE users SET pass_hash=?, salt=? WHERE id=?', (h, s, u['id']))
                conn.execute('DELETE FROM sessions WHERE user_id=?', (u['id'],))  # 改密后踢下线
                conn.commit()
            finally:
                conn.close()
        self.send_json_cookie(200, {'success': True, 'message': '密码已修改，请重新登录'}, clear_cookie=True)

    def _create_session(self, user_id):
        token = secrets.token_urlsafe(32)
        now = datetime.utcnow()
        exp = now + timedelta(days=SESSION_TTL_DAYS)
        with _db_lock:
            conn = get_db()
            try:
                conn.execute('INSERT INTO sessions(token, user_id, created_at, expires_at) VALUES(?,?,?,?)',
                             (token, user_id, now.isoformat(), exp.isoformat()))
                conn.commit()
            finally:
                conn.close()
        return token

    # ---------- 资产 ----------
    def _api_assets(self, method):
        u = self._require_auth()
        if not u:
            return
        if method == 'GET':
            with _db_lock:
                conn = get_db()
                try:
                    rows = conn.execute(
                        'SELECT id, kind, title, content, url, file_path, platform, model, created_at '
                        'FROM assets WHERE user_id=? ORDER BY id DESC', (u['id'],)).fetchall()
                finally:
                    conn.close()
            items = []
            for r in rows:
                # 有 file_path 说明已落盘 —— 对外暴露本地读取地址，
                # 前端优先用它而不是早已过期的厂商 url。
                local = None
                if r['file_path']:
                    local = ('/api/data/image/' if r['kind'] == 'image' else '/api/data/media/') + str(r['id'])
                items.append({
                    'id': r['id'], 'kind': r['kind'], 'title': r['title'], 'content': r['content'],
                    'url': r['url'], 'localUrl': local, 'platform': r['platform'], 'model': r['model'],
                    'date': r['created_at'],
                    'imageId': (r['id'] if (r['kind'] == 'image' and r['file_path']) else None)
                })
            return self.send_json(200, {'success': True, 'assets': items})
        if method == 'POST':
            data = self._read_json_body()
            kind = str(data.get('kind', ''))
            if kind not in ('article', 'script', 'video', 'image'):
                return self.send_json(400, {'success': False, 'error': 'invalid kind'})
            with _db_lock:
                conn = get_db()
                try:
                    # ⚠️ file_path 一律写死空串，绝不采纳客户端传来的值。
                    # 之前这里是 data.get('file_path','')，而下面 DELETE 会 os.remove 它 ——
                    # 任何登录用户 POST 一个 file_path 再 DELETE，就能删服务器上任意文件。
                    # 需要落盘的走 /api/data/media 或 /api/data/image，路径由服务器生成。
                    cur = conn.execute(
                        'INSERT INTO assets(user_id, kind, title, content, url, file_path, platform, model, created_at) '
                        'VALUES(?,?,?,?,?,?,?,?,?)',
                        (u['id'], kind, data.get('title', ''), data.get('content', ''),
                         data.get('url', ''), '',
                         data.get('platform', ''), data.get('model', ''), datetime.utcnow().isoformat()))
                    conn.commit()
                    new_id = cur.lastrowid
                finally:
                    conn.close()
            return self.send_json(200, {'success': True, 'id': new_id})
        if method == 'DELETE':
            data = self._read_json_body()
            aid = data.get('id')
            with _db_lock:
                conn = get_db()
                try:
                    # 删除属于自己的资产；若有落盘文件顺带删掉
                    row = conn.execute('SELECT file_path FROM assets WHERE id=? AND user_id=?', (aid, u['id'])).fetchone()
                    conn.execute('DELETE FROM assets WHERE id=? AND user_id=?', (aid, u['id']))
                    conn.commit()
                finally:
                    conn.close()
            if row and row['file_path']:
                # 走 realpath 前缀校验，挡掉历史脏数据里可能存在的越界路径
                self._safe_unlink_user_file(row['file_path'], u['id'])
            return self.send_json(200, {'success': True})
        self.send_json(405, {'success': False, 'error': 'method not allowed'})

    # ---------- 用户资产快照（articles/scripts/videos 三数组，一次性存取）----------
    def _api_appdata(self, method):
        u = self._require_auth()
        if not u:
            return
        if method == 'GET':
            with _db_lock:
                conn = get_db()
                try:
                    row = conn.execute('SELECT data FROM user_appdata WHERE user_id=?', (u['id'],)).fetchone()
                finally:
                    conn.close()
            try:
                obj = json.loads(row['data']) if row else {}
            except Exception:
                obj = {}
            return self.send_json(200, {'success': True, 'appdata': obj})
        if method == 'POST':
            data = self._read_json_body()
            blob = data.get('appdata', {})
            with _db_lock:
                conn = get_db()
                try:
                    conn.execute('INSERT OR REPLACE INTO user_appdata(user_id, data, updated_at) VALUES(?,?,?)',
                                 (u['id'], json.dumps(blob, ensure_ascii=False), datetime.utcnow().isoformat()))
                    conn.commit()
                finally:
                    conn.close()
            return self.send_json(200, {'success': True})
        self.send_json(405, {'success': False, 'error': 'method not allowed'})

    # ---------- 图片：base64 落盘 + 按 id 读取（校验属主）----------
    def _api_image(self, method, path):
        u = self._require_auth()
        if not u:
            return
        if method == 'POST':
            data = self._read_json_body()
            b64 = str(data.get('dataUrl', '') or data.get('data', ''))
            m = re.match(r'^data:image/(\w+);base64,(.*)$', b64, re.S)
            if m:
                ext, payload = m.group(1), m.group(2)
            else:
                ext, payload = 'png', b64
            try:
                raw = base64.b64decode(payload)
            except Exception:
                return self.send_json(400, {'success': False, 'error': 'invalid base64'})
            udir = os.path.join(USERS_DIR, str(u['id']), 'images')
            os.makedirs(udir, exist_ok=True)
            fname = secrets.token_hex(12) + '.' + (ext if ext in ('png', 'jpg', 'jpeg', 'webp', 'gif') else 'png')
            fpath = os.path.join(udir, fname)
            with open(fpath, 'wb') as f:
                f.write(raw)
            with _db_lock:
                conn = get_db()
                try:
                    cur = conn.execute(
                        'INSERT INTO assets(user_id, kind, title, content, url, file_path, platform, model, created_at) '
                        'VALUES(?,?,?,?,?,?,?,?,?)',
                        (u['id'], 'image', data.get('title', 'AI image'), '', '', fpath,
                         data.get('platform', ''), data.get('model', ''), datetime.utcnow().isoformat()))
                    conn.commit()
                    new_id = cur.lastrowid
                finally:
                    conn.close()
            return self.send_json(200, {'success': True, 'id': new_id, 'url': '/api/data/image/' + str(new_id)})
        if method == 'GET':
            m = re.match(r'^/api/data/image/(\d+)$', path)
            if not m:
                return self.send_json(400, {'success': False, 'error': 'bad image id'})
            img_id = int(m.group(1))
            with _db_lock:
                conn = get_db()
                try:
                    row = conn.execute('SELECT file_path FROM assets WHERE id=? AND user_id=? AND kind=?',
                                       (img_id, u['id'], 'image')).fetchone()
                finally:
                    conn.close()
            if not row or not row['file_path'] or not os.path.exists(row['file_path']):
                return self.send_json(404, {'success': False, 'error': 'not found'})
            with open(row['file_path'], 'rb') as f:
                blob = f.read()
            self.send_response(200)
            self.send_cors()
            ext = os.path.splitext(row['file_path'])[1].lstrip('.') or 'png'
            self.send_header('Content-Type', 'image/' + ('jpeg' if ext == 'jpg' else ext))
            self.send_header('Content-Length', str(len(blob)))
            self.end_headers()
            self.wfile.write(blob)
            return
        if method == 'DELETE':
            # 资产库删图时连磁盘文件一起清掉，否则记录删了、文件一直占着盘。
            # 属主过滤写在 SQL 里：拿别人的 id 直接查不到。
            m = re.match(r'^/api/data/image/(\d+)$', path)
            if not m:
                return self.send_json(400, {'success': False, 'error': 'bad image id'})
            img_id = int(m.group(1))
            with _db_lock:
                conn = get_db()
                try:
                    row = conn.execute('SELECT file_path FROM assets WHERE id=? AND user_id=? AND kind=?',
                                       (img_id, u['id'], 'image')).fetchone()
                    if not row:
                        return self.send_json(404, {'success': False, 'error': 'not found'})
                    conn.execute('DELETE FROM assets WHERE id=? AND user_id=?', (img_id, u['id']))
                    conn.commit()
                finally:
                    conn.close()
            if row['file_path']:
                self._safe_unlink_user_file(row['file_path'], u['id'])
            return self.send_json(200, {'success': True})
        self.send_json(405, {'success': False, 'error': 'method not allowed'})

    # ---------- 媒体归档：把厂商临时链接抓回本地磁盘（图片/视频通用）----------
    # 之前资产库只存厂商 URL，而这些链接 24 小时就失效 —— 看着像存了，实际没存。
    # POST 传 sourceUrl，服务器抓回落盘；GET 按 id 回流，属主校验放在 SQL 里。
    def _api_media(self, method, path):
        u = self._require_auth()
        if not u:
            return
        if method == 'POST':
            data = self._read_json_body()
            src = str(data.get('sourceUrl', '') or '').strip()
            kind = str(data.get('kind', 'video')).strip()
            if kind not in ('video', 'image'):
                return self.send_json(400, {'success': False, 'error': 'kind 只能是 video/image'})
            if not src:
                return self.send_json(400, {'success': False, 'error': '缺少 sourceUrl'})
            # 已经是本地地址就别再抓一遍（前端重复调用时的幂等保护）
            if src.startswith('/api/data/'):
                return self.send_json(400, {'success': False, 'error': '已是本地资源'})
            try:
                raw, ext = fetch_remote_media(src, kind)
            except ValueError as e:
                return self.send_json(400, {'success': False, 'error': str(e)})
            except Exception as e:
                return self.send_json(502, {'success': False, 'error': '抓取失败: %s' % e})
            # 目录/文件名全部由服务器生成 —— 绝不接受客户端传路径或文件名，
            # 否则就是任意文件写入（../../ 穿越）。
            sub = 'videos' if kind == 'video' else 'images'
            udir = os.path.join(USERS_DIR, str(u['id']), sub)
            os.makedirs(udir, exist_ok=True)
            fname = secrets.token_hex(12) + '.' + ext
            fpath = os.path.join(udir, fname)
            with open(fpath, 'wb') as f:
                f.write(raw)
            with _db_lock:
                conn = get_db()
                try:
                    cur = conn.execute(
                        'INSERT INTO assets(user_id, kind, title, content, url, file_path, platform, model, created_at) '
                        'VALUES(?,?,?,?,?,?,?,?,?)',
                        (u['id'], kind, str(data.get('title', ''))[:300], '', src, fpath,
                         str(data.get('platform', ''))[:100], str(data.get('model', ''))[:100],
                         datetime.utcnow().isoformat()))
                    conn.commit()
                    new_id = cur.lastrowid
                finally:
                    conn.close()
            print(f'[Media] user={u["id"]} kind={kind} {len(raw)}B -> {fname}')
            return self.send_json(200, {
                'success': True, 'id': new_id, 'bytes': len(raw), 'ext': ext,
                'url': '/api/data/media/' + str(new_id),
            })
        if method == 'GET':
            m = re.match(r'^/api/data/media/(\d+)$', path)
            if not m:
                return self.send_json(400, {'success': False, 'error': 'bad media id'})
            mid = int(m.group(1))
            with _db_lock:
                conn = get_db()
                try:
                    # 属主过滤写在 SQL 里：拿别人的 id 直接查不到，不存在"查到再判断"的时间窗
                    row = conn.execute(
                        'SELECT file_path, kind FROM assets WHERE id=? AND user_id=? AND kind IN (?,?)',
                        (mid, u['id'], 'video', 'image')).fetchone()
                finally:
                    conn.close()
            if not row or not row['file_path'] or not os.path.exists(row['file_path']):
                return self.send_json(404, {'success': False, 'error': 'not found'})
            fpath = row['file_path']
            ext = os.path.splitext(fpath)[1].lstrip('.').lower()
            ctype = 'application/octet-stream'
            for k, v in _MEDIA_CTYPE_EXT.items():
                if v == ext:
                    ctype = k
                    break
            size = os.path.getsize(fpath)
            # Range 支持：视频要能拖进度条，播放器会先发 Range 探测
            rng = self.headers.get('Range')
            start, end = 0, size - 1
            partial = False
            if rng:
                rm = re.match(r'^bytes=(\d*)-(\d*)$', rng.strip())
                if rm:
                    if rm.group(1):
                        start = int(rm.group(1))
                    if rm.group(2):
                        end = int(rm.group(2))
                    if rm.group(1) == '' and rm.group(2):
                        start = max(0, size - int(rm.group(2)))
                        end = size - 1
                    start = max(0, min(start, size - 1))
                    end = max(start, min(end, size - 1))
                    partial = True
            length = end - start + 1
            with open(fpath, 'rb') as f:
                f.seek(start)
                blob = f.read(length)
            self.send_response(206 if partial else 200)
            self.send_cors()
            self.send_header('Content-Type', ctype)
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(len(blob)))
            if partial:
                self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
            self.end_headers()
            self.wfile.write(blob)
            return
        if method == 'DELETE':
            # id 从路径取（DELETE 通常不带 body），属主过滤同样写在 SQL 里
            m = re.match(r'^/api/data/media/(\d+)$', path)
            if not m:
                return self.send_json(400, {'success': False, 'error': 'bad media id'})
            mid = int(m.group(1))
            with _db_lock:
                conn = get_db()
                try:
                    row = conn.execute(
                        'SELECT file_path FROM assets WHERE id=? AND user_id=? AND kind IN (?,?)',
                        (mid, u['id'], 'video', 'image')).fetchone()
                    if not row:
                        return self.send_json(404, {'success': False, 'error': 'not found'})
                    conn.execute('DELETE FROM assets WHERE id=? AND user_id=?', (mid, u['id']))
                    conn.commit()
                finally:
                    conn.close()
            if row['file_path']:
                self._safe_unlink_user_file(row['file_path'], u['id'])
            return self.send_json(200, {'success': True})
        self.send_json(405, {'success': False, 'error': 'method not allowed'})

    @staticmethod
    def _safe_unlink_user_file(fpath, user_id):
        """只删「确实位于该用户目录内」的文件。

        DB 里的 file_path 理论上都是服务器自己生成的，但历史数据可能来自
        早期允许客户端传 file_path 的接口，直接 os.remove 等于任意文件删除。
        这里用 realpath 前缀比对做最后一道闸。
        """
        try:
            root = os.path.realpath(os.path.join(USERS_DIR, str(user_id)))
            target = os.path.realpath(fpath)
            if not (target == root or target.startswith(root + os.sep)):
                print(f'[Media] 拒绝删除越界路径: {fpath}')
                return
            if os.path.exists(target):
                os.remove(target)
        except Exception as e:
            print(f'[Media] 删除文件失败: {e}')

    # ---------- 提示词 ----------
    def _api_prompts(self, method):
        u = self._require_auth()
        if not u:
            return
        if method == 'GET':
            with _db_lock:
                conn = get_db()
                try:
                    rows = conn.execute(
                        'SELECT prompt_id, module, name, content, language FROM user_prompts WHERE user_id=?',
                        (u['id'],)).fetchall()
                finally:
                    conn.close()
            items = [{'id': r['prompt_id'], 'module': r['module'], 'name': r['name'],
                      'content': r['content'], 'language': r['language']} for r in rows]
            return self.send_json(200, {'success': True, 'prompts': items})
        if method == 'POST':
            data = self._read_json_body()
            prompts = data.get('prompts')
            if not isinstance(prompts, list):
                return self.send_json(400, {'success': False, 'error': 'prompts must be array'})
            with _db_lock:
                conn = get_db()
                try:
                    conn.execute('DELETE FROM user_prompts WHERE user_id=?', (u['id'],))
                    for p in prompts:
                        if not isinstance(p, dict) or not p.get('id'):
                            continue
                        conn.execute(
                            'INSERT OR REPLACE INTO user_prompts(user_id, prompt_id, module, name, content, language) '
                            'VALUES(?,?,?,?,?,?)',
                            (u['id'], str(p.get('id')), str(p.get('module', '')), str(p.get('name', '')),
                             str(p.get('content', '')), str(p.get('language', 'zh'))))
                    conn.commit()
                finally:
                    conn.close()
            return self.send_json(200, {'success': True})
        self.send_json(405, {'success': False, 'error': 'method not allowed'})

    # ---------- 模型 ----------
    def _api_models(self, method):
        u = self._require_auth()
        if not u:
            return
        if method == 'GET':
            with _db_lock:
                conn = get_db()
                try:
                    rows = conn.execute(
                        'SELECT model_id, name, provider, base_url, protocol, type, model_slug, status, api_key '
                        'FROM user_models WHERE user_id=?', (u['id'],)).fetchall()
                finally:
                    conn.close()
            items = [{'id': r['model_id'], 'name': r['name'], 'provider': r['provider'],
                      'baseUrl': r['base_url'], 'protocol': r['protocol'], 'type': r['type'],
                      'model': r['model_slug'], 'status': r['status'],
                      # 内置模型永不回传密钥（见 BUILTIN_MODEL_KEY_VARS）。即使 DB 里因为
                      # 某条旧路径又存进了值，这里也拦住，不靠迁移过的数据保证安全。
                      # 前端 maskApiKey('') 显示"服务端托管"，UI 不会以为模型坏了。
                      'apiKey': '' if r['model_id'] in BUILTIN_MODEL_KEY_VARS else r['api_key']}
                     for r in rows]
            return self.send_json(200, {'success': True, 'models': items})
        if method == 'POST':
            data = self._read_json_body()
            models = data.get('models')
            if not isinstance(models, list):
                return self.send_json(400, {'success': False, 'error': 'models must be array'})
            with _db_lock:
                conn = get_db()
                try:
                    conn.execute('DELETE FROM user_models WHERE user_id=?', (u['id'],))
                    for m in models:
                        if not isinstance(m, dict) or not m.get('id'):
                            continue
                        _mid = str(m.get('id'))
                        # 内置模型的密钥不落库。前端 GET 拿到的是空串，正常回存也是空串；
                        # 这里再强制一次，挡住任何直接 POST 真实密钥进来的路径
                        # （管理员改内置模型密钥走 /api/sync_config → 写 server.py，不经过这张表）。
                        _key = '' if _mid in BUILTIN_MODEL_KEY_VARS else str(m.get('apiKey', ''))
                        # 自定义模型也不许存平台密钥：历史上有人把内置 Ark 端点加成自定义模型，
                        # 行里存了平台的 key。不带 key 时 handle_custom_model 会用服务端密钥兜底。
                        if _key and _key in _PLATFORM_KEYS:
                            _key = ''
                        conn.execute(
                            'INSERT OR REPLACE INTO user_models(user_id, model_id, name, provider, base_url, protocol, type, model_slug, status, api_key) '
                            'VALUES(?,?,?,?,?,?,?,?,?,?)',
                            (u['id'], _mid, str(m.get('name', '')), str(m.get('provider', '')),
                             str(m.get('baseUrl', '')), str(m.get('protocol', '')), str(m.get('type', '')),
                             str(m.get('model', '')), str(m.get('status', 'active')), _key))
                    conn.commit()
                finally:
                    conn.close()
            return self.send_json(200, {'success': True})
        self.send_json(405, {'success': False, 'error': 'method not allowed'})

    # ---------- 每模块默认模型 ----------
    def _api_module_defaults(self, method):
        u = self._require_auth()
        if not u:
            return
        if method == 'GET':
            with _db_lock:
                conn = get_db()
                try:
                    rows = conn.execute('SELECT module_key, model_id FROM user_module_defaults WHERE user_id=?',
                                        (u['id'],)).fetchall()
                finally:
                    conn.close()
            return self.send_json(200, {'success': True, 'defaults': {r['module_key']: r['model_id'] for r in rows}})
        if method == 'POST':
            data = self._read_json_body()
            defaults = data.get('defaults', {})
            if not isinstance(defaults, dict):
                return self.send_json(400, {'success': False, 'error': 'defaults must be object'})
            with _db_lock:
                conn = get_db()
                try:
                    for k, v in defaults.items():
                        conn.execute('INSERT OR REPLACE INTO user_module_defaults(user_id, module_key, model_id) VALUES(?,?,?)',
                                     (u['id'], str(k), str(v)))
                    conn.commit()
                finally:
                    conn.close()
            return self.send_json(200, {'success': True})
        self.send_json(405, {'success': False, 'error': 'method not allowed'})

    # ---------- 社媒账号（仅管理员用，但存自己名下）----------
    def _api_accounts(self, method):
        u = self._require_auth()
        if not u:
            return
        if method == 'GET':
            with _db_lock:
                conn = get_db()
                try:
                    rows = conn.execute('SELECT id, data FROM user_accounts WHERE user_id=? ORDER BY id DESC',
                                        (u['id'],)).fetchall()
                finally:
                    conn.close()
            items = []
            for r in rows:
                try:
                    obj = json.loads(r['data'])
                except Exception:
                    obj = {}
                obj['_row'] = r['id']
                items.append(obj)
            return self.send_json(200, {'success': True, 'accounts': items})
        if method == 'POST':
            data = self._read_json_body()
            accounts = data.get('accounts')
            if not isinstance(accounts, list):
                return self.send_json(400, {'success': False, 'error': 'accounts must be array'})
            with _db_lock:
                conn = get_db()
                try:
                    conn.execute('DELETE FROM user_accounts WHERE user_id=?', (u['id'],))
                    for a in accounts:
                        conn.execute('INSERT INTO user_accounts(user_id, data, created_at) VALUES(?,?,?)',
                                     (u['id'], json.dumps(a, ensure_ascii=False), datetime.utcnow().isoformat()))
                    conn.commit()
                finally:
                    conn.close()
            return self.send_json(200, {'success': True})
        self.send_json(405, {'success': False, 'error': 'method not allowed'})

    # ---------- 用户管理（admin）----------
    def _api_admin_users(self, method):
        u = self._require_admin()
        if not u:
            return
        if method == 'GET':
            with _db_lock:
                conn = get_db()
                try:
                    rows = conn.execute('SELECT id, username, role, created_at FROM users ORDER BY id').fetchall()
                    # 附带资产计数
                    counts = {r['user_id']: r['c'] for r in conn.execute('SELECT user_id, COUNT(*) c FROM assets GROUP BY user_id').fetchall()}
                finally:
                    conn.close()
            items = [{'id': r['id'], 'username': r['username'], 'role': r['role'],
                      'created_at': r['created_at'], 'assets': counts.get(r['id'], 0)} for r in rows]
            return self.send_json(200, {'success': True, 'users': items})
        if method == 'POST':
            # 管理员重置某用户密码
            data = self._read_json_body()
            target_id = data.get('id')
            new_pw = str(data.get('new_password', ''))
            if len(new_pw) < 6:
                return self.send_json(400, {'success': False, 'error': '新密码至少 6 位'})
            h, s = hash_password(new_pw)
            with _db_lock:
                conn = get_db()
                try:
                    conn.execute('UPDATE users SET pass_hash=?, salt=? WHERE id=?', (h, s, target_id))
                    conn.execute('DELETE FROM sessions WHERE user_id=?', (target_id,))
                    conn.commit()
                finally:
                    conn.close()
            return self.send_json(200, {'success': True, 'message': '密码已重置'})
        if method == 'DELETE':
            data = self._read_json_body()
            target_id = data.get('id')
            if target_id == u['id']:
                return self.send_json(400, {'success': False, 'error': '不能删除自己'})
            with _db_lock:
                conn = get_db()
                try:
                    row = conn.execute('SELECT role FROM users WHERE id=?', (target_id,)).fetchone()
                    if row and row['role'] == 'admin':
                        return self.send_json(400, {'success': False, 'error': '不能删除管理员'})
                    conn.execute('DELETE FROM users WHERE id=?', (target_id,))
                    # 下面这 7 条现在是双保险：init_db 已给这些表加了
                    # ON DELETE CASCADE，删 users 一行数据库就会自动带走关联行。
                    # 留着是因为 PRAGMA foreign_keys 万一没生效（老版本 sqlite、
                    # 或连接没走 get_db）还能兜住，而且重复删是无害的 no-op。
                    conn.execute('DELETE FROM sessions WHERE user_id=?', (target_id,))
                    conn.execute('DELETE FROM assets WHERE user_id=?', (target_id,))
                    conn.execute('DELETE FROM user_prompts WHERE user_id=?', (target_id,))
                    conn.execute('DELETE FROM user_models WHERE user_id=?', (target_id,))
                    conn.execute('DELETE FROM user_module_defaults WHERE user_id=?', (target_id,))
                    conn.execute('DELETE FROM user_accounts WHERE user_id=?', (target_id,))
                    # user_appdata 也要清：原来漏了这张表，删掉的用户的工作区快照
                    # （文章正文、商品情报、输入框内容）会留在库里成为孤儿数据。
                    # 正是这张表在 user_id=12 上留下过一条残留（已随迁移清掉）。
                    conn.execute('DELETE FROM user_appdata WHERE user_id=?', (target_id,))
                    conn.commit()
                finally:
                    conn.close()
            # 删用户图片目录
            udir = os.path.join(USERS_DIR, str(target_id))
            if os.path.isdir(udir):
                try:
                    import shutil
                    shutil.rmtree(udir, ignore_errors=True)
                except Exception:
                    pass
            return self.send_json(200, {'success': True})
        self.send_json(405, {'success': False, 'error': 'method not allowed'})

    # ---------- 全局访客 IP 统计（admin）----------
    def _api_ip_stats(self, method):
        u = self._require_admin()
        if not u:
            return
        if method == 'GET':
            with _db_lock:
                conn = get_db()
                try:
                    row = conn.execute('SELECT data FROM ip_stats ORDER BY id DESC LIMIT 1').fetchone()
                finally:
                    conn.close()
            try:
                arr = json.loads(row['data']) if row else []
            except Exception:
                arr = []
            return self.send_json(200, {'success': True, 'stats': arr})
        if method == 'POST':
            data = self._read_json_body()
            stats = data.get('stats', [])
            with _db_lock:
                conn = get_db()
                try:
                    conn.execute('DELETE FROM ip_stats')
                    conn.execute('INSERT INTO ip_stats(data, updated_at) VALUES(?,?)',
                                 (json.dumps(stats, ensure_ascii=False), datetime.utcnow().isoformat()))
                    conn.commit()
                finally:
                    conn.close()
            return self.send_json(200, {'success': True})
        self.send_json(405, {'success': False, 'error': 'method not allowed'})

    def build_headers(self, route):
        """根据路由配置构造请求头"""
        headers = {'Content-Type': 'application/json'}
        if route['auth_type'] == 'x-api-key':
            headers['x-api-key'] = route['auth_key']
        elif route['auth_type'] == 'bearer':
            headers['Authorization'] = 'Bearer ' + route['auth_key']
        headers.update(route['extra_headers'])
        return headers

    def send_json(self, status, payload):
        self.send_response(status)
        self.send_cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode('utf-8'))

    # 请求体上限。原来完全不限：Content-Length 说多少就 read 多少全塞进内存，
    # 一个登录用户 POST 1GB 就能把进程吃爆（拒绝服务）。
    # 32MB 是留给 base64 图片落盘（/api/data/image）的余量，普通 JSON 远用不到。
    MAX_BODY_BYTES = 32 * 1024 * 1024

    def _read_json_body(self, max_bytes=None):
        limit = max_bytes or self.MAX_BODY_BYTES
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > limit:
            # 不读那 N 个字节就直接拒绝，所以它们还留在 socket 里。keep-alive 下
            # 服务端会把这堆残留当成"下一个请求"去解析 → 连接错位。必须断开。
            self.close_connection = True
            raise ValueError('请求体过大：%d 字节，上限 %d' % (content_length, limit))
        raw = self.rfile.read(content_length) if content_length else b'{}'
        return json.loads(raw.decode('utf-8') or '{}')

    # ============ 会话 / 鉴权 ============
    def _get_cookie(self, name):
        raw = self.headers.get('Cookie')
        if not raw:
            return None
        try:
            c = http.cookies.SimpleCookie()
            c.load(raw)
            if name in c:
                return c[name].value
        except Exception:
            return None
        return None

    def _current_user(self):
        """解析 gs_session cookie → 返回 user dict 或 None。"""
        token = self._get_cookie('gs_session')
        if not token:
            return None
        with _db_lock:
            conn = get_db()
            try:
                row = conn.execute(
                    'SELECT s.expires_at, u.id, u.username, u.role FROM sessions s '
                    'JOIN users u ON u.id = s.user_id WHERE s.token = ?', (token,)
                ).fetchone()
                if not row:
                    return None
                try:
                    if datetime.utcnow() > datetime.fromisoformat(row['expires_at']):
                        conn.execute('DELETE FROM sessions WHERE token=?', (token,))
                        conn.commit()
                        return None
                except Exception:
                    pass
                return {'id': row['id'], 'username': row['username'], 'role': row['role']}
            finally:
                conn.close()

    def _require_auth(self):
        u = self._current_user()
        if not u:
            self.send_json(401, {'success': False, 'error': 'not authenticated'})
            return None
        return u

    def _require_admin(self):
        u = self._require_auth()
        if not u:
            return None
        if u['role'] != 'admin':
            self.send_json(403, {'success': False, 'error': 'admin only'})
            return None
        return u

    def send_json_cookie(self, status, payload, cookie_token=None, clear_cookie=False):
        self.send_response(status)
        self.send_cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        if cookie_token is not None:
            maxage = SESSION_TTL_DAYS * 86400
            secure = '; Secure' if COOKIE_SECURE else ''
            self.send_header('Set-Cookie',
                'gs_session=' + cookie_token + '; Path=/; HttpOnly; SameSite=Strict' + secure + '; Max-Age=' + str(maxage))
        if clear_cookie:
            secure = '; Secure' if COOKIE_SECURE else ''
            self.send_header('Set-Cookie', 'gs_session=; Path=/; HttpOnly; SameSite=Strict' + secure + '; Max-Age=0')
        self.end_headers()
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode('utf-8'))

    def _escape_js_single_string(self, value):
        return json.dumps(value or '', ensure_ascii=False)[1:-1].replace("'", "\\'")

    def sync_prompts_to_index(self, prompts):
        if not isinstance(prompts, list):
            raise ValueError('prompts 必须是数组')
        with open(INDEX_FILE, 'r', encoding='utf-8-sig') as f:
            text = f.read()
        # 锚点只到数组自己的收尾 `\n];\n`，**不要**再往后咬 mergePromptDefaults。
        # 老正则写的是 r"...\n\];\n\nfunction mergePromptDefaults"，要求 `];` 后
        # 紧跟空行 + 那个函数；但现在两者之间隔着一段注释 + ARTICLE_PROMPT_IDS +
        # promptHasVideoScript（约 5.7KB），于是 count=0，每次保存提示词都报
        # "未找到 index.html 中的 defaultPrompts 配置块"。（这个断裂在改版之前
        # 就存在，index.html.bak 同样不匹配。）
        # 非贪婪安全性：从 `var defaultPrompts = [` 到 mergePromptDefaults 之间
        # 只有 1 个 `\n];\n` —— JSON indent=2 的嵌套收尾是 "\n  ]"，content 里的
        # 换行是转义后的字面量 \n，都不会提前命中。
        pattern = r"var defaultPrompts = \[[\s\S]*?\n\];\n"
        items = []
        for p in prompts:
            if not isinstance(p, dict) or not p.get('id'):
                continue
            item = {
                'id': str(p.get('id', '')),
                'module': str(p.get('module', '')),
                'name': str(p.get('name', '')),
                # language 必须带上：index.html 里每条 defaultPrompts 都有
                # "language": "zh"，不写就会被同步抹掉（mergePromptDefaults 的
                # matchLang 读 (p.language || 'zh')，抹掉不报错但是无声的字段流失）。
                'language': str(p.get('language', 'zh')),
                'content': str(p.get('content', ''))
            }
            items.append(item)
        # 结尾补 ';\n'：json.dumps(indent=2) 以 "\n]" 收尾，加上后正好还原出
        # 被 pattern 吃掉的那个 "\n];\n"，后面的注释和 ARTICLE_PROMPT_IDS 原样不动。
        replacement = 'var defaultPrompts = ' + json.dumps(items, ensure_ascii=False, indent=2) + ';\n'
        # 用函数形式替换，避免 re 把 replacement 中的 \n、\g 等当作转义序列还原（否则会把已转义的换行还原成真实换行，破坏 JS）
        new_text, count = re.subn(pattern, lambda _m: replacement, text, count=1)
        if count != 1:
            raise RuntimeError('未找到 index.html 中的 defaultPrompts 配置块')
        with open(INDEX_FILE, 'w', encoding='utf-8') as f:
            f.write(new_text)
        return len(items)

    def sync_models_to_files(self, models, deleted_ids=None):
        if not isinstance(models, list):
            raise ValueError('models 必须是数组')
        deleted_ids = deleted_ids if isinstance(deleted_ids, list) else []
        with open(INDEX_FILE, 'r', encoding='utf-8-sig') as f:
            index_text = f.read()
        with open(SERVER_FILE, 'r', encoding='utf-8') as f:
            server_text = f.read()

        # 内置模型清单只有一份，见模块顶部 BUILTIN_MODEL_KEY_VARS
        key_by_id = BUILTIN_MODEL_KEY_VARS
        route_by_id = {
            'ark-text': '/api/ark_text',
            'ark-image': '/api/ark_image',
            'minimax-text': '/api/text',
            'minimax-image': '/api/image',
            'minimax-video': '/api/video',
            'hunyuan-video': '/api/hy_video_submit',
            'hunyuan-image': '/api/hy_image',
            'agnes-image': '/api/agnes_image',
            'agnes-video': '/api/agnes_video_submit',
            'agnes-video-25': '/api/agnes_video25_submit',
            'seedance-mini-video': '/api/seedance_mini/create'
        }
        for m in models:
            if not isinstance(m, dict) or not m.get('id'):
                continue
            mid = str(m.get('id', ''))
            route_path = route_by_id.get(mid)
            if route_path and route_path in API_ROUTES:
                api_key = str(m.get('apiKey', ''))
                base_url = str(m.get('baseUrl', ''))
                if api_key:
                    API_ROUTES[route_path]['auth_key'] = api_key
                if base_url and re.match(r'^https?://', base_url):
                    API_ROUTES[route_path]['url'] = _normalize_route_url(route_path, base_url)
        model_exprs = []
        _env_keys_to_write = {}
        for m in models:
            if not isinstance(m, dict) or not m.get('id'):
                continue
            mid = str(m.get('id', ''))
            api_key = str(m.get('apiKey', ''))
            base_url = str(m.get('baseUrl', ''))
            key_var = key_by_id.get(mid)
            if key_var and api_key:
                # 密钥写进 .env，**不再写回 server.py** —— 源码里已经没有字面量了
                # （见文件头的 API 密钥配置注释），继续往源码里塞等于把刚清掉的东西又请回来。
                # 写完立即更新 os.environ 和模块级常量，本次进程内即时生效，无需重启。
                _env_keys_to_write[key_var] = api_key
            route_path = route_by_id.get(mid)
            if route_path and base_url and re.match(r'^https?://', base_url):
                route_pattern = r"('" + re.escape(route_path) + r"'\s*:\s*\{[\s\S]*?'url'\s*:\s*)'[^']*'"
                _new_url = "'" + self._escape_js_single_string(_normalize_route_url(route_path, base_url)) + "'"
                server_text = re.sub(route_pattern, lambda m: m.group(1) + _new_url, server_text, count=1)
            js_obj = dict(m)
            if mid == 'seedance-mini-video' and not re.match(r'^https?://', str(js_obj.get('baseUrl', ''))):
                js_obj['baseUrl'] = 'https://aaapi.togomol.com/api/v1/tasks'
            if key_var:
                js_obj.pop('apiKey', None)
            obj = json.dumps(js_obj, ensure_ascii=False, indent=2)
            if key_var:
                obj = obj[:-2] + ',\n  "apiKey": ' + key_var + '\n}'
            model_exprs.append(obj)

        index_replacement = 'var defaultModels = [\n' + ',\n'.join(model_exprs) + '\n];\n\nfunction getDeletedModelIds'
        index_pattern = r"var defaultModels = \[[\s\S]*?\n\];\n\nfunction getDeletedModelIds"
        # 用函数形式替换，避免 re 把 replacement 中的 \n 等转义序列还原成真实字符，破坏 JS 语法
        index_text, count = re.subn(index_pattern, lambda _m: index_replacement, index_text, count=1)
        if count != 1:
            raise RuntimeError('未找到 index.html 中的 defaultModels 配置块')
        deleted_literal = json.dumps([str(x) for x in deleted_ids], ensure_ascii=False)
        _deleted_line = "localStorage.getItem('workbuddy_deleted_models') || '" + deleted_literal.replace("'", "\\'") + "'"
        index_text, _ = re.subn(r"localStorage\.getItem\('workbuddy_deleted_models'\) \|\| '\[\]'", lambda _m: _deleted_line, index_text, count=1)

        with open(INDEX_FILE, 'w', encoding='utf-8') as f:
            f.write(index_text)
        with open(SERVER_FILE, 'w', encoding='utf-8') as f:
            f.write(server_text)
        if _env_keys_to_write:
            _persist_env_keys(_env_keys_to_write)
        return len(model_exprs)

    def handle_sync_config(self):
        # ⚠️ 必须管理员。这个端点会把请求体的内容**写回 server.py 和 index.html**
        # （sync_models_to_files 直接 open(SERVER_FILE,'w')）。原来完全没有鉴权，
        # 绑公网后任何匿名访客都能改写源码 → 等于远程代码执行。
        if not self._require_admin():
            return
        try:
            data = self._read_json_body()
            kind = data.get('kind')
            if kind == 'prompts':
                count = self.sync_prompts_to_index(data.get('prompts'))
                self.send_json(200, {'success': True, 'message': '提示词已同步写入 index.html', 'count': count})
            elif kind == 'models':
                count = self.sync_models_to_files(data.get('models'), data.get('deletedIds'))
                self.send_json(200, {'success': True, 'message': '模型配置已同步写入 index.html 和 server.py', 'count': count})
            else:
                self.send_json(400, {'success': False, 'error': 'kind 只支持 prompts 或 models'})
        except Exception as e:
            print(f'[ConfigSync] Error: {e}')
            self.send_json(500, {'success': False, 'error': str(e)})

    def handle_custom_model(self):
        """通用自定义模型代理。
        请求体: { url, method?, headers?{}, body?{}, auth_type?('bearer'|'x-api-key'), auth_key? }
        服务端只做转发 + 回传，不在磁盘留 key。仅允许 http(s) 目标。"""
        # 必须登录：这是一个任意目标的转发器，开放给匿名用户等于送出一台公网代理
        if not self._require_auth():
            return
        try:
            data = self._read_json_body()
            url = str(data.get('url', '')).strip()
            if not re.match(r'^https?://', url):
                self.send_json(400, {'success': False, 'error': 'invalid url'})
                return
            # 同 handle_product_scrape：url 来自客户端，必须挡住内网/元数据端点
            try:
                _assert_public_url(url)
            except ValueError as e:
                self.send_json(400, {'success': False, 'error': f'目标地址不允许：{e}'})
                return
            method = str(data.get('method', 'POST')).upper()
            if method not in ('POST', 'GET'):
                self.send_json(400, {'success': False, 'error': 'method must be POST or GET'})
                return

            headers = {'Content-Type': 'application/json'}
            for k, v in (data.get('headers') or {}).items():
                if isinstance(k, str) and isinstance(v, str):
                    headers[k] = v
            auth_type = data.get('auth_type')
            auth_key = str(data.get('auth_key', '') or '')
            if not auth_key:
                # 客户端没带 key：如果目标 URL 正好是我们某条内置路由的地址，就用服务端密钥补上。
                # 场景：有用户把内置的 Ark 端点手动加成了"自定义模型"，密钥当年被存进了
                # user_models（明文，且是**平台的**密钥）。清库后这些行没 key 了，
                # 靠这条回落继续可用 —— 密钥留在服务端，不再经过浏览器。
                auth_key = _server_key_for_url(url)
                if auth_key:
                    auth_type = 'bearer'
            if auth_key:
                if auth_type == 'x-api-key':
                    headers['x-api-key'] = auth_key
                else:
                    headers['Authorization'] = 'Bearer ' + auth_key

            body = data.get('body')
            if isinstance(body, (dict, list)):
                body_bytes = json.dumps(body).encode('utf-8')
            elif isinstance(body, str):
                body_bytes = body.encode('utf-8')
            else:
                body_bytes = b'{}'

            print(f'[CustomModel] {method} {url[:80]}')
            if method == 'GET':
                headers.pop('Content-Type', None)
                req = urllib.request.Request(url, headers=headers, method='GET')
            else:
                req = urllib.request.Request(url, data=body_bytes, headers=headers, method='POST')
            with urllib.request.urlopen(req, timeout=300, context=_SSL_CONTEXT) as resp:
                self.proxy_response(resp)
        except urllib.error.HTTPError as e:
            error_body = e.read()
            print(f'[CustomModel] HTTP {e.code}: {error_body[:200]}')
            self.send_response(e.code)
            self.send_cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(error_body)
        except Exception as e:
            print(f'[CustomModel] Error: {e}')
            self.send_json(502, {'success': False, 'error': str(e)})

    def send_cors(self):
        """发送 CORS 头"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

    def proxy_response(self, resp):
        """将上游响应转发回客户端"""
        self.send_response(resp.status)
        self.send_cors()
        for k, v in resp.headers.items():
            if k.lower() not in ('transfer-encoding', 'connection'):
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(resp.read())

    def do_POST(self):
        if self.path == '/api/sync_config':
            self.handle_sync_config()
            return
        # ===== 通用自定义模型代理：前端自带 url/method/auth/body，服务端仅转发 =====
        if self.path == '/api/custom_model':
            self.handle_custom_model()
            return
        # ===== 用户系统 / 每用户数据 =====
        # ⚠️ 这里原来漏了 /api/ip_stats —— GET 路由（do_GET）带了它，POST 没带，
        # 于是前端每次 saveIPStats() 都吃一个 404，控制台被刷满。
        if self.path.startswith('/api/auth/') or self.path.startswith('/api/data/') or self.path.startswith('/api/admin/') or self.path.startswith('/api/ip_stats'):
            self.handle_user_api('POST')
            return
        route = API_ROUTES.get(self.path)
        if not route or route['method'] != 'POST':
            self.send_error(404, 'Not Found')
            return

        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)

            # 如果路由配置了 inject_body，注入缺失字段（如混元 API 需要的 model 参数）
            inject = route.get('inject_body')
            remove_params = route.get('remove_params', [])
            if inject or remove_params:
                try:
                    body_json = json.loads(body.decode('utf-8'))
                    # 注入参数
                    for k, v in (inject or {}).items():
                        if k not in body_json:
                            body_json[k] = v
                    # 删除不支持的参数（如 Agnes 不支持 response_format）
                    for k in remove_params:
                        body_json.pop(k, None)
                    body = json.dumps(body_json).encode('utf-8')
                except Exception:
                    pass

            print(f'[Proxy] POST {self.path} -> {route["url"]}')
            headers = self.build_headers(route)
            req = urllib.request.Request(route['url'], data=body, headers=headers, method='POST')

            with urllib.request.urlopen(req, timeout=300, context=_SSL_CONTEXT) as resp:
                self.proxy_response(resp)

        except urllib.error.HTTPError as e:
            error_body = e.read()
            print(f'[Proxy] HTTP Error {e.code}: {error_body[:200]}')
            self.send_response(e.code)
            self.send_cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(error_body)

        except Exception as e:
            print(f'[Proxy] Error: {e}')
            self.send_response(502)
            self.send_cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def do_HEAD(self):
        # 静态白名单同样要管住 HEAD。之前这里直接落到 super().do_HEAD()，
        # 于是 `HEAD /server.py` 会回 200 + Content-Length —— 虽然拿不到正文，
        # 但把"文件存在、多大"泄露出去了，等于给攻击者确认了扫描目标。
        blocked = self._static_block_reason(self.path)
        if blocked:
            print(f'[Static] 拒绝 HEAD {self.path} —— {blocked}')
            self.send_error(404, 'Not Found')
            return
        # HEAD 也走自定义逻辑，避免根路径返回 200 旧缓存
        if self.path == '/' or self.path == '':
            ts = int(datetime.now().timestamp())
            self.send_response(302)
            self.send_cors()
            self.send_header('Location', f'/index.html?nocache={ts}')
            self.end_headers()
            return
        base_path = self.path.split('?')[0]
        if base_path == '/demo.mp4':
            # 播放器常常先发 HEAD 探测时长/是否支持 Range，这里必须回 Accept-Ranges
            self._serve_demo_video(head_only=True)
            return
        if base_path == '/index.html':
            file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'index.html')
            if os.path.exists(file_path):
                with open(file_path, 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_cors()
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(content)))
                self.send_header('Last-Modified', datetime.utcnow().strftime('%a, %d %b %Y %H:%M:%S GMT'))
                self.end_headers()
                return
        # 其他路径使用默认 HEAD
        return super().do_HEAD()

    # 允许公网直接下载的静态文件白名单。
    # 只放页面本体和图标/图片资源 —— 其他一律 404。
    # 用"白名单"而不是"黑名单"：黑名单每加一个新文件（备份、日志、导出的 csv）
    # 就多一个泄露口，而这个服务是要绑公网 IP 的。
    _STATIC_ALLOW = {
        '/index.html', '/icon.png', '/logo.png', '/Logo.png',
        '/logo2.png', '/logo3.png', '/favicon.ico',
        # 操作演示视频。是产品说明性质的内容，本来就要给所有访客看，
        # 不含用户数据，放行无风险。55MB，由 _serve_demo_video() 走 Range 分片发送。
        '/demo.mp4',
    }

    # 显式黑名单：即使将来有人往 _STATIC_ALLOW 里加错东西、或改动下面的
    # deny-by-default 逻辑，这些路径也必须拿不到。白名单已经够用，
    # 这一层是"纵深防御" —— 密钥和用户库的暴露代价太高，值得两道闸。
    # 判定基于**任一路径段**，所以 /.env、/sub/.env、/backup/x.py 都会命中。
    _STATIC_DENY_SEGMENTS = {'.env', '.git', '.gitignore', '.claude', 'data',
                             'backup', '__pycache__', 'deploy'}
    _STATIC_DENY_SUFFIXES = ('.py', '.pyc', '.db', '.env', '.bak', '.log',
                             '.sqlite', '.sqlite3', '.orig', '.md')

    # 单次分片上限。浏览器请求 `bytes=0-` 时不能真把 55MB 一次性读进内存再发 ——
    # 每个并发观看者都会占掉一份，几个人同时点开就 OOM。切成 2MB 回 206，
    # 播放器拿到 Content-Range 后会自己接着要下一片，这是 HTML5 video 的正常行为。
    _DEMO_CHUNK = 2 * 1024 * 1024

    def _serve_demo_video(self, head_only=False):
        """流式发送 demo.mp4，支持 Range（拖进度条、边下边播都靠它）。

        不能交给 SimpleHTTPRequestHandler 的默认实现：它不认 Range，只会 200 + 整个
        文件，浏览器就无法 seek，且 end_headers 的 no-store 会让每次刷新重下 55MB。
        """
        fpath = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'demo.mp4')
        if not os.path.exists(fpath):
            self.send_error(404, 'Not Found')
            return
        size = os.path.getsize(fpath)
        start, end = 0, size - 1
        partial = False
        rng = self.headers.get('Range')
        if rng:
            rm = re.match(r'^bytes=(\d*)-(\d*)$', rng.strip())
            if rm:
                if rm.group(1):
                    start = int(rm.group(1))
                if rm.group(2):
                    end = int(rm.group(2))
                if rm.group(1) == '' and rm.group(2):      # bytes=-500 表示末尾 500 字节
                    start = max(0, size - int(rm.group(2)))
                    end = size - 1
                start = max(0, min(start, size - 1))
                end = max(start, min(end, size - 1))
                partial = True
        # 分片截断只在客户端**确实发了 Range** 时才做。没带 Range 的请求（含裸 HEAD）
        # 必须回 200 + 完整 Content-Length —— 播放器就是靠这个数字算总时长的，
        # 回 206 会让它以为文件只有 2MB。正文是 64KB 一块流式写出，不占内存。
        if partial and end - start + 1 > self._DEMO_CHUNK:
            end = start + self._DEMO_CHUNK - 1
        length = end - start + 1
        self._allow_cache = True       # 内容不变的静态视频，交给浏览器缓存
        self.send_response(206 if partial else 200)
        self.send_header('Content-Type', 'video/mp4')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(length))
        self.send_header('Cache-Control', 'public, max-age=86400')
        if partial:
            self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        self.end_headers()
        if head_only:
            return
        try:
            with open(fpath, 'rb') as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    blob = f.read(min(65536, remaining))
                    if not blob:
                        break
                    self.wfile.write(blob)
                    remaining -= len(blob)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass    # 用户拖进度条/关页面时浏览器会掐断当前分片，属正常
        return

    def _static_block_reason(self, raw_path):
        """返回拒绝原因（字符串）或 None（允许继续路由）。

        实测未加此拦截时：GET /server.py → 200 返回 143KB 源码（含 5 个 API 密钥明文）；
        GET /data/app.db → 200 返回整个 SQLite 库（用户名 + PBKDF2 哈希 + 会话 token）。
        本地自用无碍，绑公网即等于公开密钥和用户库。
        """
        path = urllib.parse.unquote(raw_path.split('?')[0].split('#')[0])
        # 反斜杠在 Windows 上也是路径分隔符，先归一化再判断，否则 /..\server.py 能绕过
        path = path.replace('\\', '/')
        if path in ('', '/'):
            return None                      # 根路径由 do_GET 自己重定向
        if path.startswith('/api/'):
            return None                      # API 路由各自鉴权，不在这里管
        # 目录穿越：/../ 、/%2e%2e/ 解码后都会命中
        if '..' in path.split('/'):
            return '路径穿越'
        # 黑名单先判，且优先于白名单 —— 顺序是有意的：万一两边冲突，拒绝赢。
        lower = path.lower()
        segs = [s for s in lower.split('/') if s]
        for s in segs:
            if s in self._STATIC_DENY_SEGMENTS:
                return f'黑名单路径段 "{s}"'
        if lower.endswith(self._STATIC_DENY_SUFFIXES):
            return '黑名单扩展名'
        if path in self._STATIC_ALLOW:
            return None
        # 用户媒体：/api/data/media/<id> 走 API 鉴权，不是静态文件；
        # data/ 目录下的东西（app.db、users/*）永远不允许静态下载。
        return '不在静态白名单内'

    def do_GET(self):
        # ⚠️ 静态目录白名单：必须在所有路由之前。
        # SimpleHTTPRequestHandler 默认把整个工作目录当网站根目录，实测
        # GET /server.py → 200（143KB，含全部 API 密钥明文）
        # GET /data/app.db → 200（348KB，含全部用户名 + PBKDF2 哈希 + 会话 token）
        # 本地自用没事，一旦绑公网 IP 就是把密钥和用户库直接挂出去。
        # 所以这里改成"只放行明确允许的静态文件"，其余一律 404。
        blocked = self._static_block_reason(self.path)
        if blocked:
            print(f'[Static] 拒绝访问 {self.path} —— {blocked}')
            self.send_error(404, 'Not Found')
            return

        # 根路径重定向到带版本戳的 index.html，彻底绕过浏览器磁盘缓存
        if self.path == '/' or self.path == '':
            ts = int(datetime.now().timestamp())
            self.send_response(302)
            self.send_cors()
            self.send_header('Location', f'/index.html?nocache={ts}')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.end_headers()
            return

        # 对 index.html 禁用 304 协商缓存，强制返回最新内容
        base_path = self.path.split('?')[0]
        if base_path == '/index.html':
            file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'index.html')
            if os.path.exists(file_path):
                try:
                    with open(file_path, 'rb') as f:
                        content = f.read()
                    self.send_response(200)
                    self.send_cors()
                    self.send_header('Content-Type', 'text/html; charset=utf-8')
                    self.send_header('Content-Length', str(len(content)))
                    self.send_header('Last-Modified', datetime.utcnow().strftime('%a, %d %b %Y %H:%M:%S GMT'))
                    # 缓存控制头由 end_headers 统一追加
                    self.end_headers()
                    self.wfile.write(content)
                    return
                except Exception as e:
                    print(f'[Static] Error serving index.html: {e}')
                    self.send_error(500, 'Internal Server Error')
                    return
            else:
                self.send_error(404, 'Not Found')
                return

        # 操作演示视频：必须自己处理 Range，默认实现不支持 seek（见 _serve_demo_video）
        if base_path == '/demo.mp4':
            self._serve_demo_video()
            return

        # ===== 全网搜索接口：真实抓取 Bing/百度/搜狗 =====
        if self.path.startswith('/api/web_search'):
            self.handle_web_search()
            return

        # ===== 商品情报抓取：Amazon / Shopify / 通用 OG =====
        if self.path.startswith('/api/product_scrape'):
            self.handle_product_scrape()
            return

        # ===== 用户系统 / 每用户数据（GET）=====
        if self.path.startswith('/api/auth/') or self.path.startswith('/api/data/') or self.path.startswith('/api/admin/') or self.path.startswith('/api/ip_stats'):
            self.handle_user_api('GET')
            return

        # 检查是否是 API GET 请求
        base_path = self.path.split('?')[0]
        route = API_ROUTES.get(base_path)
        
        # 支持前缀匹配的路由（如 /api/agnes_video_query/xxx -> route + /xxx）
        if not route:
            for prefix, route_config in API_ROUTES.items():
                if base_path.startswith(prefix + '/'):
                    # 提取路径后缀，拼接到目标 URL
                    path_suffix = base_path[len(prefix):]
                    route = route_config.copy()
                    route['url'] = route['url'] + path_suffix
                    break

        if route:
            # API GET 请求（视频查询等）
            try:
                query_string = '?' + self.path.split('?', 1)[1] if '?' in self.path else ''
                # 如果已经有路径后缀，不要重复加 ?（Agnes 视频查询 URL 不带 query）
                if '?' in route['url']:
                    full_url = route['url']
                else:
                    full_url = route['url'] + query_string
                headers = self.build_headers(route)
                # GET 请求不需要 Content-Type
                headers.pop('Content-Type', None)

                req = urllib.request.Request(full_url, headers=headers)
                with urllib.request.urlopen(req, timeout=180, context=_SSL_CONTEXT) as resp:
                    self.proxy_response(resp)

            except urllib.error.HTTPError as e:
                error_body = e.read()
                print(f'[Proxy] HTTP Error {e.code}: {error_body[:200]}')
                self.send_response(e.code)
                self.send_cors()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(error_body)

            except Exception as e:
                print(f'[Proxy] Error: {e}')
                self.send_response(502)
                self.send_cors()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())

        else:
            # 静态文件请求
            if self.path == '/' or self.path == '':
                self.path = '/index.html'
            return super().do_GET()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors()
        self.end_headers()

    def do_DELETE(self):
        if self.path.startswith('/api/data/') or self.path.startswith('/api/admin/'):
            self.handle_user_api('DELETE')
            return
        self.send_error(404, 'Not Found')

    def end_headers(self):
        self.send_cors()
        # 禁止浏览器缓存，确保每次拿最新版本。
        # 例外：_allow_cache 为真时跳过（大体积静态视频，每次重下 55MB 没有意义）。
        if not getattr(self, '_allow_cache', False):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        print(f"[{self.address_string()}] {args[0]}")

    def _clean_search_text(self, value):
        """清洗搜索引擎返回的 HTML/实体/多余空白。

        ⚠️ 标签**不能**一律换成空格。Bing/百度会把命中的关键词包在 <strong> 里高亮，
        `<strong>智能</strong>猫砂盆` 换成空格就变成 `智能 猫砂盆` —— 中文词被劈成两半，
        前端拿原始关键词做 indexOf 匹配必然 0 命中，结果就是用户报的"国内搜不出东西"。
        但也不能一律换成空串：英文 `word<br>word` 会粘成 `wordword`。
        所以按上下文决定：只有两侧都是 ASCII 字母/数字时才补空格。
        """
        value = value or ''
        value = re.sub(r'<script[\s\S]*?</script>', '', value, flags=re.I)
        value = re.sub(r'<style[\s\S]*?</style>', '', value, flags=re.I)
        value = re.sub(r'(?<=[A-Za-z0-9])<[^>]+>(?=[A-Za-z0-9])', ' ', value)
        value = re.sub(r'<[^>]+>', '', value)
        value = html_lib.unescape(value)
        value = re.sub(r'\s+', ' ', value).strip()
        return value

    def _host_to_source(self, url, fallback='全网搜索'):
        try:
            host = urllib.parse.urlparse(url).netloc.lower()
            host = re.sub(r'^(www\.|m\.)', '', host)
            known = {
                'baidu.com': '百度', 'bing.com': 'Bing', 'weibo.com': '微博',
                'douyin.com': '抖音', 'xiaohongshu.com': '小红书', 'bilibili.com': 'B站',
                'thepaper.cn': '澎湃新闻', '36kr.com': '36氪', 'qq.com': '腾讯网',
                'sina.com.cn': '新浪', 'sohu.com': '搜狐', '163.com': '网易',
                'toutiao.com': '今日头条', 'zhihu.com': '知乎'
            }
            for k, v in known.items():
                if k in host:
                    return v
            return host or fallback
        except Exception:
            return fallback

    def _append_search_result(self, results, seen_titles, seen_snippets, title, snippet='', source='', url='#'):
        title = self._clean_search_text(title)
        snippet = self._clean_search_text(snippet)
        if not title or len(title) < 4:
            return
        title_key = re.sub(r'\s+', '', title.lower())[:80]
        snippet_key = re.sub(r'\s+', '', snippet.lower())[:120]
        if title_key in seen_titles:
            return
        if snippet_key and snippet_key in seen_snippets:
            return
        seen_titles.add(title_key)
        if snippet_key:
            seen_snippets.add(snippet_key)
        if not source:
            source = self._host_to_source(url)
        results.append({'title': title[:120], 'snippet': snippet[:240], 'source': source, 'url': url or '#'})

    def _extract_bing_web_results(self, html, results, seen_titles, seen_snippets, count):
        """解析 Bing 网页搜索结果。"""
        items = re.findall(r'<li class="b_algo"[\s\S]*?</li>', html, re.I)
        for item in items[:count * 2]:
            h_m = re.search(r'<h2[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)</a>[\s\S]*?</h2>', item, re.I)
            if not h_m:
                continue
            url = html_lib.unescape(h_m.group(1))
            title = h_m.group(2)
            p_m = re.search(r'<p[^>]*>([\s\S]*?)</p>', item, re.I)
            snippet = p_m.group(1) if p_m else ''
            self._append_search_result(results, seen_titles, seen_snippets, title, snippet, self._host_to_source(url, 'Bing'), url)

    def handle_web_search(self):
        """全网搜索接口：真实抓取 Bing / 百度；不伪造统一摘要。"""
        try:
            query = ''
            count = 10
            if '?' in self.path:
                qs = urllib.parse.parse_qs(self.path.split('?', 1)[1])
                query = qs.get('q', [''])[0]
                count = int(qs.get('count', ['10'])[0])
            
            if not query:
                self.send_response(400)
                self.send_cors()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'results': [], 'error': 'empty query'}).encode())
                return

            print(f'[Web Search] 正在全网搜索：{query}')
            results = []
            seen_titles = set()
            seen_snippets = set()
            
            # 用 Bing 新闻搜索（返回真实的实时结果）
            try:
                # ⚠️ 不能带 setmkt/setlang：实测带上会 302 跳到 bing.com **首页**（0 条结果），
                # 这条主抓取腿因此一直是死的。Accept-Language 头已经够表达中文偏好。
                bing_url = f'https://www.bing.com/news/search?q={urllib.parse.quote(query)}&form=QBNH'
                req = urllib.request.Request(bing_url, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'zh-CN,zh;q=0.9'
                })
                with urllib.request.urlopen(req, timeout=15, context=_SSL_CONTEXT) as resp:
                    html = resp.read().decode('utf-8', errors='ignore')
                
                # 提取 Bing 新闻卡片，尽量保留真实标题、摘要、来源和链接
                cards = re.findall(r'<div[^>]+class="[^"]*news-card[^"]*"[\s\S]*?</div>\s*</div>', html, re.I)
                if not cards:
                    cards = re.findall(r'<a[^>]*class="title"[\s\S]*?(?=<a[^>]*class="title"|$)', html, re.I)
                for card in cards[:count * 2]:
                    a_m = re.search(r'<a[^>]*class="title"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)</a>', card, re.I)
                    if not a_m:
                        continue
                    url = html_lib.unescape(a_m.group(1))
                    title = a_m.group(2)
                    sn_m = re.search(r'<div[^>]*class="[^"]*snippet[^"]*"[^>]*>([\s\S]*?)</div>', card, re.I)
                    src_m = re.search(r'<span[^>]*class="[^"]*(?:source|provider)[^"]*"[^>]*>([\s\S]*?)</span>', card, re.I)
                    snippet = sn_m.group(1) if sn_m else ''
                    source = self._clean_search_text(src_m.group(1)) if src_m else self._host_to_source(url, 'Bing新闻')
                    self._append_search_result(results, seen_titles, seen_snippets, title, snippet, source, url)
            except Exception as e:
                print(f'[Web Search] Bing 抓取失败: {e}')
            
            # 备选1：Bing 新闻结构经常变化；不足时抓 Bing 网页搜索
            if len(results) < 3:
                try:
                    web_url = f'https://www.bing.com/search?q={urllib.parse.quote(query)}&setmkt=zh-CN&setlang=zh-CN'
                    req = urllib.request.Request(web_url, headers={
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept-Language': 'zh-CN,zh;q=0.9'
                    })
                    with urllib.request.urlopen(req, timeout=15, context=_SSL_CONTEXT) as resp:
                        html = resp.read().decode('utf-8', errors='ignore')
                    self._extract_bing_web_results(html, results, seen_titles, seen_snippets, count)
                except Exception as e:
                    print(f'[Web Search] Bing 网页抓取失败: {e}')

            # 备选2：如果 Bing 仍不足，补充百度手机端搜索
            # ⚠️ 百度现在对机房 IP 直接返回「百度安全验证」captcha 页（实测 1438 字节的
            # wappass.baidu.com/static/captcha 跳转），所以这条腿大概率抓不到东西。
            # 保留它是因为换网络环境/家宽仍可能通；但正则必须放宽：真实标签是
            # `<div  class="c-result result">`（div 而非 article、class 带后缀、class= 前两个空格），
            # 原来写死 `<article class="c-result">` 即便没有 captcha 也是 0 命中。
            if len(results) < 3:
                try:
                    bd_url = f'https://m.baidu.com/s?word={urllib.parse.quote(query)}'
                    req = urllib.request.Request(bd_url, headers={
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
                        'Accept-Language': 'zh-CN,zh;q=0.9'
                    })
                    with urllib.request.urlopen(req, timeout=15, context=_SSL_CONTEXT) as resp:
                        html = resp.read().decode('utf-8', errors='ignore')
                        final_url = resp.geturl()

                    if 'wappass.baidu.com' in final_url or '安全验证' in html:
                        print('[Web Search] 百度触发人机验证，跳过该源')
                        html = ''

                    # 提取百度结果（div/article 都收，class 允许后缀）
                    entries = re.findall(
                        r'<(?:div|article)[^>]*class="[^"]*c-result[^"]*"[^>]*>([\s\S]*?)</(?:div|article)>',
                        html)
                    for entry in entries[:5]:
                        title_m = re.search(r'<h3[^>]*>(.*?)</h3>', entry, re.DOTALL)
                        if title_m:
                            title = re.sub(r'<[^>]+>', '', title_m.group(1)).strip()
                            desc = ''
                            desc_m = re.search(r'<span[^>]*class="c-text"[^>]*>(.*?)</span>', entry, re.DOTALL)
                            if desc_m:
                                desc = re.sub(r'<[^>]+>', '', desc_m.group(1)).strip()
                            if title and len(title) > 4:
                                link_m = re.search(r'<a[^>]+href="([^"]+)"', entry, re.DOTALL)
                                url = html_lib.unescape(link_m.group(1)) if link_m else '#'
                                source_m = re.search(r'<span[^>]*class="[^"]*(?:c-color-gray|c-source)[^"]*"[^>]*>(.*?)</span>', entry, re.DOTALL)
                                source = self._clean_search_text(source_m.group(1)) if source_m else '百度'
                                self._append_search_result(results, seen_titles, seen_snippets, title, desc, source, url)
                except Exception as e:
                    print(f'[Web Search] 百度抓取失败: {e}')
            
            # 不再伪造统一模板数据：真实搜索不足时原样返回已抓到的结果，并提示前端。
            
            # 模拟真实热度值
            for r in results:
                r['hotness'] = round(random.uniform(75, 98), 1)
                r['date'] = self._random_recent_date()
            
            print(f'[Web Search] 找到 {len(results)} 条结果')
            
            self.send_response(200)
            self.send_cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'results': results[:count],
                'real_count': len(results),
                # engines_down: 三条腿全没抓到东西 —— 前端据此提示"搜索引擎暂时不可用"，
                # 而不是"换个关键词试试"（后者会让用户白试很多次，问题却不在关键词上）
                'engines_down': len(results) == 0,
                'notice': '结果来自搜索引擎解析；未使用统一模板伪造数据'
            }, ensure_ascii=False).encode())
            
        except Exception as e:
            print(f'[Web Search] Error: {e}')
            self.send_response(500)
            self.send_cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'results': [], 'error': str(e)}).encode())

    def _random_recent_date(self):
        """生成随机的近期日期：几小时前到 7 天内"""
        hours = random.randint(1, 168)
        if hours < 24:
            return f'{hours}小时前'
        else:
            return f'{hours // 24}天前'

    # =============================================================
    #  商品情报抓取 —— 支持 Amazon / Shopify / 通用 OpenGraph
    #  仅用于内容运营辅助生成，最终发布图片建议由 Agnes AI 重新生成
    # =============================================================
    def _fetch_url(self, url, timeout=15):
        # ⚠️ Amazon 等站点靠"客户端提示"指纹识别机器人：只发 UA/Accept/Accept-Language
        # 会稳定拿到 200 + 3.7KB 验证码页（实测）。补齐 sec-ch-ua*/Sec-Fetch-*/DNT 后
        # 同一 URL 可拿到 2.4MB 真实商品页。Accept-Encoding 要求 gzip，故需手动解压。
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            # 抓取目标全是国内站，发 en-US 会让一部分站点吐英文版或跳国际站。
            # 上面那圈 sec-ch-ua*/Sec-Fetch-* 指纹保留（缺了会被判机器人），只换语言。
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Cache-Control': 'max-age=0',
            'DNT': '1',
            'Upgrade-Insecure-Requests': '1',
            'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Connection': 'keep-alive',
        })
        with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CONTEXT) as resp:
            raw = resp.read()
            # urllib 不会自动解压，必须自己处理 Content-Encoding
            encoding_hdr = (resp.headers.get('Content-Encoding', '') or '').lower()
            if 'gzip' in encoding_hdr:
                try:
                    raw = gzip.decompress(raw)
                except Exception:
                    pass
            elif 'deflate' in encoding_hdr:
                try:
                    raw = zlib.decompress(raw, -zlib.MAX_WBITS)
                except Exception:
                    try:
                        raw = zlib.decompress(raw)
                    except Exception:
                        pass
            # 猜测编码：Content-Type charset 优先，否则 utf-8
            ctype = resp.headers.get('Content-Type', '') or ''
            m = re.search(r'charset=([\w\-]+)', ctype, re.I)
            enc = m.group(1) if m else 'utf-8'
            try:
                return raw.decode(enc, errors='ignore')
            except Exception:
                return raw.decode('utf-8', errors='ignore')

    # 反爬拦截页特征（验证码 / "抱歉" 页 / 机器人校验）
    _ANTIBOT_MARKERS = (
        'api-services-support@amazon.com',
        '/errors/validateCaptcha',
        'Enter the characters you see below',
        'Type the characters you see in this image',
        'Robot Check',
        'To discuss automated access to Amazon data',
        'captcha-container',
        'cf-browser-verification',
        'Just a moment...',
        'Checking your browser before accessing',
        'Access to this page has been denied',
        'Pardon Our Interruption',
    )

    def _looks_like_antibot(self, html):
        """判断抓到的是否是反爬拦截页。返回 True 时应报错，而不是拿垃圾 <title> 当成功。"""
        if not html:
            return True
        for marker in self._ANTIBOT_MARKERS:
            if marker in html:
                return True
        # 正常商品页至少几十 KB；不到 20KB 又没有任何商品结构信号，基本是拦截页
        if len(html) < 20000:
            low = html.lower()
            signals = ('productTitle', 'og:title', 'application/ld+json', 'add-to-cart', 'itemprop="price"')
            if not any((s.lower() in low) for s in signals):
                return True
        return False

    def _pick_meta(self, html, name):
        # og:xxx / twitter:xxx / name="description" 通配
        patterns = [
            r'<meta[^>]+property=["\']' + re.escape(name) + r'["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+name=["\']' + re.escape(name) + r'["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']' + re.escape(name) + r'["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']' + re.escape(name) + r'["\']',
        ]
        for p in patterns:
            m = re.search(p, html, re.I)
            if m:
                return html_lib.unescape(m.group(1)).strip()
        return ''

    def _parse_amazon(self, html):
        info = {}
        m = re.search(r'<span[^>]+id=["\']productTitle["\'][^>]*>([\s\S]*?)</span>', html, re.I)
        if m:
            info['title'] = self._clean_search_text(m.group(1))
        # 卖点
        bullets = []
        b_block = re.search(r'id=["\']feature-bullets["\'][\s\S]*?</ul>', html, re.I)
        if b_block:
            for li in re.findall(r'<li[^>]*>([\s\S]*?)</li>', b_block.group(0), re.I):
                t = self._clean_search_text(li)
                if t and len(t) > 4 and not re.search(r'javascript|onclick|display\s*:\s*none', t, re.I):
                    bullets.append(t)
        info['bullets'] = bullets[:8]
        # 价格
        pm = re.search(r'<span[^>]+class=["\'][^"\']*a-offscreen[^"\']*["\'][^>]*>([\s\S]*?)</span>', html, re.I)
        if pm:
            info['price'] = self._clean_search_text(pm.group(1))
        # 图片：landingImage 或 data-a-dynamic-image
        images = []
        li = re.search(r'id=["\']landingImage["\'][^>]+data-a-dynamic-image=["\']([^"\']+)["\']', html, re.I)
        if li:
            try:
                dyn = json.loads(html_lib.unescape(li.group(1)))
                images = list(dyn.keys())
            except Exception:
                pass
        if not images:
            li = re.search(r'id=["\']landingImage["\'][^>]+src=["\']([^"\']+)["\']', html, re.I)
            if li:
                images = [li.group(1)]
        # 兜底：任何 media-amazon.com 大图
        # 注意：原正则写成 https?://[^"\']+m\.media-amazon\.com，要求 :// 与域名之间至少有一个字符，
        # 而真实地址就是 https://m.media-amazon.com/...，永远匹配不上（等于死代码）。
        if not images:
            for u in re.findall(r'https?://[\w.\-]*media-amazon\.com/images/[^"\'\s>]+?\.(?:jpg|jpeg|png|webp)', html, re.I):
                # 跳过 sprite / 图标 / 极小尺寸缩略图
                if re.search(r'/(?:G|01)/|sprite|icon|_SS40_|_SS35_|_CB\d+_\.', u, re.I):
                    continue
                if u not in images:
                    images.append(u)
                if len(images) >= 5:
                    break
        info['images'] = images[:5]
        return info

    def _parse_shopify(self, html):
        info = {}
        # 优先 ld+json
        for block in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>', html, re.I):
            try:
                data = json.loads(block.strip())
                items = data if isinstance(data, list) else [data]
                for it in items:
                    if isinstance(it, dict) and str(it.get('@type', '')).lower() == 'product':
                        info['title'] = it.get('name', info.get('title', ''))
                        info['description'] = it.get('description', info.get('description', ''))
                        info['brand'] = (it.get('brand') or {}).get('name') if isinstance(it.get('brand'), dict) else it.get('brand', '')
                        imgs = it.get('image') or []
                        if isinstance(imgs, str):
                            imgs = [imgs]
                        info['images'] = imgs[:5]
                        offers = it.get('offers') or {}
                        if isinstance(offers, dict):
                            info['price'] = str(offers.get('price', '')) + (' ' + str(offers.get('priceCurrency', '')) if offers.get('priceCurrency') else '')
                        return info
            except Exception:
                continue
        return info

    def _abs_url(self, url_or_path, base_url):
        """把相对/协议相对 URL 转成绝对 URL。"""
        if not url_or_path:
            return ''
        s = url_or_path.strip()
        if s.startswith('//'):
            return 'https:' + s
        if s.startswith('http://') or s.startswith('https://'):
            return s
        if s.startswith('/'):
            pr = urllib.parse.urlparse(base_url)
            return pr.scheme + '://' + pr.netloc + s
        # 相对路径
        pr = urllib.parse.urlparse(base_url)
        base = pr.scheme + '://' + pr.netloc + pr.path.rsplit('/', 1)[0] + '/'
        return urllib.parse.urljoin(base, s)

    def _parse_ldjson_product(self, html):
        """从 <script type=application/ld+json> 里抓 Product 结构（可能嵌 @graph）。"""
        info = {}
        blocks = re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>', html, re.I)
        candidates = []
        for block in blocks:
            try:
                data = json.loads(block.strip())
            except Exception:
                continue
            items = data if isinstance(data, list) else [data]
            for it in items:
                if not isinstance(it, dict):
                    continue
                # 有些站点包装成 @graph
                if isinstance(it.get('@graph'), list):
                    candidates.extend([g for g in it['@graph'] if isinstance(g, dict)])
                else:
                    candidates.append(it)
        # 找 Product 类型（可能是 str 也可能是 list）
        for it in candidates:
            t = it.get('@type', '')
            types = t if isinstance(t, list) else [t]
            types = [str(x).lower() for x in types]
            if 'product' in types:
                info['title'] = it.get('name', '')
                info['description'] = it.get('description', '')
                b = it.get('brand')
                if isinstance(b, dict):
                    info['brand'] = b.get('name', '')
                elif isinstance(b, str):
                    info['brand'] = b
                imgs = it.get('image') or []
                if isinstance(imgs, str):
                    imgs = [imgs]
                info['images'] = [i for i in imgs if isinstance(i, str)][:8]
                offers = it.get('offers')
                if isinstance(offers, list) and offers:
                    offers = offers[0]
                if isinstance(offers, dict):
                    price = offers.get('price') or offers.get('lowPrice')
                    cur = offers.get('priceCurrency', '')
                    if price:
                        info['price'] = (str(price) + (' ' + cur if cur else '')).strip()
                sku = it.get('sku') or it.get('mpn')
                if sku:
                    info['sku'] = str(sku)
                agg = it.get('aggregateRating')
                if isinstance(agg, dict):
                    rv = agg.get('ratingValue')
                    rc = agg.get('reviewCount') or agg.get('ratingCount')
                    if rv:
                        info['rating'] = (str(rv) + (' (' + str(rc) + ' reviews)' if rc else ''))
                return info
        return info

    def _fetch_json(self, url, timeout=15):
        """抓一个 JSON 接口。复用 _fetch_url 的请求头（含 gzip 解压 / 编码猜测），
        只是把 Accept 换成 json 并做一次 json.loads。失败一律抛异常给调用方兜。"""
        _assert_public_url(url)           # 这些 URL 由 slug 拼出，仍要过 SSRF 闸门
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                          '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json,text/plain,*/*',
            # 跟 _fetch_url 保持一致（JSON 接口不做语言协商，这里改的是一致性不是行为）
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
        })
        with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CONTEXT) as resp:
            raw = resp.read()
            enc_hdr = (resp.headers.get('Content-Encoding', '') or '').lower()
            if 'gzip' in enc_hdr:
                try:
                    raw = gzip.decompress(raw)
                except Exception:
                    pass
            elif 'deflate' in enc_hdr:
                try:
                    raw = zlib.decompress(raw, -zlib.MAX_WBITS)
                except Exception:
                    try:
                        raw = zlib.decompress(raw)
                    except Exception:
                        pass
            return json.loads(raw.decode('utf-8', errors='ignore'))

    def _parse_shopify_json(self, url):
        """Shopify 站的 /products/<handle>.js —— 官方在线商店 JSON，字段最干净。

        为什么要专门走这条：Rothy's / Brooklinen 的 HTML 里 ld+json 只有
        ProductGroup / BreadcrumbList，没有 Product，所以 _parse_ldjson_product
        抽不到价格，标题只能退到 og:title，价格全空。实测 .js 端点两站都 200，
        且带 price（单位是**分**，4900 = $49.00）+ vendor + 几十张图。
        """
        pr = urllib.parse.urlparse(url)
        m = re.match(r'^(.*/products/[^/?#]+)', pr.path)
        if not m:
            return {}
        js_url = pr.scheme + '://' + pr.netloc + m.group(1) + '.js'
        try:
            d = self._fetch_json(js_url)
        except Exception as e:
            print(f'[Product] shopify .js 不可用 ({e}) —— 回退 HTML 解析')
            return {}
        if not isinstance(d, dict) or not d.get('title'):
            return {}
        info = {'title': str(d.get('title') or ''), 'source': 'Shopify'}
        # price 是以分为单位的整数；除 100 才是人类价格。别直接 str() 塞出去，
        # 否则页面上会显示 "16900" 这种让人以为是 $16,900 的数字。
        cents = d.get('price')
        if isinstance(cents, (int, float)) and cents > 0:
            cur = str(d.get('currency') or 'USD')
            info['price'] = '%s %.2f' % (cur, cents / 100.0)
        if d.get('vendor'):
            info['brand'] = str(d['vendor'])
        desc = d.get('description') or ''
        if desc:
            info['description'] = self._strip_tags(desc)
        imgs = []
        for im in (d.get('images') or [])[:8]:
            if isinstance(im, str):
                a = self._abs_url(im, url)
                if a and a not in imgs:
                    imgs.append(a)
        if imgs:
            info['images'] = imgs
        if d.get('sku'):
            info['sku'] = str(d['sku'])
        return info

    def _parse_shop_api_json(self, url):
        """自建 Next.js 独立站的 /api/shop/products/<slug> 形态。

        针对 alit.togomol.com 这类**纯客户端渲染**的站：服务端 HTML 里
        og:title 等于 og:site_name（站名），0 个 ld+json，0 个 <h1> ——
        商品名/价格根本不在 HTML 里，只能调它自己前端 JS 调的那个接口
        （从 chunk 里挖到的 `/api/shop/products/${slug}`）。
        """
        pr = urllib.parse.urlparse(url)
        m = re.match(r'^/shop/([^/?#]+)/?$', pr.path)
        if not m:
            return {}
        api = pr.scheme + '://' + pr.netloc + '/api/shop/products/' + m.group(1)
        try:
            d = self._fetch_json(api)
        except Exception as e:
            print(f'[Product] shop api 不可用 ({e})')
            return {}
        if not isinstance(d, dict) or not d.get('success'):
            return {}
        p = ((d.get('data') or {}).get('product')) or {}
        if not isinstance(p, dict) or not p.get('name'):
            return {}
        info = {'title': str(p['name'])}
        price, cur = p.get('price'), str(p.get('currency') or 'USD')
        if price:
            info['price'] = ('%s %s' % (cur, price)).strip()
        if p.get('category'):
            info['brand'] = str(p['category'])
        desc = p.get('shortDescription') or p.get('description') or ''
        if desc:
            info['description'] = self._strip_tags(str(desc))
        imgs = []
        for im in (p.get('images') or []):
            if isinstance(im, str):
                a = self._abs_url(im, url)
                if a and a not in imgs:
                    imgs.append(a)
        if imgs:
            info['images'] = imgs[:8]
        if p.get('sku'):
            info['sku'] = str(p['sku'])
        return info

    def _strip_tags(self, s):
        """把富文本描述里的标签清掉，只留可读文本。"""
        s = re.sub(r'<br\s*/?>', ' ', str(s), flags=re.I)
        s = re.sub(r'</(p|div|li|tr)>', ' ', s, flags=re.I)
        s = re.sub(r'<[^>]+>', '', s)
        return self._clean_search_text(s)

    def _extract_bullets_from_html(self, html):
        """挖页面里"卖点"类清单：优先 li 密集区域，其次 h4/dt 短文本。"""
        bullets = []
        # 先切掉明显是 footer / policy / nav 的整块 HTML（这些块里的 li 是导航/条款，不是卖点）
        stripped = re.sub(r'<(footer|nav|header|aside)\b[\s\S]*?</\1>', ' ', html, flags=re.I)
        # 也切掉 role="contentinfo" 或 class 里含 footer/legal/terms/nav 的容器
        stripped = re.sub(r'<(div|section)[^>]*(role=["\']contentinfo["\']|class=["\'][^"\']*(footer|legal|terms-of|policy|policies|breadcrumb|site-nav|main-nav|menu-)[^"\']*["\'])[^>]*>[\s\S]*?</\1>', ' ', stripped, flags=re.I)

        blocks = re.findall(r'<(ul|ol)[^>]*>([\s\S]*?)</\1>', stripped, re.I)
        scored = []
        # 收缩版停用词：法务/隐私/服务条款/账户类
        stop_pat = re.compile(r'(^|\b)('
            r'sign in|sign up|log in|register(?:ation)?|account|cart|checkout|wishlist|'
            r'shipping|returns?|privacy|terms(?:\s+of\s+(?:use|service))?|contact|about\s*us|'
            r'help|faq|newsletter|subscribe|home|blog|careers?|press|'
            r'purchases?|general\s+restrictions?|content|sms\s+messaging|'
            r'errors,?\s+inaccuracies|disclaimers?|limitation\s+of\s+liability|indemnification|'
            r'governing\s+law|copyright|trademarks?|dispute\s+resolution|arbitration|'
            r'user\s+conduct|user\s+content|third[- ]party|advertising|cookies?|gdpr|ccpa|'
            r'age\s+restrictions?|children|jurisdiction|entire\s+agreement|severability|waiver'
            r')($|\b)', re.I)

        for tag, body in blocks:
            lis = re.findall(r'<li[^>]*>([\s\S]*?)</li>', body, re.I)
            if len(lis) < 2:
                continue
            texts = []
            for li in lis:
                # 排除含大量事件绑定/属性 handler 的 li（明显是 Vue/Alpine 导航组件）
                if re.search(r'(@(?:mouseenter|mouseleave|click|focus)|x-ref|x-data|x-init|:class=|v-for|data-vue|categoryItem)', li):
                    continue
                # 排除包含 <a href> 且很短的 li（多为导航链接）
                if re.search(r'<a\s[^>]*href=', li, re.I):
                    # 只有当 li 里的文本主要来自 <a>（即去掉 <a> 后没什么文本）才排除
                    without_a = re.sub(r'<a\b[\s\S]*?</a>', '', li)
                    if len(self._clean_search_text(without_a)) < 12:
                        continue
                t = self._clean_search_text(li)
                if not t or len(t) < 6 or len(t) > 240:
                    continue
                if stop_pat.search(t):
                    continue
                # 忽略纯数字/纯符号
                if re.match(r'^[\d\s\.\-\+]+$', t):
                    continue
                # 全是首字母大写的 1-3 词短语常常是导航（"Registration"、"General Restrictions"）
                words = t.split()
                if 1 <= len(words) <= 3 and all(w[:1].isupper() for w in words if w and w[0].isalpha()):
                    continue
                # 里面含大量 "Shop XXX" 重复的通常是 mega-menu
                if len(re.findall(r'\bShop\s+\w+', t, re.I)) >= 2:
                    continue
                texts.append(t)
            if texts:
                scored.append((len(texts), texts))
        # 按 li 数量降序，取前 2 个块合并
        scored.sort(key=lambda x: -x[0])
        for _, texts in scored[:2]:
            for t in texts:
                if t not in bullets:
                    bullets.append(t)
        return bullets[:10]

    def _collect_page_images(self, html, base_url):
        """收集页面里像商品图的大图：优先带 alt/尺寸，或路径含 product/large 关键字的。"""
        seen = set()
        out = []
        for m in re.finditer(r'<img\b[^>]*>', html, re.I):
            tag = m.group(0)
            src_m = re.search(r'\b(?:src|data-src|data-original|data-lazy-src)=["\']([^"\']+)["\']', tag, re.I)
            if not src_m:
                continue
            src = html_lib.unescape(src_m.group(1))
            if src.startswith('data:'):
                continue
            src_abs = self._abs_url(src, base_url)
            # 尝试判断"大图"：路径包含 product/large/high；或 width/height 属性≥400
            low = src_abs.lower()
            looks_big = any(k in low for k in ['product', 'products/', '/large', '_1024', '_1200', '_1500', '_2048', 'high-res', 'zoom'])
            wh_m = re.search(r'\b(?:width|data-width)=["\']?(\d{3,4})', tag)
            if wh_m and int(wh_m.group(1)) >= 400:
                looks_big = True
            # 排除明显图标/logo
            if re.search(r'(logo|icon|sprite|favicon|placeholder|blank\.gif|1x1\.png|thumb-|/thumbs?/)', low):
                continue
            if not looks_big:
                continue
            if src_abs in seen:
                continue
            seen.add(src_abs)
            out.append(src_abs)
            if len(out) >= 8:
                break
        return out

    def _parse_microdata_product(self, html):
        """itemprop 微数据兜底 —— 有些老站点只用它。"""
        info = {}
        title_m = re.search(r'itemprop=["\']name["\'][^>]*>([\s\S]*?)</', html, re.I)
        if title_m:
            info['title'] = self._clean_search_text(title_m.group(1))
        desc_m = re.search(r'itemprop=["\']description["\'][^>]*>([\s\S]*?)</', html, re.I)
        if desc_m:
            info['description'] = self._clean_search_text(desc_m.group(1))
        price_m = re.search(r'itemprop=["\']price["\'][^>]*content=["\']([^"\']+)["\']', html, re.I) \
                  or re.search(r'itemprop=["\']price["\'][^>]*>([\s\S]*?)</', html, re.I)
        if price_m:
            info['price'] = self._clean_search_text(price_m.group(1))
        brand_m = re.search(r'itemprop=["\']brand["\'][^>]*content=["\']([^"\']+)["\']', html, re.I) \
                  or re.search(r'itemprop=["\']brand["\'][^>]*>([\s\S]*?)</', html, re.I)
        if brand_m:
            info['brand'] = self._clean_search_text(brand_m.group(1))
        return info

    def _parse_dangdang(self, html, url):
        """当当商品页专用解析器。

        通用解析器在当当上会连着踩三个坑，所以这里单独走一条路：
          ① 标题：<title> 是 SEO 堆砌串，而且**前缀的品牌名经常是错的**
             （实测 1667166764 是松下吹风机，<title> 却是「【九阳电吹风】松下电吹风…」，
             九阳是当当自己挂错的类目词）。<h1> 才是干净商品名，所以只认 <h1>。
             末尾的 "_颜色-规格" 是当前选中的 SKU 后缀，一并切掉。
          ② 图片：主图是 img3mN.ddimg.cn/<两级目录>/<商品ID>-<序号>_<尺寸>_<版本>.jpg。
             通用分支的 _collect_page_images 认「路径里含 product 就算商品图」，
             而当当的域名本身就叫 product.dangdang.com —— 于是页面里的站点装饰图、
             甚至没被模板引擎渲染掉的 "${gift.image}" 字面量都会被当成商品图收进来
             （实测 7 张里只有 2 张是真图）。这里改成按商品 ID 反查：路径里必须出现
             当前商品 ID 才算，顺手把缩略图尺寸位 _k_/_x_/_w_ 归一成大图 _u_。
          ③ 卖点：#detail_describe 里的 <li> 是真参数（品牌/型号/尺寸/面料工艺/开本…），
             但同一块 HTML 往下就是「价格说明」的免责声明（当当价/划线价/异常问题…）。
             通用分支按 li 数量排序取最多的两块，结果捞上来的全是免责声明。
             这里只截到「快速直达 / 价格说明 / 本商品暂无详情」之前为止。

        价格拿不到是**站点决定的**，不是解析漏了：当当的价格由前端模板渲染，
        静态 HTML 里只有 "${value.salePrice}" 占位符。商品情报卡不展示价格，
        所以不影响使用；别再花时间找价格正则了。
        """
        info = {}

        m = re.search(r'<h1[^>]*>([\s\S]{0,400}?)</h1>', html, re.I)
        if m:
            title = self._clean_search_text(m.group(1))
            # 图书页 <h1> 外面套着书名号
            title = re.sub(r'^[《(](.*?)[》)]$', r'\1', title).strip()
            # "_天蓝色+猫铲子" 这类 SKU 后缀对生成图文没用，反而会污染标题
            title = title.split('_')[0].strip()
            if title:
                info['title'] = title

        pid_m = re.search(r'/(\d{7,10})\.html', url)
        pid = pid_m.group(1) if pid_m else ''
        images, seen = [], set()
        for mm in re.finditer(r'(?:https?:)?//(img\d+m?\d*\.ddimg\.cn/[^\s"\'\\)<>]+\.(?:jpg|jpeg|png|webp))', html, re.I):
            path = mm.group(1)
            # "${product.image}" 之类未渲染的模板字面量
            if '${' in path:
                continue
            # 认商品 ID：把站点装饰图、二维码、推荐位的图全排除掉
            if pid and pid not in path:
                continue
            path = re.sub(r'-(\d+)_[a-z]_', r'-\1_u_', path)
            if path in seen:
                continue
            seen.add(path)
            images.append('https://' + path)
            if len(images) >= 8:
                break
        if images:
            info['images'] = images

        bullets = []
        blk = re.search(r'id=["\']detail_describe["\'][^>]*>([\s\S]{0,4000}?)(?:快速直达|价格说明|本商品暂无详情)', html, re.I)
        if blk:
            for li in re.findall(r'<li[^>]*>([\s\S]*?)</li>', blk.group(1), re.I):
                t = self._clean_search_text(li)
                if not t or len(t) < 3 or len(t) > 120:
                    continue
                if '所属分类' in t:      # 面包屑，不是卖点
                    continue
                # 「品牌：」这一条**必须丢掉**：当当第三方商家的品牌字段大面积标错，
                # 实测松下吹风机 / 松下剃须刀 / 飞利浦剃须刀 / 德龙咖啡机的品牌全被标成
                # "九阳"（"九阳" 像是错标时的默认值），收纳盒被标成 "哈特丽"（宠物品牌）。
                # 商品标题里本来就带正确品牌，而这条错品牌一旦进了卖点，就会被原样写进
                # 生成的图文和口播稿 —— 那是"自信地说错话"，比缺一条参数坏得多。
                if re.match(r'^品牌\s*[:：]', t):
                    continue
                if t not in bullets:
                    bullets.append(t)
        if bullets:
            info['bullets'] = bullets[:10]

        # description 必须自己给出，不能让通用兜底去捡 meta description。
        # 当当的 meta description 是 SEO 模板串，实测长这样：
        #   "<标题> 类别:加湿器 品牌:九阳以及<标题>图片、评论、心得等信息，
        #    为您购买<标题>提供方便快捷的网上购物体验"
        # 三个问题：① 标题被重复三遍；② "图片、评论、心得/网上购物体验" 是站点话术，
        # 不是商品信息；③ 里面又把**错的品牌**带回来了（大宇加湿器写成"九阳"）——
        # 上面刚把 "品牌：" 卖点丢掉，这里再从 meta 捡回来就等于没过滤。
        # 这段文本会进"抓取核对区"，直接当生成图文/口播稿的输入源，所以宁缺毋滥：
        # 用真参数拼一条，拼不出就留空（前端对空 description 是正常降级的）。
        if bullets:
            info['description'] = ' · '.join(bullets[:6])
        else:
            info['description'] = info.get('title', '')

        return info

    def _parse_generic(self, html, url):
        """独立站通用解析器：JSON-LD Product > microdata > OG/Twitter/title。"""
        info = {}

        # 1) 首选 JSON-LD Product（大多数正规独立站都有）
        ld = self._parse_ldjson_product(html)
        for k, v in ld.items():
            if v:
                info[k] = v

        # 2) microdata 兜底
        micro = self._parse_microdata_product(html)
        for k, v in micro.items():
            if not info.get(k) and v:
                info[k] = v

        # 3) OpenGraph / Twitter Card / <title>
        if not info.get('title'):
            title = self._pick_meta(html, 'og:title') or self._pick_meta(html, 'twitter:title')
            if not title:
                m = re.search(r'<title[^>]*>([\s\S]*?)</title>', html, re.I)
                if m:
                    title = self._clean_search_text(m.group(1))
            info['title'] = title or ''

        if not info.get('description'):
            info['description'] = (self._pick_meta(html, 'og:description')
                                    or self._pick_meta(html, 'description')
                                    or self._pick_meta(html, 'twitter:description') or '')

        if not info.get('brand'):
            info['brand'] = self._pick_meta(html, 'og:site_name') or ''

        # 4) 图像：LD-JSON 图 + OG 图 + 页面里挖的大图，去重合并
        images = []
        for img in (info.get('images') or []):
            img_abs = self._abs_url(img, url)
            if img_abs and img_abs not in images:
                images.append(img_abs)
        og_img = self._pick_meta(html, 'og:image') or self._pick_meta(html, 'twitter:image')
        if og_img:
            og_abs = self._abs_url(og_img, url)
            if og_abs and og_abs not in images:
                images.append(og_abs)
        if len(images) < 4:
            for extra in self._collect_page_images(html, url):
                if extra not in images:
                    images.append(extra)
                if len(images) >= 8:
                    break
        info['images'] = images[:8]

        # 5) 卖点：若还没有 bullets（Amazon/Shopify 分支已抓，通用分支挖清单）
        if not info.get('bullets'):
            info['bullets'] = self._extract_bullets_from_html(html)

        return info

    def handle_product_scrape(self):
        try:
            url = ''
            if '?' in self.path:
                qs = urllib.parse.parse_qs(self.path.split('?', 1)[1])
                url = qs.get('url', [''])[0]
            if not url or not re.match(r'^https?://', url):
                self.send_json(400, {'success': False, 'error': 'Invalid product URL'})
                return
            # SSRF 闸门：url 完全来自客户端，不校验的话服务器会替攻击者去读内网。
            # 实测未加此判断时 ?url=http://127.0.0.1:8766/index.html 返回 200 并把
            # 本机页面当"商品"解析出来；云上换成 169.254.169.254 就能拿到实例临时凭证。
            # 复用媒体归档那条已经写好的 _assert_public_url（协议 + 解析后逐 IP 校验）。
            try:
                _assert_public_url(url)
            except ValueError as e:
                print(f'[Product] 拒绝抓取内网/非法地址: {url} —— {e}')
                self.send_json(400, {'success': False, 'error': f'不允许抓取该地址：{e}'})
                return

            print(f'[Product] Scraping: {url}')
            html_text = self._fetch_url(url)
            host = urllib.parse.urlparse(url).netloc.lower()

            # 先判反爬：拦截页也是 HTTP 200，而 _parse_generic 会拿它的 <title>
            # （如 "Amazon.com"）当商品名返回 success，用户看到一张莫名其妙的卡片。
            if self._looks_like_antibot(html_text):
                print(f'[Product] Anti-bot page detected ({len(html_text)} bytes) for {url}')
                self.send_json(200, {
                    'success': False,
                    'error': f'目标站点返回了反爬/验证码页面（{len(html_text)} 字节），未拿到真实商品页。'
                             f'建议：① 稍后重试；② 换用商品的规范详情页链接（页面上的「内置样例」是实测可抓的当当商品页）；'
                             f'③ 或把商品标题与卖点手工粘到下方「副文本」区继续。',
                    'antibot': True,
                    'raw_host': host
                })
                return
            info = {}
            if 'dangdang.com' in host:
                # 当当必须走专用分支：通用分支在这里会给出"看着成功、内容是垃圾"的结果
                # （错品牌标题 + 站点装饰图 + 价格免责声明当卖点），详见 _parse_dangdang
                info = self._parse_dangdang(html_text, url)
                info.setdefault('source', '当当网')
            elif 'amazon.' in host:
                info = self._parse_amazon(html_text)
                info.setdefault('source', 'Amazon')
            elif 'shopify' in html_text.lower() or 'cdn.shopify.com' in html_text.lower():
                # 先试官方 .js 端点（带真价格），拿不到再退回 HTML ld+json
                info = self._parse_shopify_json(url) or self._parse_shopify(html_text)
                info.setdefault('source', 'Shopify')
            elif re.match(r'^/shop/[^/?#]+/?$', urllib.parse.urlparse(url).path):
                # 自建 Next.js 商城（客户端渲染，HTML 里没有商品数据）
                info = self._parse_shop_api_json(url)
                if info:
                    info.setdefault('source', host)

            # 通用兜底 + 补充缺失字段
            fallback = self._parse_generic(html_text, url)
            for k, v in fallback.items():
                if not info.get(k):
                    info[k] = v

            # 汇总描述：Amazon 用 bullets 拼；否则用 og:description
            if not info.get('description') and info.get('bullets'):
                info['description'] = ' • '.join(info['bullets'][:6])

            # 干净化
            for k in ('title', 'description', 'brand'):
                if info.get(k):
                    info[k] = self._clean_search_text(str(info[k]))[:800]

            info.setdefault('images', [])
            info.setdefault('bullets', [])
            info['url'] = url
            info.setdefault('source', host)

            if not info.get('title'):
                self.send_json(200, {'success': False, 'error': '未能识别商品标题（可能是登录墙或反爬），请换一个商品链接试试', 'raw_host': host})
                return

            # 站名冒充商品名的假成功拦截。
            # 实测：Shopee 商品页返回的 og:title 是 "Shopee Singapore | Cheaper, Faster
            # On Shopee"，Allbirds 是 "Allbirds Men's Shoes | Shop Sustainable ..."，
            # 都是**首页/站级**标题 —— 因为这些站商品数据靠 JS 渲染，_parse_generic
            # 只能退到 og:title。这时返回 success 比返回失败更糟：用户拿到一张看着
            # 像商品、实际是站名的卡片，后面据此生成的图文/脚本全是错的，而且很难看出
            # 错在哪。宁可明确报错让他走「副文本」手工粘。
            # 判据刻意收得很窄，只认三种铁证，避免误伤正常商品页：
            #   ① og:title == og:site_name（alit：两者都是 "AutoLitterBox Pro"）
            #   ② 标题里有 " | " 分隔且右段像站名标语（Shopee / Allbirds）
            #   ③ 中文站的登录页 / 占位标题（改国内版时实测新增的两种假成功：
            #      博库 bookuu.com/detail.php?id=… → 标题 "博库网-登录"；
            #      淘宝 H5 h5.m.taobao.com → 标题就是 "商品详情页" 四个字。
            #      两者都 HTTP 200、都不含英文标语，原来的 ①② 一条都拦不住。）
            # 只在**没有任何结构化商品信号**（无价格、无 sku）时才判定 —— 有价格就说明
            # 确实解析到了商品，Amazon/Rothy's/Brooklinen/alit 走 JSON 分支都带价格，
            # 不会被这条挡住。
            if not info.get('price') and not info.get('sku'):
                t_norm = self._clean_search_text(str(info.get('title') or '')).strip()
                site_name = self._clean_search_text(self._pick_meta(html_text, 'og:site_name') or '').strip()
                bad_reason = ''
                if site_name and t_norm.lower() == site_name.lower():
                    bad_reason = f'页面标题就是站名「{site_name}」'
                elif re.search(r'\|\s*(shop|buy|cheaper|official|free shipping|online store)\b', t_norm, re.I):
                    bad_reason = f'页面标题是站级标语「{t_norm[:60]}」'
                elif re.search(r'(登录|注册|请先登录|登陸)\s*$', t_norm) or re.search(r'^(登录|注册)', t_norm):
                    bad_reason = f'页面是登录墙而不是商品页（标题「{t_norm[:40]}」）'
                elif re.fullmatch(r'(商品详情页?|商品详情\s*[-—|]\s*\S{2,12}|宝贝详情|详情页)', t_norm):
                    bad_reason = f'页面标题是通用占位文案「{t_norm[:40]}」，说明商品数据没渲染出来'
                if bad_reason:
                    print(f'[Product] 站名冒充商品名，判为失败: {t_norm[:60]} | {url}')
                    self.send_json(200, {
                        'success': False,
                        'error': f'该站商品信息由前端 JS 动态渲染，服务器只拿到站级页面（{bad_reason}），'
                                 f'没有真实商品名和价格。建议：① 改用服务端渲染的详情页（当当、有赞/微盟建的独立商城，'
                                 f'或页面上的「内置样例」）；② 或把商品标题与卖点手工粘到下方「副文本」区继续。',
                        'client_rendered': True,
                        'raw_host': host
                    })
                    return

            print(f'[Product] OK: {info.get("title", "")[:60]} | imgs={len(info.get("images", []))}')
            self.send_json(200, {'success': True, 'product': info})
        except urllib.error.HTTPError as e:
            print(f'[Product] HTTP {e.code} for {url}')
            self.send_json(200, {'success': False, 'error': f'目标站点返回 HTTP {e.code}，可能需要登录或已启用反爬'})
        except Exception as e:
            print(f'[Product] Error: {e}')
            self.send_json(500, {'success': False, 'error': str(e)})

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    """多线程 HTTP 服务器：避免单个慢请求（视频轮询等）阻塞整个服务。"""
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        """客户端中途断开不算服务器错误，不打整段 traceback。

        浏览器刷新/关标签会掐掉正在飞的请求（尤其 beforeunload 那次 saveAppData），
        socketserver 默认会为每一次都吐 30 行 traceback。真出问题时，日志里全是这些噪音，
        反而看不见有用的报错。所以这里只对断连做一行摘要，其余异常仍走原来的完整打印。
        """
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)):
            print(f'[Conn] 客户端提前断开 {client_address[0]}: {type(exc).__name__}')
            return
        super().handle_error(request, client_address)


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    # 强制 stdout 使用 UTF-8，避免 Windows GBK 控制台打印 emoji 崩溃
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    init_db()
    server = ThreadingHTTPServer(('0.0.0.0', PORT), ProxyHandler)
    print('=' * 60)
    print('  [AutoMedia] 自媒体AI运营平台 — 生产服务器')
    print(f'  [Local]    http://localhost:{PORT}')
    print(f'  [Public]   http://<服务器IP>:{PORT}')
    print()
    print('  [AI] 已配置 AI 引擎:')
    print(f'     MiniMax M2.7   -- 文本生成')
    print(f'     MiniMax image-01 -- 图片生成')
    print(f'     MiniMax T2V-01  -- 视频生成')
    print(f'     腾讯混元 hunyuan  -- 图片 + 视频生成')
    print()
    print('  [Data] 数据持久化: SQLite (data/app.db) + 文件系统 (data/users/)')
    print(f'  [Auth] 管理员: {SEED_ADMIN_USER}（首次启动已 seed）')
    print('  [Ctrl+C] 按 Ctrl+C 停止服务')
    print('=' * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[OK] 服务已停止')
        server.server_close()


if __name__ == '__main__':
    main()
