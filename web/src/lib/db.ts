import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

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
    return _db;
}

export const db = new Proxy({} as Database.Database, {
    get(_target, prop) {
        return getDb()[prop as keyof Database.Database];
    },
});
