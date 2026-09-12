import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { DEFAULT_MODELS } from "./model_defaults";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");
const USERS_DIR = path.join(DATA_DIR, "users");

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

    CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id, kind);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);

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
    const adminUser = process.env.GS_ADMIN_USER || "martinxie";
    const adminPass = process.env.GS_ADMIN_PASS || "sunny520";
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
