import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { DATA_DIR, DB_PATH, USERS_DIR } from "./data_paths";
import { DEFAULT_MODELS } from "./model_defaults";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });
  } catch (err) {
    console.warn("[db] Notice checking data directory:", err);
  }

  _db = new Database(DB_PATH, { timeout: 15000 });
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  initDb(_db);
  return _db;
}

export function initDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL,
      prompts_seeded INTEGER NOT NULL DEFAULT 0,
      models_seeded INTEGER NOT NULL DEFAULT 0,
      models_deleted TEXT NOT NULL DEFAULT '[]'
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

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id, kind);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);

  // Seed default system settings if missing
  const nowStr = new Date().toISOString();
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO system_settings (key, value, description, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  for (const [k, item] of Object.entries(DEFAULT_SYSTEM_SETTINGS)) {
    insertSetting.run(k, item.value, item.description, nowStr);
  }

  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase
      ON users(username COLLATE NOCASE);
    `);
  } catch {
    // index already exists or ignore
  }

  try {
    db.exec(`
      ALTER TABLE users ADD COLUMN models_seeded INTEGER NOT NULL DEFAULT 0;
    `);
  } catch {
    // column already exists
  }

  try {
    db.exec(`
      ALTER TABLE users ADD COLUMN models_deleted TEXT NOT NULL DEFAULT '[]';
    `);
  } catch {
    // column already exists
  }

  // Seed default admin if table is empty
  const userCount = db.prepare("SELECT count(*) as count FROM users").get() as { count: number };
  if (userCount.count === 0) {
    // 首次建库：admin 账号只信任 .env / 环境变量。
    // 源码里绝不写死真实密码 —— 之前硬编码的 GS_ADMIN_PASS 已被提交进 git 历史，
    // 视为泄露。未配置时生成随机强密码并打印到启动日志（一次性），
    // 让部署者必须显式设置，而不是静默落回一个可被源码检索到的默认值。
    const adminUser = process.env.GS_ADMIN_USER || "admin";
    let adminPass = process.env.GS_ADMIN_PASS;
    if (!adminPass || !adminPass.trim()) {
      adminPass = crypto.randomBytes(18).toString("base64url");
      console.warn(
        `[db] 首次建库未配置 GS_ADMIN_PASS，已生成一次性随机管理员密码：\n` +
          `      用户名: ${adminUser}\n` +
          `      临时密码: ${adminPass}\n` +
          `      ⚠️ 请立即在 .env 或 systemd EnvironmentFile 里设置 GS_ADMIN_PASS，` +
          `并尽快在「用户管理」里修改该密码。`
      );
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(adminPass, Buffer.from(salt, "utf-8"), 200000, 32, "sha256").toString("hex");
    const now = new Date().toISOString();

    const insertUser = db.prepare(`
      INSERT INTO users (username, pass_hash, salt, role, created_at, prompts_seeded)
      VALUES (?, ?, ?, 'admin', ?, 1)
    `);
    const info = insertUser.run(adminUser, hash, salt, now);
    seedUserDefaultModels(db, Number(info.lastInsertRowid));
    db.prepare("UPDATE users SET models_seeded = 1 WHERE id = ?").run(Number(info.lastInsertRowid));
  }
}

export function seedUserDefaultModels(db: Database.Database, userId: number) {
  // 与 /api/data/models 的 GET 懒加载共用同一份默认配置，避免两处定义漂移
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO user_models
    (user_id, model_id, name, provider, base_url, protocol, type, model_slug, status, api_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')
  `);

  const tx = db.transaction(() => {
    for (const m of DEFAULT_MODELS) {
      stmt.run(userId, m.model_id, m.name, m.provider, m.base_url, m.protocol, m.type, m.model_slug, m.status);
    }
    db.prepare("UPDATE users SET models_seeded = 1 WHERE id = ?").run(userId);
  });
  tx();
}

export const DEFAULT_SYSTEM_SETTINGS: Record<string, { value: string; description: string }> = {
  AGNES_API_KEY: {
    value: "",
    description: "Agnes AI API 密钥 (视频与图像生成)",
  },
  ARK_API_KEY: {
    value: "",
    description: "火山方舟 Coding Plan API 密钥",
  },
  ARK_PLAN_API_KEY: {
    value: "",
    description: "火山方舟 Agent Plan (文本与视觉理解) API 密钥",
  },
  HY_API_KEY: {
    value: "",
    description: "腾讯混元大模型 API 密钥",
  },
  MM_API_KEY: {
    value: "",
    description: "MiniMax 海螺 AI API 密钥",
  },
  SEEDANCE_MINI_API_KEY: {
    value: "",
    description: "Seedance 2 Mini 聚合 API 密钥",
  },
  GS_ADMIN_USER: {
    value: "admin",
    description: "系统管理员初始用户名（仅首次建库且未设 GS_ADMIN_USER 时生效）",
  },
  GS_ADMIN_PASS: {
    value: "",
    description: "系统管理员初始密码。请通过 .env / 环境变量提供，不要在源码里写死真实密码。",
  },
  GS_PORT: {
    value: "8766",
    description: "系统运行端口",
  },
};

export function getSystemSetting(key: string, defaultValue = ""): string {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM system_settings WHERE key = ?").get(key) as { value?: string } | undefined;
    if (row && typeof row.value === "string" && row.value.trim() !== "") {
      return row.value.trim();
    }
  } catch {
    // ignore db read failure
  }
  if (process.env[key] && process.env[key]!.trim() !== "") {
    return process.env[key]!.trim();
  }
  return DEFAULT_SYSTEM_SETTINGS[key]?.value || defaultValue;
}

export function setSystemSetting(key: string, value: string, description?: string): void {
  const db = getDb();
  const desc = description || DEFAULT_SYSTEM_SETTINGS[key]?.description || "";
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO system_settings (key, value, description, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      description = COALESCE(excluded.description, system_settings.description),
      updated_at = excluded.updated_at
  `).run(key, value, desc, now);
  process.env[key] = value;
}

export function getAllSystemSettings(): Record<string, { value: string; description: string; updated_at: string }> {
  const db = getDb();
  const rows = db.prepare("SELECT key, value, description, updated_at FROM system_settings").all() as Array<{
    key: string;
    value: string;
    description: string;
    updated_at: string;
  }>;
  const result: Record<string, { value: string; description: string; updated_at: string }> = {};
  for (const r of rows) {
    result[r.key] = { value: r.value, description: r.description, updated_at: r.updated_at };
  }
  for (const [k, v] of Object.entries(DEFAULT_SYSTEM_SETTINGS)) {
    if (!result[k]) {
      result[k] = { value: v.value, description: v.description, updated_at: new Date().toISOString() };
    }
  }
  return result;
}

