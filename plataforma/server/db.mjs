import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ZONES } from './catalog.mjs';

const DATA_DIR = path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'aqua-club.sqlite');

export const db = new DatabaseSync(DB_PATH);

export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA cache_size = -16000');
db.exec('PRAGMA temp_store = MEMORY');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('customer','admin')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  verify_code TEXT,
  verify_expires INTEGER,
  wa_group_opt INTEGER NOT NULL DEFAULT 0,
  remember INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  remember INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS waiters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  pin TEXT NOT NULL,
  photo TEXT,
  bio TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  waiter_id INTEGER NOT NULL REFERENCES waiters(id),
  work_date TEXT NOT NULL,
  table_from INTEGER NOT NULL,
  table_to INTEGER NOT NULL,
  UNIQUE(waiter_id, work_date)
);
CREATE TABLE IF NOT EXISTS tables (
  number INTEGER PRIMARY KEY,
  zone TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free','occupied','reserved'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  paid_code TEXT,
  customer_id INTEGER REFERENCES users(id),
  waiter_id INTEGER REFERENCES waiters(id),
  placed_by TEXT NOT NULL DEFAULT 'customer' CHECK (placed_by IN ('customer','waiter','admin')),
  table_number INTEGER,
  fulfillment TEXT NOT NULL CHECK (fulfillment IN ('dine_in','takeaway')),
  status TEXT NOT NULL DEFAULT 'received',
  payment_method TEXT,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','declared','paid','rejected')),
  currency TEXT NOT NULL DEFAULT 'MT',
  total INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  doneness INTEGER,
  extras TEXT,
  details TEXT,
  line_total INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES users(id),
  waiter_id INTEGER REFERENCES waiters(id),
  table_number INTEGER NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  closed_at TEXT
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  payload TEXT,
  seen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(payment_status, status);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_number);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status, table_number);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(work_date);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind, created_at);
`);

for (const sql of [
  'ALTER TABLE orders ADD COLUMN customer_name TEXT',
  'ALTER TABLE orders ADD COLUMN customer_phone TEXT',
  'ALTER TABLE orders ADD COLUMN place_label TEXT',
  'ALTER TABLE orders ADD COLUMN delivery_band TEXT',
  'ALTER TABLE orders ADD COLUMN delivery_fee INTEGER DEFAULT 0',
  'ALTER TABLE orders ADD COLUMN delivery_lat REAL',
  'ALTER TABLE orders ADD COLUMN delivery_lng REAL',
  'ALTER TABLE orders ADD COLUMN delivery_km REAL',
  'ALTER TABLE calls ADD COLUMN customer_name TEXT',
  'ALTER TABLE calls ADD COLUMN customer_phone TEXT',
  'ALTER TABLE orders ADD COLUMN payment_ref TEXT'
]) {
  try { db.exec(sql); } catch { /* column already exists */ }
}

export function todayISO() {
  const d = new Date();
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

function svgAvatar(name, hue) {
  const initials = name.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},85%,48%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},80%,32%)"/>
    </linearGradient></defs>
    <rect width="128" height="128" rx="64" fill="url(#g)"/>
    <text x="64" y="78" text-anchor="middle" font-family="Poppins,Arial" font-size="44" font-weight="800" fill="#fff">${initials}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function seedIfEmpty() {
  for (const z of ZONES) {
    db.prepare('UPDATE tables SET zone=? WHERE number BETWEEN ? AND ?').run(z.id, z.from, z.to);
  }
  const nWaiters = db.prepare('SELECT COUNT(*) AS c FROM waiters').get().c;
  const nTables = db.prepare('SELECT COUNT(*) AS c FROM tables').get().c;
  const nAdmin = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin'").get().c;

  if (!nTables) {
    const ins = db.prepare('INSERT INTO tables (number, zone, seats, status) VALUES (?,?,?,?)');
    transaction(() => {
      for (const z of ZONES) {
        for (let n = z.from; n <= z.to; n++) {
          const seats = n % 5 === 0 ? 8 : n % 2 === 0 ? 4 : 2;
          ins.run(n, z.id, seats, 'free');
        }
      }
    });
  }

  if (!nWaiters) {
    const waiters = [
      ['Amélia Nhampossa', '848110001', 'A vida à beira da piscina, com um sorriso.'],
      ['João Mucavele', '848110002', 'Especialista nas tábuas e no rooftop.'],
      ['Nádia Cossa', '848110003', 'Rápida, atenta aos detalhes do cocktail.'],
      ['Carlos Tembe', '848110004', 'Grelhados e ponto da carne no ponto certo.'],
      ['Sónia Machava', '848110005', 'Sala principal e grupos.'],
      ['Pedro Mondlane', '848110006', 'Bar e pedidos para levar.'],
      ['Lucrécia Dava', '848110007', 'Famílias e área jardim.'],
      ['Miguel Chissano', '848110008', 'Noite, vinhos e espirituosas.'],
      ['Beatriz Langa', '848110009', 'Pizzas, massas e pratos rápidos.'],
      ['Samuel Matola', '848110010', 'Marisco e mesas VIP.']
    ];
    const ins = db.prepare('INSERT INTO waiters (name, phone, pin, photo, bio, active) VALUES (?,?,?,?,?,1)');
    waiters.forEach((w, i) => {
      const pin = process.env.AQUA_WAITER_PIN_BASE
        ? String(Number(process.env.AQUA_WAITER_PIN_BASE) + i)
        : String(10000 + crypto.randomInt(89999));
      ins.run(w[0], '258' + w[1], pin, svgAvatar(w[0], 190 + i * 18), w[2]);
    });
    const date = todayISO();
    const ranges = [[1, 4], [5, 8], [9, 12], [13, 16], [17, 20], [21, 24], [25, 28], [29, 32], [33, 36], [37, 40]];
    const sh = db.prepare('INSERT INTO shifts (waiter_id, work_date, table_from, table_to) VALUES (?,?,?,?)');
    ranges.forEach((r, i) => sh.run(i + 1, date, r[0], r[1]));
  }

  if (!nAdmin) {
    const email = process.env.AQUA_ADMIN_EMAIL;
    const pass = process.env.AQUA_ADMIN_PASSWORD;
    if (email && pass && String(pass).length >= 8) {
      const hash = bcrypt.hashSync(String(pass), 10);
      db.prepare(`INSERT INTO users (role,name,email,phone,password_hash,email_verified)
        VALUES ('admin','Administração Aqua Club',?,?,?,1)`).run(String(email).trim().toLowerCase(), process.env.AQUA_ADMIN_PHONE || '', hash);
    }
    const cEmail = process.env.AQUA_DEMO_CUSTOMER_EMAIL;
    const cPass = process.env.AQUA_DEMO_CUSTOMER_PASSWORD;
    if (cEmail && cPass && String(cPass).length >= 8) {
      const ch = bcrypt.hashSync(String(cPass), 10);
      db.prepare(`INSERT INTO users (role,name,email,phone,password_hash,email_verified,wa_group_opt)
        VALUES ('customer','Cliente Demo',?,?,?,1,1)`).run(String(cEmail).trim().toLowerCase(), '', ch);
    }
  }
}

export function logEvent(kind, payload) {
  db.prepare('INSERT INTO events (kind, payload) VALUES (?,?)').run(kind, JSON.stringify(payload ?? {}));
}

export function addAlert(type, message, payload) {
  db.prepare('INSERT INTO alerts (type, message, payload) VALUES (?,?,?)')
    .run(type, message, JSON.stringify(payload ?? {}));
}

export function waiterForTable(tableNumber, date = todayISO()) {
  return db.prepare(`
    SELECT w.* FROM shifts s JOIN waiters w ON w.id = s.waiter_id
    WHERE s.work_date = ? AND ? BETWEEN s.table_from AND s.table_to AND w.active = 1
    LIMIT 1
  `).get(date, tableNumber) || null;
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    email: row.email,
    phone: row.phone,
    emailVerified: !!row.email_verified,
    waGroupOpt: !!row.wa_group_opt
  };
}
