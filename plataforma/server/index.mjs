import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { Server as SocketIO } from 'socket.io';
import { db, seedIfEmpty, todayISO, waiterForTable, publicUser, logEvent, addAlert, transaction } from './db.mjs';
import { MENU, CATEGORIES, DONENESS_SCALE, GLOBAL_EXTRAS, CLUB, ZONES, CALL_REASONS } from './catalog.mjs';

seedIfEmpty();

const PORT = Number(process.env.PORT || 5173);
const JWT_SECRET = process.env.JWT_SECRET || 'aqua-club-crbm-beira-secret-change-me';
const ROOT = path.join(process.cwd(), 'public');
const SITE = path.resolve(process.cwd(), '..', 'site');
const UPLOADS = path.join(process.cwd(), 'data', 'uploads');

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server, {
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
  pingInterval: 20000,
  pingTimeout: 20000
});

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression({ level: 4, threshold: 1024 }));
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '512kb' }));
app.use('/uploads', express.static(UPLOADS, { maxAge: '7d' }));
app.use(express.static(SITE, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.use('/os', express.static(ROOT, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, index: false }));
app.use(express.static(ROOT, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, index: false }));

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/socket.io')
});
app.use('/api/', limiter);
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 40 });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => cb(null, UPLOADS),
    filename: (_r, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
  }),
  limits: { fileSize: 2_000_000 }
});

const MENU_BY_ID = new Map(MENU.map((m) => [m.id, m]));
let orderSeq = Number(db.prepare('SELECT COUNT(*) AS c FROM orders').get().c);

function pad(n) { return String(n).padStart(4, '0'); }
function nextOrderCode() {
  orderSeq += 1;
  return 'AQ-' + pad(orderSeq);
}
function paidCode(openCode) {
  return openCode.replace('AQ-', 'AQ-PAY-');
}

function sign(user, remember) {
  return jwt.sign({ uid: user.id, role: user.role }, JWT_SECRET, { expiresIn: remember ? '30d' : '12h' });
}

function readUser(req) {
  const raw = req.cookies.aqua_token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!raw) return null;
  try {
    const p = jwt.verify(raw, JWT_SECRET);
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(p.uid);
    return row || null;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const u = readUser(req);
  if (!u) return res.status(401).json({ error: 'auth' });
  req.user = u;
  next();
}

function requireVerified(req, res, next) {
  if (!req.user.email_verified) return res.status(403).json({ error: 'verify' });
  next();
}

function requireAdmin(req, res, next) {
  const u = readUser(req);
  if (!u || u.role !== 'admin') return res.status(403).json({ error: 'admin' });
  req.user = u;
  next();
}

function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
}

function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && d[0] === '8') d = '258' + d;
  if (d.length === 12 && d.startsWith('258')) return d;
  return '';
}

function validMzPhone(d) {
  return /^2588[2-7]\d{7}$/.test(d);
}

function code6() {
  return String(crypto.randomInt(100000, 999999));
}

function emitAll(event, payload) {
  io.emit(event, payload);
}

function sendMail(email, subject, body) {
  db.prepare('INSERT INTO inbox (email, subject, body) VALUES (?,?,?)').run(email, subject, body);
}

function orderFull(id) {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o) return null;
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(id).map((it) => ({
    ...it,
    extras: JSON.parse(it.extras || '[]'),
    details: JSON.parse(it.details || '{}')
  }));
  o.customer = o.customer_id ? publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(o.customer_id)) : null;
  o.waiter = o.waiter_id ? db.prepare('SELECT id,name,photo,phone,bio FROM waiters WHERE id=?').get(o.waiter_id) : null;
  const del = o.items.find((it) => it.item_id === 'delivery');
  const lat = o.delivery_lat || del?.details?.lat;
  const lng = o.delivery_lng || del?.details?.lng;
  if (lat && lng) {
    o.lat = lat;
    o.lng = lng;
    o.mapsUrl = 'https://www.google.com/maps?q=' + lat + ',' + lng;
    o.navUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng + '&travelmode=driving';
  }
  o.address = o.address || del?.details?.address || '';
  return o;
}

function maybeSpikeAlert() {
  const c = db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE created_at >= datetime('now','-10 minutes')`).get().c;
  if (c >= 30) {
    const already = db.prepare(`SELECT COUNT(*) AS c FROM alerts WHERE type='spike' AND created_at >= datetime('now','-10 minutes')`).get().c;
    if (!already) {
      addAlert('spike', 'Excesso de pedidos: ' + c + ' nos últimos 10 minutos.', { count: c });
      emitAll('alert:new', { type: 'spike', count: c });
    }
  }
}

function maybeCustomerAlert(customerId) {
  if (!customerId) return;
  const c = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE customer_id=?').get(customerId).c;
  if (c >= 30 && c % 30 === 0) {
    addAlert('customer_volume', 'Cliente com ' + c + ' pedidos registados — rever conta.', { customerId, count: c });
    emitAll('alert:new', { type: 'customer_volume', customerId, count: c });
  }
}

/* ---------- public ---------- */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: Date.now(), users: 'ready' });
});

app.get('/api/catalog', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
  res.json({ club: CLUB, menu: MENU, categories: CATEGORIES, extras: GLOBAL_EXTRAS, doneness: DONENESS_SCALE, zones: ZONES, reasons: CALL_REASONS });
});

app.get('/api/tables', (_req, res) => {
  const tables = db.prepare('SELECT * FROM tables ORDER BY number').all();
  const date = todayISO();
  const shifts = db.prepare(`
    SELECT s.*, w.name AS waiter_name, w.photo AS waiter_photo, w.bio AS waiter_bio, w.phone AS waiter_phone, w.id AS waiter_id
    FROM shifts s JOIN waiters w ON w.id=s.waiter_id WHERE s.work_date=? AND w.active=1
  `).all(date);
  res.json({ tables, shifts, date });
});

app.get('/api/waiter-for-table/:n', (req, res) => {
  const n = Number(req.params.n);
  const w = waiterForTable(n);
  if (!w) return res.json({ waiter: null });
  res.json({ waiter: { id: w.id, name: w.name, photo: w.photo, bio: w.bio, phone: w.phone } });
});

/* ---------- auth ---------- */
app.post('/api/auth/register', authLimiter, (req, res) => {
  const { name, email, phone, password, confirm, waGroupOpt, remember } = req.body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'name' });
  if (!validEmail(email)) return res.status(400).json({ error: 'email' });
  const ph = normPhone(phone);
  if (!validMzPhone(ph)) return res.status(400).json({ error: 'phone' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'password' });
  if (password !== confirm) return res.status(400).json({ error: 'confirm' });
  const exists = db.prepare('SELECT id FROM users WHERE email=? OR phone=?').get(String(email).toLowerCase(), ph);
  if (exists) return res.status(409).json({ error: 'exists' });
  const hash = bcrypt.hashSync(password, 10);
  const code = code6();
  const info = db.prepare(`INSERT INTO users (role,name,email,phone,password_hash,email_verified,verify_code,verify_expires,wa_group_opt,remember)
    VALUES ('customer',?,?,?,?,0,?,?,?,?)`).run(
    String(name).trim(), String(email).toLowerCase().trim(), ph, hash, code, Date.now() + 15 * 60_000, waGroupOpt ? 1 : 0, remember ? 1 : 0
  );
  sendMail(email, 'Código Aqua Club', 'O seu código de verificação é ' + code + '. Válido 15 minutos.');
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(Number(info.lastInsertRowid));
  const token = sign(user, !!remember);
  res.cookie('aqua_token', token, cookieOpts(!!remember));
  res.json({ user: publicUser(user), needsVerify: true, demoCode: code, waGroup: waGroupOpt ? CLUB.whatsappGroup : null });
});

app.post('/api/auth/verify', requireAuth, (req, res) => {
  const code = String((req.body || {}).code || '').trim();
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (u.email_verified) return res.json({ user: publicUser(u) });
  if (!u.verify_code || Date.now() > u.verify_expires) return res.status(400).json({ error: 'expired' });
  if (code !== u.verify_code) return res.status(400).json({ error: 'code' });
  db.prepare('UPDATE users SET email_verified=1, verify_code=NULL WHERE id=?').run(u.id);
  res.json({ user: publicUser({ ...u, email_verified: 1 }), waGroup: u.wa_group_opt ? CLUB.whatsappGroup : null });
});

app.post('/api/auth/resend', requireAuth, authLimiter, (req, res) => {
  const code = code6();
  db.prepare('UPDATE users SET verify_code=?, verify_expires=? WHERE id=?').run(code, Date.now() + 15 * 60_000, req.user.id);
  sendMail(req.user.email, 'Novo código Aqua Club', 'O seu código de verificação é ' + code + '.');
  res.json({ ok: true, demoCode: code });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password, remember } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase().trim());
  if (!u || !bcrypt.compareSync(password || '', u.password_hash)) return res.status(401).json({ error: 'creds' });
  const token = sign(u, !!remember);
  res.cookie('aqua_token', token, cookieOpts(!!remember));
  res.json({ user: publicUser(u), needsVerify: !u.email_verified });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('aqua_token', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const u = readUser(req);
  res.json({ user: publicUser(u) });
});

app.get('/api/dev/inbox', requireAdmin, (_req, res) => {
  res.json({ inbox: db.prepare('SELECT * FROM inbox ORDER BY id DESC LIMIT 50').all() });
});

function cookieOpts(remember) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: remember ? 30 * 24 * 3600 * 1000 : 12 * 3600 * 1000
  };
}

/* ---------- customer orders ---------- */
function computeLines(rawLines) {
  if (!Array.isArray(rawLines) || !rawLines.length) throw Object.assign(new Error('lines'), { status: 400 });
  const items = [];
  let total = 0;
  for (const line of rawLines.slice(0, 80)) {
    const menu = MENU_BY_ID.get(line.itemId);
    if (!menu || !menu.available) throw Object.assign(new Error('item'), { status: 400 });
    const qty = Math.min(20, Math.max(1, Number(line.qty) || 1));
    let extraSum = 0;
    const extras = [];
    for (const ex of line.extras || []) {
      const def = [...(menu.extras || []), ...GLOBAL_EXTRAS].find((e) => e.id === ex);
      if (def) { extras.push(def); extraSum += def.price; }
    }
    let doneness = null;
    if (menu.doneness) {
      doneness = Math.min(100, Math.max(0, Number(line.doneness ?? 60)));
    }
    const details = line.details && typeof line.details === 'object' ? line.details : {};
    const unit = menu.price + extraSum;
    const lineTotal = unit * qty;
    total += lineTotal;
    items.push({
      item_id: menu.id,
      name: menu.pt,
      qty,
      unit_price: unit,
      doneness,
      extras: JSON.stringify(extras.map((e) => e.id)),
      details: JSON.stringify(details),
      line_total: lineTotal
    });
  }
  return { items, total };
}

const DELIVERY_FEES = { city: 150, mid: 200, far: 250 };
const CLUB_GEO = { lat: CLUB.lat || -19.8436, lng: CLUB.lng || 34.8389 };
function kmBetween(a, b, c, d) {
  const R = 6371, to = (x) => x * Math.PI / 180, dLat = to(c - a), dLng = to(d - b);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(to(a)) * Math.cos(to(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function bandFromKm(km) { return km <= 6 ? 'city' : km <= 15 ? 'mid' : 'far'; }
function guestName(body, user) {
  return String(body.name || body.customerName || user?.name || '').trim().slice(0, 80);
}
function guestPhone(body, user) {
  return normPhone(body.phone || body.customerPhone) || user?.phone || '';
}

app.post('/api/orders', (req, res) => {
  const user = readUser(req);
  const body = req.body || {};
  const name = guestName(body, user);
  const phone = guestPhone(body, user);
  if (user && user.role !== 'customer' && user.role !== 'admin') return res.status(403).json({ error: 'role' });
  if (!user && (name.length < 2 || !phone)) return res.status(400).json({ error: 'guest' });
  const fulfillment = body.fulfillment === 'takeaway' ? 'takeaway' : 'dine_in';
  const takeMode = String(body.take || body.takeawayMode || '');
  let tableNumber = body.tableNumber != null ? Number(body.tableNumber) : null;
  if (fulfillment === 'dine_in') {
    if (!tableNumber || tableNumber < 1 || tableNumber > 40) return res.status(400).json({ error: 'table' });
  } else {
    tableNumber = tableNumber || null;
  }
  if (body.currency && body.currency !== 'MT') return res.status(400).json({ error: 'currency' });
  let computed;
  try { computed = computeLines(body.lines); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

  let band = '';
  let fee = 0;
  let km = null;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);
  if (fulfillment === 'takeaway' && takeMode !== 'pickup') {
    if (!hasPin) return res.status(400).json({ error: 'gps' });
    km = Math.round(kmBetween(CLUB_GEO.lat, CLUB_GEO.lng, lat, lng) * 10) / 10;
    band = bandFromKm(km);
    fee = DELIVERY_FEES[band];
    computed.items.push({
      item_id: 'delivery',
      name: 'Entrega (' + (band === 'city' ? 'cidade' : band === 'mid' ? 'arredores' : 'longe') + ')',
      qty: 1,
      unit_price: fee,
      doneness: null,
      extras: '[]',
      details: JSON.stringify({ band, km, address: String(body.address || '').slice(0, 200), lat, lng }),
      line_total: fee
    });
    computed.total += fee;
  }
  const waiter = tableNumber ? waiterForTable(tableNumber) : null;
  const code = nextOrderCode();
  const placeLabel = String(body.placeLabel || '').slice(0, 200);
  const note = [name, phone, placeLabel, body.address, hasPin ? ('GPS ' + lat + ',' + lng) : '', body.waGroupOpt ? 'Grupo WA: sim' : '', body.note]
    .filter(Boolean).join(' · ').slice(0, 800);
  const info = db.prepare(`INSERT INTO orders (code, customer_id, waiter_id, placed_by, table_number, fulfillment, status, currency, total, note, customer_name, customer_phone, place_label, delivery_band, delivery_fee, delivery_lat, delivery_lng, delivery_km)
    VALUES (?,?,?,?,?,?, 'review', 'MT', ?,?,?,?,?,?,?,?,?,?)`).run(
    code, user?.id || null, waiter?.id || null, 'customer', tableNumber, fulfillment, computed.total, note,
    name, phone, placeLabel, band || null, fee, hasPin ? lat : null, hasPin ? lng : null, km
  );
  const oid = Number(info.lastInsertRowid);
  const ins = db.prepare(`INSERT INTO order_items (order_id,item_id,name,qty,unit_price,doneness,extras,details,line_total) VALUES (?,?,?,?,?,?,?,?,?)`);
  transaction(() => {
    for (const it of computed.items) ins.run(oid, it.item_id, it.name, it.qty, it.unit_price, it.doneness, it.extras, it.details, it.line_total);
    if (tableNumber) db.prepare("UPDATE tables SET status='occupied' WHERE number=? AND status='free'").run(tableNumber);
  });
  logEvent('order', { id: oid, code });
  maybeSpikeAlert();
  if (user) maybeCustomerAlert(user.id);
  const full = orderFull(oid);
  emitAll('order:new', full);
  if (waiter) emitAll('waiter:notify', { waiterId: waiter.id, type: 'order', tableNumber, order: full });
  res.json({ order: full });
});

app.get('/api/orders/mine', requireAuth, (req, res) => {
  const pay = req.query.pay;
  const status = req.query.status;
  let sql = 'SELECT * FROM orders WHERE customer_id=?';
  const args = [req.user.id];
  if (pay === 'paid' || pay === 'unpaid' || pay === 'declared') {
    sql += ' AND payment_status=?'; args.push(pay);
  }
  if (status) { sql += ' AND status=?'; args.push(String(status)); }
  sql += ' ORDER BY id DESC LIMIT 200';
  const rows = db.prepare(sql).all(...args).map((o) => orderFull(o.id));
  const stats = db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS spent,
    SUM(CASE WHEN payment_status='paid' THEN 1 ELSE 0 END) AS paid,
    SUM(CASE WHEN payment_status!='paid' THEN 1 ELSE 0 END) AS open
    FROM orders WHERE customer_id=?`).get(req.user.id);
  res.json({ orders: rows, stats });
});

app.get('/api/orders/status', (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!code) return res.status(400).json({ error: 'code' });
  const o = db.prepare('SELECT id, code, status, payment_status, payment_method, payment_ref, total, driver_ok, client_ok FROM orders WHERE code=?').get(code);
  if (!o) return res.status(404).json({ error: 'missing' });
  res.json({ order: o });
});

function settleDelivery(id) {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o || o.status === 'cancelled') return o;
  if (o.driver_ok && o.client_ok && o.status !== 'delivered') {
    db.prepare("UPDATE orders SET status='delivered' WHERE id=?").run(id);
  } else if ((o.driver_ok || o.client_ok) && (o.status === 'ready' || o.status === 'preparing')) {
    db.prepare("UPDATE orders SET status='on_the_way' WHERE id=?").run(id);
  }
  return db.prepare('SELECT * FROM orders WHERE id=?').get(id);
}

app.post('/api/orders/confirm-delivery', (req, res) => {
  const code = String((req.body || {}).code || '').trim();
  if (!code) return res.status(400).json({ error: 'code' });
  const o = db.prepare('SELECT * FROM orders WHERE code=?').get(code);
  if (!o) return res.status(404).json({ error: 'missing' });
  db.prepare('UPDATE orders SET client_ok=1 WHERE id=?').run(o.id);
  settleDelivery(o.id);
  const full = orderFull(o.id);
  emitAll('order:updated', full);
  res.json({ order: full });
});

app.post('/api/orders/:id/pay', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'missing' });
  const user = readUser(req);
  const body = req.body || {};
  const codeOk = String(body.code || '').trim() === o.code;
  const owner = user && (o.customer_id === user.id || user.role === 'admin');
  if (!owner && !codeOk) return res.status(403).json({ error: 'owner' });
  const method = String(body.method || '');
  if (!['mpesa', 'emola', 'pos'].includes(method)) return res.status(400).json({ error: 'method' });
  if (body.currency && body.currency !== 'MT') return res.status(400).json({ error: 'currency' });
  const payMeta = CLUB.payments[method] || {};
  const number = method === 'pos' ? null : payMeta.digits;
  if (body.payTo && String(body.payTo).replace(/\D/g, '') !== String(number || '').replace(/\D/g, '') && method !== 'pos') {
    return res.status(400).json({ error: 'pay_to' });
  }
  const ref = String(body.ref || body.payment_ref || '').trim().slice(0, 80);
  db.prepare("UPDATE orders SET payment_method=?, payment_status='declared', payment_ref=? WHERE id=? AND payment_status IN ('unpaid','declared')")
    .run(method, ref || o.payment_ref || null, o.id);
  const full = orderFull(o.id);
  emitAll('order:updated', full);
  res.json({ order: full, payTo: payMeta });
});

/* ---------- calls ---------- */
app.get('/api/live/calls', (_req, res) => {
  const calls = db.prepare(`SELECT id, table_number, reason, note, status, created_at, accepted_at, closed_at, customer_name, customer_phone, waiter_id
    FROM calls WHERE status IN ('pending','accepted') OR datetime(COALESCE(closed_at, created_at)) >= datetime('now','-1 day')
    ORDER BY id DESC LIMIT 120`).all();
  res.json({ calls });
});

function callPayload(call) {
  if (!call) return null;
  const w = call.waiter_id ? db.prepare('SELECT name FROM waiters WHERE id=?').get(call.waiter_id) : null;
  return { ...call, waiterName: w?.name || null };
}

app.post('/api/live/calls/:id/accept', (req, res) => {
  const a = deskAuth(req);
  const id = Number(req.params.id);
  const waiterId = a?.waiter?.id || null;
  db.prepare("UPDATE calls SET status='accepted', accepted_at=datetime('now'), waiter_id=COALESCE(?, waiter_id) WHERE id=? AND status='pending'").run(waiterId, id);
  const call = db.prepare('SELECT * FROM calls WHERE id=?').get(id);
  if (!call) return res.status(404).json({ error: 'missing' });
  const payload = callPayload(call);
  emitAll('call:updated', payload);
  res.json({ call: payload });
});

app.post('/api/live/calls/:id/close', (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE calls SET status='closed', closed_at=datetime('now') WHERE id=? AND status IN ('pending','accepted')").run(id);
  const call = db.prepare('SELECT * FROM calls WHERE id=?').get(id);
  if (!call) return res.status(404).json({ error: 'missing' });
  const payload = callPayload(call);
  emitAll('call:updated', payload);
  res.json({ call: payload });
});

app.post('/api/calls', (req, res) => {
  const user = readUser(req);
  const body = req.body || {};
  const tableNumber = Number(body.tableNumber);
  const reason = String(body.reason || '');
  if (!tableNumber || tableNumber < 1 || tableNumber > 40) return res.status(400).json({ error: 'table' });
  if (!CALL_REASONS.some((r) => r.id === reason)) return res.status(400).json({ error: 'reason' });
  const name = guestName(body, user);
  const phone = guestPhone(body, user);
  const waiter = waiterForTable(tableNumber);
  const note = [body.note, name, phone].filter(Boolean).join(' · ').slice(0, 240);
  const info = db.prepare(`INSERT INTO calls (customer_id, waiter_id, table_number, reason, note, status, customer_name, customer_phone)
    VALUES (?,?,?,?,?,'pending',?,?)`).run(user?.id || null, waiter?.id || null, tableNumber, reason, note, name || null, phone || null);
  const call = db.prepare('SELECT * FROM calls WHERE id=?').get(Number(info.lastInsertRowid));
  const payload = { ...call, waiterName: waiter?.name, customerName: name || user?.name || '' };
  emitAll('call:new', payload);
  emitAll('call:updated', payload);
  if (waiter) emitAll('waiter:notify', { waiterId: waiter.id, type: 'call', tableNumber, reason, call: payload });
  res.json({ call: payload, waiter: waiter ? { id: waiter.id, name: waiter.name, photo: waiter.photo } : null });
});

app.get('/api/calls/:id', (req, res) => {
  const call = db.prepare('SELECT id, status, table_number, reason, waiter_id, created_at, accepted_at, closed_at FROM calls WHERE id=?').get(Number(req.params.id));
  if (!call) return res.status(404).json({ error: 'missing' });
  const waiter = call.waiter_id ? db.prepare('SELECT id, name FROM waiters WHERE id=?').get(call.waiter_id) : null;
  res.json({ call: { ...call, waiterName: waiter?.name || null } });
});

app.post('/api/calls/:id/cancel', (req, res) => {
  const id = Number(req.params.id);
  const call = db.prepare('SELECT * FROM calls WHERE id=?').get(id);
  if (!call) return res.status(404).json({ error: 'missing' });
  if (call.status !== 'pending') return res.status(400).json({ error: 'status' });
  db.prepare("UPDATE calls SET status='cancelled', closed_at=datetime('now') WHERE id=?").run(id);
  const next = db.prepare('SELECT * FROM calls WHERE id=?').get(id);
  emitAll('call:updated', next);
  res.json({ call: next });
});

/* ---------- staff kiosk (PIN, not a personal account) ---------- */
app.post('/api/staff/open', (req, res) => {
  const { waiterId, pin } = req.body || {};
  const w = db.prepare('SELECT * FROM waiters WHERE id=? AND active=1').get(Number(waiterId));
  if (!w || String(w.pin) !== String(pin)) return res.status(401).json({ error: 'pin' });
  const shift = db.prepare('SELECT * FROM shifts WHERE waiter_id=? AND work_date=?').get(w.id, todayISO());
  const token = jwt.sign({ wid: w.id, kind: 'staff' }, JWT_SECRET, { expiresIn: '14h' });
  res.json({ token, waiter: { id: w.id, name: w.name, photo: w.photo, bio: w.bio, phone: w.phone }, shift });
});

function staffFrom(req) {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!raw) return null;
  try {
    const p = jwt.verify(raw, JWT_SECRET);
    if (p.kind !== 'staff') return null;
    return db.prepare('SELECT * FROM waiters WHERE id=? AND active=1').get(p.wid);
  } catch { return null; }
}

app.get('/api/staff/board', (req, res) => {
  const w = staffFrom(req);
  if (!w) return res.status(401).json({ error: 'staff' });
  const shift = db.prepare('SELECT * FROM shifts WHERE waiter_id=? AND work_date=?').get(w.id, todayISO());
  const from = shift?.table_from ?? 0;
  const to = shift?.table_to ?? 0;
  const calls = db.prepare(`SELECT * FROM calls ORDER BY id DESC LIMIT 120`).all();
  const orders = db.prepare(`SELECT * FROM orders ORDER BY id DESC LIMIT 120`).all()
    .map((o) => orderFull(o.id));
  const tables = db.prepare('SELECT * FROM tables WHERE number BETWEEN ? AND ? ORDER BY number').all(from, to);
  res.json({ waiter: { id: w.id, name: w.name, photo: w.photo }, shift, calls, orders, tables });
});

app.post('/api/staff/orders', (req, res) => {
  const w = staffFrom(req);
  if (!w) return res.status(401).json({ error: 'staff' });
  const body = req.body || {};
  const tableNumber = Number(body.tableNumber);
  if (!tableNumber) return res.status(400).json({ error: 'table' });
  const shift = db.prepare('SELECT * FROM shifts WHERE waiter_id=? AND work_date=?').get(w.id, todayISO());
  if (!shift || tableNumber < shift.table_from || tableNumber > shift.table_to) return res.status(403).json({ error: 'range' });
  let computed;
  try { computed = computeLines(body.lines); }
  catch (e) { return res.status(400).json({ error: 'lines' }); }
  const customerId = body.customerId ? Number(body.customerId) : null;
  const code = nextOrderCode();
  const info = db.prepare(`INSERT INTO orders (code, customer_id, waiter_id, placed_by, table_number, fulfillment, status, currency, total, note)
    VALUES (?,?,?,?,?,'dine_in','received','MT',?,?)`).run(code, customerId, w.id, 'waiter', tableNumber, computed.total, String(body.note || '').slice(0, 400));
  const oid = Number(info.lastInsertRowid);
  const ins = db.prepare(`INSERT INTO order_items (order_id,item_id,name,qty,unit_price,doneness,extras,details,line_total) VALUES (?,?,?,?,?,?,?,?,?)`);
  transaction(() => {
    for (const it of computed.items) ins.run(oid, it.item_id, it.name, it.qty, it.unit_price, it.doneness, it.extras, it.details, it.line_total);
    db.prepare("UPDATE tables SET status='occupied' WHERE number=? AND status='free'").run(tableNumber);
  });
  const full = orderFull(oid);
  emitAll('order:new', full);
  res.json({ order: full });
});

app.post('/api/staff/calls/:id/accept', (req, res) => {
  const w = staffFrom(req);
  if (!w) return res.status(401).json({ error: 'staff' });
  db.prepare("UPDATE calls SET status='accepted', accepted_at=datetime('now'), waiter_id=? WHERE id=? AND status='pending'").run(w.id, Number(req.params.id));
  const call = db.prepare('SELECT * FROM calls WHERE id=?').get(Number(req.params.id));
  emitAll('call:updated', { ...call, waiterName: w.name });
  emitAll('waiter:notify', { waiterId: w.id, type: 'call-accepted', tableNumber: call.table_number, call });
  res.json({ call });
});

function deskAuth(req) {
  const u = readUser(req);
  if (u && u.role === 'admin') return { kind: 'admin', user: u };
  const w = staffFrom(req);
  if (w) return { kind: 'staff', waiter: w };
  return null;
}

app.get('/api/desk/board', (req, res) => {
  const a = deskAuth(req);
  if (!a) return res.status(401).json({ error: 'auth' });
  const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all().map((o) => orderFull(o.id));
  const calls = db.prepare('SELECT * FROM calls ORDER BY id DESC LIMIT 200').all();
  res.json({
    role: a.kind,
    name: a.user?.name || a.waiter?.name,
    orders,
    calls,
    payments: CLUB.payments
  });
});

app.patch('/api/desk/orders/:id', (req, res) => {
  const a = deskAuth(req);
  if (!a) return res.status(401).json({ error: 'auth' });
  const full = applyOrderPatch(Number(req.params.id), req.body || {});
  if (!full) return res.status(404).json({ error: 'missing' });
  res.json({ order: full });
});

app.patch('/api/staff/orders/:id', (req, res) => {
  const w = staffFrom(req);
  if (!w) return res.status(401).json({ error: 'staff' });
  const full = applyOrderPatch(Number(req.params.id), req.body || {});
  if (!full) return res.status(404).json({ error: 'missing' });
  res.json({ order: full });
});

app.post('/api/staff/calls/:id/close', (req, res) => {
  const w = staffFrom(req);
  if (!w) return res.status(401).json({ error: 'staff' });
  db.prepare("UPDATE calls SET status='closed', closed_at=datetime('now') WHERE id=? AND waiter_id=?").run(Number(req.params.id), w.id);
  const call = db.prepare('SELECT * FROM calls WHERE id=?').get(Number(req.params.id));
  emitAll('call:updated', call);
  res.json({ call });
});

/* ---------- admin ---------- */
app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const kpis = db.prepare(`SELECT
    (SELECT COUNT(*) FROM orders) AS orders,
    (SELECT COALESCE(SUM(total),0) FROM orders WHERE payment_status='paid') AS revenue,
    (SELECT COALESCE(SUM(total),0) FROM orders WHERE date(created_at)=date('now') AND payment_status='paid') AS todayPaid,
    (SELECT COALESCE(SUM(total),0) FROM orders WHERE payment_status!='paid' AND status!='cancelled') AS unpaidSum,
    (SELECT COUNT(*) FROM orders WHERE payment_status!='paid' AND status!='cancelled') AS unpaid,
    (SELECT COUNT(*) FROM orders WHERE status IN ('review','received')) AS inReview,
    (SELECT COUNT(*) FROM orders WHERE status='preparing') AS preparing,
    (SELECT COUNT(*) FROM calls WHERE status='pending') AS pendingCalls,
    (SELECT COUNT(*) FROM calls WHERE status='accepted') AS liveCalls,
    (SELECT COUNT(*) FROM tables WHERE status='occupied') AS occupied,
    (SELECT COUNT(*) FROM tables WHERE status='reserved') AS reserved,
    (SELECT COUNT(*) FROM tables WHERE status='free') AS free,
    (SELECT COUNT(*) FROM users WHERE role='customer') AS customers,
    (SELECT COUNT(*) FROM alerts WHERE seen=0) AS alerts
  `).get();
  const recent = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all().map((o) => orderFull(o.id));
  const calls = db.prepare('SELECT * FROM calls ORDER BY id DESC LIMIT 200').all();
  const alerts = db.prepare('SELECT * FROM alerts ORDER BY id DESC LIMIT 30').all();
  const waiters = db.prepare('SELECT id,name,phone,photo,bio,active FROM waiters ORDER BY id').all();
  const shifts = db.prepare('SELECT * FROM shifts WHERE work_date=?').all(todayISO());
  const tables = db.prepare('SELECT * FROM tables ORDER BY number').all();
  const byHour = db.prepare(`SELECT strftime('%H', created_at) AS h, COUNT(*) AS c, COALESCE(SUM(total),0) AS t
    FROM orders WHERE created_at >= datetime('now','-1 day') GROUP BY h ORDER BY h`).all();
  const byDay = db.prepare(`SELECT date(created_at) AS d, COUNT(*) AS c,
      COALESCE(SUM(total),0) AS t,
      COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END),0) AS paid
    FROM orders WHERE created_at >= datetime('now','-7 days') GROUP BY d ORDER BY d`).all();
  const payMix = db.prepare(`SELECT payment_status AS k, COUNT(*) AS c, COALESCE(SUM(total),0) AS t FROM orders GROUP BY payment_status`).all();
  const byFulfillment = db.prepare(`SELECT fulfillment AS k, COUNT(*) AS c, COALESCE(SUM(total),0) AS t FROM orders GROUP BY fulfillment`).all();
  const byCat = db.prepare(`SELECT item_id, name, SUM(qty) AS qty, SUM(line_total) AS total FROM order_items
    GROUP BY item_id ORDER BY qty DESC LIMIT 12`).all();
  const callWait = db.prepare(`SELECT AVG((julianday(COALESCE(accepted_at, closed_at)) - julianday(created_at)) * 86400) AS avg_sec,
      COUNT(*) AS n FROM calls WHERE accepted_at IS NOT NULL OR closed_at IS NOT NULL`).get();
  const waiterStats = db.prepare(`SELECT w.id, w.name, w.photo,
    (SELECT COUNT(*) FROM orders o WHERE o.waiter_id=w.id) AS orders,
    (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.waiter_id=w.id AND o.payment_status='paid') AS revenue,
    (SELECT COUNT(*) FROM calls c WHERE c.waiter_id=w.id) AS calls,
    (SELECT COUNT(*) FROM calls c WHERE c.waiter_id=w.id AND c.status='closed') AS closed,
    (SELECT AVG((julianday(COALESCE(c.accepted_at, c.closed_at)) - julianday(c.created_at)) * 86400) FROM calls c WHERE c.waiter_id=w.id AND (c.accepted_at IS NOT NULL OR c.closed_at IS NOT NULL)) AS avg_sec
    FROM waiters w`).all();
  res.json({ kpis, recent, calls, alerts, waiters, shifts, tables, byHour, byDay, payMix, byFulfillment, byCat, waiterStats, callWait, date: todayISO() });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const pay = req.query.pay;
  let sql = 'SELECT id FROM orders WHERE 1=1';
  const args = [];
  if (pay) { sql += ' AND payment_status=?'; args.push(pay); }
  if (req.query.table) { sql += ' AND table_number=?'; args.push(Number(req.query.table)); }
  sql += ' ORDER BY id DESC LIMIT 300';
  res.json({ orders: db.prepare(sql).all(...args).map((r) => orderFull(r.id)) });
});

function applyOrderPatch(id, body = {}) {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o) return null;
  const { status, payment_status, payment_method, payment_ref, driver_ok, client_ok } = body;
  const allowed = ['review', 'received', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled', 'no_confirm'];
  if (driver_ok) db.prepare('UPDATE orders SET driver_ok=1 WHERE id=?').run(id);
  if (client_ok) db.prepare('UPDATE orders SET client_ok=1 WHERE id=?').run(id);
  if (status === 'delivered') {
    db.prepare('UPDATE orders SET driver_ok=1 WHERE id=?').run(id);
    const cur = db.prepare('SELECT client_ok FROM orders WHERE id=?').get(id);
    if (!cur.client_ok) {
      db.prepare("UPDATE orders SET status='on_the_way' WHERE id=? AND status NOT IN ('delivered','cancelled')").run(id);
    } else {
      db.prepare("UPDATE orders SET status='delivered' WHERE id=?").run(id);
    }
  } else if (status && allowed.includes(status) && status !== 'delivered') {
    db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, id);
  }
  settleDelivery(id);
  if (payment_ref) db.prepare('UPDATE orders SET payment_ref=? WHERE id=?').run(String(payment_ref).slice(0, 80), id);
  if (payment_status === 'paid') {
    const pc = o.paid_code || paidCode(o.code);
    const method = ['mpesa', 'emola', 'pos', 'cash', 'card'].includes(payment_method) ? payment_method : (o.payment_method || 'pos');
    const cur = db.prepare('SELECT status FROM orders WHERE id=?').get(id);
    db.prepare("UPDATE orders SET payment_status='paid', payment_method=?, paid_code=?, paid_at=datetime('now') WHERE id=?").run(method, pc, id);
    if (!status && ['review', 'received', 'no_confirm'].includes(cur.status)) {
      db.prepare("UPDATE orders SET status='preparing' WHERE id=?").run(id);
    }
  } else if (payment_status === 'rejected' || payment_status === 'no_confirm') {
    db.prepare("UPDATE orders SET payment_status='unpaid', status='no_confirm' WHERE id=?").run(id);
  } else if (payment_status === 'declared') {
    db.prepare("UPDATE orders SET payment_status='declared' WHERE id=?").run(id);
  }
  logEvent('admin_order', { id, status, payment_status });
  const full = orderFull(id);
  emitAll('order:updated', full);
  return full;
}

app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const full = applyOrderPatch(Number(req.params.id), req.body || {});
  if (!full) return res.status(404).json({ error: 'missing' });
  res.json({ order: full });
});

app.patch('/api/admin/tables/:n', requireAdmin, (req, res) => {
  const n = Number(req.params.n);
  const status = String((req.body || {}).status || '');
  if (!['free', 'occupied', 'reserved'].includes(status)) return res.status(400).json({ error: 'status' });
  db.prepare('UPDATE tables SET status=? WHERE number=?').run(status, n);
  const table = db.prepare('SELECT * FROM tables WHERE number=?').get(n);
  emitAll('table:updated', table);
  res.json({ table });
});

app.post('/api/admin/waiters', requireAdmin, upload.single('photo'), (req, res) => {
  const { name, phone, pin, bio } = req.body || {};
  if (!name || !pin) return res.status(400).json({ error: 'fields' });
  const photo = req.file ? '/uploads/' + req.file.filename : null;
  const info = db.prepare('INSERT INTO waiters (name,phone,pin,photo,bio,active) VALUES (?,?,?,?,?,1)')
    .run(name, normPhone(phone) || phone, String(pin), photo, bio || '');
  res.json({ waiter: db.prepare('SELECT id,name,phone,photo,bio,active FROM waiters WHERE id=?').get(Number(info.lastInsertRowid)) });
});

app.patch('/api/admin/waiters/:id', requireAdmin, upload.single('photo'), (req, res) => {
  const id = Number(req.params.id);
  const w = db.prepare('SELECT * FROM waiters WHERE id=?').get(id);
  if (!w) return res.status(404).json({ error: 'missing' });
  const name = req.body.name ?? w.name;
  const phone = req.body.phone ?? w.phone;
  const pin = req.body.pin ?? w.pin;
  const bio = req.body.bio ?? w.bio;
  const active = req.body.active != null ? Number(req.body.active) : w.active;
  const photo = req.file ? '/uploads/' + req.file.filename : w.photo;
  db.prepare('UPDATE waiters SET name=?, phone=?, pin=?, bio=?, active=?, photo=? WHERE id=?')
    .run(name, phone, pin, bio, active, photo, id);
  res.json({ waiter: db.prepare('SELECT id,name,phone,photo,bio,active FROM waiters WHERE id=?').get(id) });
});

app.post('/api/admin/shifts', requireAdmin, (req, res) => {
  const { waiterId, workDate, tableFrom, tableTo } = req.body || {};
  const date = workDate || todayISO();
  const tf = Number(tableFrom), tt = Number(tableTo);
  if (!waiterId || tf < 1 || tt > 40 || tf > tt) return res.status(400).json({ error: 'range' });
  db.prepare(`INSERT INTO shifts (waiter_id, work_date, table_from, table_to) VALUES (?,?,?,?)
    ON CONFLICT(waiter_id, work_date) DO UPDATE SET table_from=excluded.table_from, table_to=excluded.table_to`)
    .run(Number(waiterId), date, tf, tt);
  res.json({ ok: true, shifts: db.prepare('SELECT * FROM shifts WHERE work_date=?').all(date) });
});

app.post('/api/admin/alerts/:id/seen', requireAdmin, (req, res) => {
  db.prepare('UPDATE alerts SET seen=1 WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY id').all();
  const header = 'id,code,table,fulfillment,status,payment,total,created\n';
  const body = rows.map((o) => [o.id, o.code, o.table_number, o.fulfillment, o.status, o.payment_status, o.total, o.created_at].join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="aqua-orders.csv"');
  res.send('\uFEFF' + header + body);
});

app.get('/api/admin/export.xls', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY id').all();
  const cells = rows.map((o) => `<tr><td>${o.id}</td><td>${o.code}</td><td>${o.table_number || ''}</td><td>${o.fulfillment}</td><td>${o.payment_status}</td><td>${o.total}</td><td>${o.created_at}</td></tr>`).join('');
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Pedidos"><Table>
<Row><Cell><Data ss:Type="String">ID</Data></Cell><Cell><Data ss:Type="String">Código</Data></Cell><Cell><Data ss:Type="String">Mesa</Data></Cell><Cell><Data ss:Type="String">Tipo</Data></Cell><Cell><Data ss:Type="String">Pagamento</Data></Cell><Cell><Data ss:Type="String">Total MT</Data></Cell><Cell><Data ss:Type="String">Data</Data></Cell></Row>
${rows.map((o) => `<Row>
<Cell><Data ss:Type="Number">${o.id}</Data></Cell>
<Cell><Data ss:Type="String">${o.code}</Data></Cell>
<Cell><Data ss:Type="String">${o.table_number || ''}</Data></Cell>
<Cell><Data ss:Type="String">${o.fulfillment}</Data></Cell>
<Cell><Data ss:Type="String">${o.payment_status}</Data></Cell>
<Cell><Data ss:Type="Number">${o.total}</Data></Cell>
<Cell><Data ss:Type="String">${o.created_at}</Data></Cell>
</Row>`).join('')}
</Table></Worksheet></Workbook>`;
  res.setHeader('Content-Type', 'application/vnd.ms-excel');
  res.setHeader('Content-Disposition', 'attachment; filename="aqua-pedidos.xls"');
  res.send(xml);
});

app.get('/api/admin/export.pdf', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 80').all();
  const lines = rows.map((o, i) => `${o.code}  mesa ${o.table_number || '-'}  ${o.payment_status}  ${o.total} MT  ${o.created_at}`);
  const content = ['Aqua Club CRBM Beira — Relatório de pedidos', todayISO(), '', ...lines].join('\n');
  const objects = [];
  const header = '%PDF-1.4\n';
  const add = (s) => { objects.push(s); };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const escaped = content.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = `BT /F1 10 Tf 40 800 Td ${escaped.split('\n').map((ln, i) => (i ? `T* (${ln}) Tj` : `(${ln}) Tj`)).join(' ')} ET`;
  add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`);
  add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  let pdf = header;
  const xref = [0];
  objects.forEach((obj, i) => {
    xref.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const startxref = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  xref.slice(1).forEach((off) => { pdf += String(off).padStart(10, '0') + ' 00000 n \n'; });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="aqua-relatorio.pdf"');
  res.send(Buffer.from(pdf, 'utf8'));
});

io.on('connection', (socket) => {
  socket.on('join', (room) => {
    if (typeof room === 'string' && room.length < 40) socket.join(room);
  });
});

app.use('/os', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(ROOT, 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Aqua Club pronto em http://localhost:${PORT}`);
});
