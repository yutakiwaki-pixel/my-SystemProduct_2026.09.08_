import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "@/lib/crypto";

// Self-contained SQLite store for apps/vuln-lab. Deliberately independent from
// @repo/database / PostgreSQL (see apps/vuln-lab/CLAUDE.md) — this app must never touch the
// shared product database. The file lives under apps/vuln-lab/.data/, which is gitignored.
const DB_PATH = join(process.cwd(), ".data", "dev.sqlite3");
mkdirSync(dirname(DB_PATH), { recursive: true });

// Reuse a single connection across Next.js dev-server hot reloads instead of leaking one
// per reload.
declare global {
  var __vulnLabDb: DatabaseSync | undefined;
}

export const db = globalThis.__vulnLabDb ?? new DatabaseSync(DB_PATH);
if (process.env.NODE_ENV !== "production") {
  globalThis.__vulnLabDb = db;
}

// node:sqlite types query results as a generic `Record<string, SQLOutputValue>`, which is too
// loose for TypeScript to compare against our concrete row shapes below — these two small
// helpers do the `unknown` round-trip in one place instead of at every call site.
export function row<T>(value: unknown): T | undefined {
  return value as T | undefined;
}

export function rows<T>(value: unknown): T[] {
  return value as T[];
}

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS member_sessions (
    token TEXT PRIMARY KEY,
    member_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    menu TEXT NOT NULL,
    party_size INTEGER NOT NULL,
    reserved_at TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function seed() {
  const adminCount = row<{ count: number }>(
    db.prepare("SELECT COUNT(*) as count FROM admins").get(),
  );
  if (!adminCount || adminCount.count > 0) return;

  const now = new Date().toISOString();

  db.prepare("INSERT INTO admins (email, password_hash) VALUES (?, ?)").run(
    "admin@example.com",
    hashPassword("admin123"),
  );

  db.prepare(
    "INSERT INTO members (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)",
  ).run("sato@example.com", hashPassword("password123"), "佐藤 花子", now);

  db.prepare(
    "INSERT INTO reservations (member_id, menu, party_size, reserved_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    1,
    "カット + カラー",
    1,
    "2026-09-20T11:00:00",
    "初めての来店です。よろしくお願いします。",
    now,
  );

  db.prepare("INSERT INTO news (title, body, created_at) VALUES (?, ?, ?)").run(
    "秋の営業時間のお知らせ",
    "9月より、平日の営業時間を10:00〜19:00に変更いたします。\nご来店の際はお気をつけてお越しください。",
    now,
  );
}
seed();

export interface Member {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  created_at: string;
}

export interface Admin {
  id: number;
  email: string;
  password_hash: string;
}

export interface Reservation {
  id: number;
  member_id: number;
  menu: string;
  party_size: number;
  reserved_at: string;
  note: string;
  created_at: string;
}

export interface Contact {
  id: number;
  name: string;
  email: string;
  message: string;
  created_at: string;
}

export interface NewsPost {
  id: number;
  title: string;
  body: string;
  created_at: string;
}
