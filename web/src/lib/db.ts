import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { runBillingMigration } from "./billing/migration";

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "infinite-canvas.db");

let _db: Database.Database | null = null;

function getDb() {
    if (_db) return _db;
    mkdirSync(DATA_DIR, { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    is_admin INTEGER NOT NULL DEFAULT 0,
    quota INTEGER NOT NULL DEFAULT 0,
    used_quota INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS canvases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS system_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    config TEXT NOT NULL DEFAULT '{}',
    webdav TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_canvases_user ON canvases(user_id);
  CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id);
`);
    migrateUsersQuota(_db);
    runBillingMigration(_db);
    return _db;
}

/** 为旧数据库迁移：添加 quota / used_quota 列，管理员设为无限额度 */
function migrateUsersQuota(db: Database.Database) {
    const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    const has = (name: string) => columns.some((column) => column.name === name);
    if (!has("quota")) {
        db.exec("ALTER TABLE users ADD COLUMN quota INTEGER NOT NULL DEFAULT 0");
        // 已有管理员设为无限额度（-1），其他用户保持默认 0
        db.prepare("UPDATE users SET quota = -1 WHERE is_admin = 1").run();
    }
    if (!has("used_quota")) {
        db.exec("ALTER TABLE users ADD COLUMN used_quota INTEGER NOT NULL DEFAULT 0");
    }
}

export const db = new Proxy({} as Database.Database, {
    get(_target, prop) {
        return getDb()[prop as keyof Database.Database];
    },
});
