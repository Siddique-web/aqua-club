// Testa o modo AO VIVO (Supabase) ponta a ponta num Chromium real:
// o site usa um "cliente Supabase" simulado que executa SQL verdadeiro (schema + v2 + v3) em PostgreSQL (PGlite),
// com os papéis anon/authenticated e o auth.uid() do utilizador da sessão — como no Supabase.
// Uso:  cd tests && npm install && npx playwright install chromium && npm run test:live
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = dirname(fileURLToPath(import.meta.url)), SITE = join(HERE, '..', 'site'), SQL = join(HERE, '..', 'sistema', 'supabase');
const SHOTS = process.env.SHOTS || '/tmp/aqua-shots-live'; mkdirSync(SHOTS, { recursive: true });
const sqlText = (f) => readFileSync(join(SQL, f), 'utf8').replace(/create extension if not exists pgcrypto;/g, '');

/* ---------- base de dados com papéis tipo Supabase ---------- */
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create publication supabase_realtime; grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;`);
for (const f of ['schema.sql', 'schema_v2_pedidos.sql', 'schema_v3_garcons.sql']) await db.exec(sqlText(f));
await db.exec('grant all on all tables in schema public to anon, authenticated');

let chain = Promise.resolve();
const exec = (role, uid, sql, params) => (chain = chain.then(async () => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid, email: uid + '@x.t' }) : ''}', false);` + (role ? `set role ${role};` : ''));
  const r = await db.query(sql, params);
  return r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]))); }).catch((e) => { chain = Promise.resolve(); throw e; }));
const passwords = new Map();
const authOp = async (op, p) => {
  if (op === 'signUp') {
    if ((await exec(null, '', 'select 1 from auth.users where email = $1', [p.email])).length) return { error: 'User already registered' };
    const id = (await exec(null, '', 'insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id', [p.email, JSON.stringify(p.data || {})]))[0].id;
    passwords.set(p.email, p.password); return { user: { id, email: p.email } };
  }
  if (op === 'signIn') {
    const u = (await exec(null, '', 'select id, email from auth.users where email = $1', [p.email]))[0];
    if (!u || passwords.get(p.email) !== p.password) return { error: 'Invalid login credentials' }; return { user: u };
  }
};

/* ---------- servidor estático (com BACKEND "ligado") ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const srv = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname === '/' ? '/index.html' : new URL(req.url, 'http://x').pathname;
  try { let buf = readFileSync(join(SITE, p));
    if (p === '/index.html') buf = Buffer.from(buf.toString('utf8').replace("const BACKEND = { url: '', key: '' };", "const BACKEND = { url: 'http://fake.supabase.test', key: 'anon-key' };"));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(buf); } catch (e) { res.writeHead(404); res.end(); }
}).listen(0);
const URL_ = `http://127.0.0.1:${srv.address().port}/index.html`;

/* ---------- cliente Supabase simulado (corre no navegador, fala SQL via Node) ---------- */
const FAKE = `(() => {
  const SCALAR = new Set(['create_call','cancel_call','rate_call','accept_call','complete_call','release_call','update_my_profile','admin_set_staff','set_payment']);
  window.supabase = { createClient(url, key, opts) {
    const SK = (opts && opts.auth && opts.auth.storageKey) || 'sb-default';
    const load = () => { try { return JSON.parse(localStorage.getItem(SK) || 'null'); } catch (e) { return null; } };
    const role = () => (load() ? 'authenticated' : 'anon'), uid = () => (load() ? load().user.id : '');
    const run = (sql, params) => window.__sql(role(), uid(), sql, params || []);
    const err = (e) => ({ data: null, error: { message: String(e.message || e).replace(/^Error: /, '') } });
    class QB { constructor(t) { this.t = t; this.f = []; this.o = ''; this.l = ''; this.s = false; }
      select() { return this; } eq(c, v) { this.f.push([c + ' = $', v]); return this; } gte(c, v) { this.f.push([c + ' >= $', v]); return this; }
      not(c, op, v) { this.f.push([c + ' is not null', undefined]); return this; }
      order(c, o) { this.o = ' order by ' + c + (o && o.ascending === false ? ' desc' : ' asc'); return this; } limit(n) { this.l = ' limit ' + n; return this; }
      maybeSingle() { this.s = true; return this; }
      then(a, b) { return this.go().then(a, b); }
      async go() { const ps = []; const w = this.f.map(([s, v]) => { if (v === undefined) return s; ps.push(v); return s + ps.length; });
        try { const rows = await run('select * from ' + this.t + (w.length ? ' where ' + w.join(' and ') : '') + this.o + this.l, ps); return { data: this.s ? (rows[0] || null) : rows, error: null }; } catch (e) { return err(e); } } }
    return {
      rpc: async (fn, args) => { const n = Object.keys(args || {}), v = n.map((k) => args[k]), call = fn + '(' + n.map((k, i) => k + ' => $' + (i + 1)).join(', ') + ')';
        try { const rows = await run(SCALAR.has(fn) ? 'select ' + call + ' as r' : 'select * from ' + call, v); return { data: SCALAR.has(fn) ? rows[0].r : rows, error: null }; } catch (e) { return err(e); } },
      from: (t) => new QB(t),
      auth: {
        getSession: async () => ({ data: { session: load() } }),
        signInWithPassword: async ({ email, password }) => { const r = await window.__auth('signIn', { email, password }); if (r.error) return { data: {}, error: { message: r.error } }; const s = { user: r.user }; localStorage.setItem(SK, JSON.stringify(s)); return { data: { session: s, user: r.user }, error: null }; },
        signUp: async ({ email, password, options }) => { const r = await window.__auth('signUp', { email, password, data: options && options.data }); if (r.error) return { data: {}, error: { message: r.error } }; const s = { user: r.user }; localStorage.setItem(SK, JSON.stringify(s)); return { data: { session: s, user: Object.assign({ identities: [1] }, r.user) }, error: null }; },
        signOut: async () => { localStorage.removeItem(SK); return { error: null }; },
        updateUser: async () => ({ error: null }), resetPasswordForEmail: async () => ({ error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      channel: () => { const c = { on: () => c, subscribe: () => c }; return c; }, removeChannel() {}
    }; } };
})();`;

let ok = 0, bad = 0; const errors = [];
const check = (c, m) => { if (c) { ok++; console.log('  ✓', m); } else { bad++; console.log('  ✗ FALHOU:', m); } };

const browser = await chromium.launch();
const mk = async (w = 390, h = 844) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await ctx.exposeFunction('__sql', (role, uid, sql, params) => exec(role, uid, sql, params).then((r) => ({ ok: r })).catch((e) => ({ err: e.message })).then((o) => { if (o.err) throw new Error(o.err); return o.ok; }));
  await ctx.exposeFunction('__auth', authOp);
  await ctx.addInitScript(FAKE);
  await ctx.route('**/supabase.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '/* simulado */' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  return page;
};
const login = async (p, email, pw) => { await p.fill('form[data-form=in] input[name=email]', email); await p.fill('form[data-form=in] input[name=password]', pw); await p.click('form[data-form=in] button[type=submit]'); };
const signup = async (p, name, email, phone, pw) => {
  await p.click('.gp-seg [data-v=up]');
  await p.fill('form[data-form=up] input[name=name]', name); await p.fill('form[data-form=up] input[name=email]', email); await p.fill('form[data-form=up] input[name=phone]', phone);
  await p.fill('form[data-form=up] input[name=password]', pw); await p.fill('form[data-form=up] input[name=password2]', pw); await p.click('form[data-form=up] button[type=submit]');
};

try {
  console.log('\n[1] Registo de garçom em modo ao vivo');
  const waiter = await mk(); await waiter.goto(URL_ + '#garcom'); await waiter.waitForSelector('#gp:not([hidden]) form[data-form=in]', { timeout: 10000 });
  check(await waiter.locator('.gp-mode').innerText() === 'AO VIVO' || (await waiter.locator('.gp-mode').innerText()).toLowerCase().includes('vivo'), 'portal indica "Ao vivo"');
  check(await waiter.locator('.gp-demo').count() === 0, 'sem caixa de contas de demonstração em modo real');
  await signup(waiter, 'Ana Chissano', 'ana@aqua.co.mz', '841112222', 'segredo123'); await waiter.waitForSelector('text=A aguardar aprovação', { timeout: 8000 });
  check(true, 'conta nova fica pendente');
  const st = (await exec(null, '', "select active, role, phone from staff where email = 'ana@aqua.co.mz'"))[0];
  check(st.active === false && st.role === 'waiter' && st.phone === '841112222', 'base de dados: perfil criado inativo, como garçom');
  check((await exec('authenticated', (await exec(null, '', "select id from auth.users where email='ana@aqua.co.mz'"))[0].id, 'select * from orders')).length === 0, 'conta pendente não consegue ler pedidos');

  console.log('\n[2] Dono promove a primeira conta de administrador (passo único do guia)');
  const admin = await mk(); await admin.goto(URL_ + '#garcom'); await admin.waitForSelector('form[data-form=in]', { timeout: 10000 });
  await signup(admin, 'Dono do Aqua', 'dono@aqua.co.mz', '', 'segredo123'); await admin.waitForSelector('text=A aguardar aprovação', { timeout: 8000 });
  await exec(null, '', "update staff set role = 'admin', active = true where email = 'dono@aqua.co.mz'");
  await admin.waitForSelector('.gp-tab[data-t=team]', { timeout: 15000 });
  check(true, 'após a promoção a página do admin abre sozinha com a aba Equipa');
  await admin.click('.gp-tab[data-t=team]'); await admin.waitForSelector('button[data-do=approve]', { timeout: 6000 });
  await admin.waitForTimeout(3200); await admin.screenshot({ path: `${SHOTS}/L1-equipa.png` });
  await admin.click('button[data-do=approve]');
  await waiter.waitForSelector('.gp-tab[data-t=calls]', { timeout: 15000 });
  check((await waiter.locator('.gp-who h2').innerText()).toLowerCase().includes('ana'), 'admin aprova → a Ana entra sem recarregar');

  console.log('\n[3] Cliente (anónimo) chama → garçom aceita → cliente vê');
  const cust = await mk(); await cust.goto(URL_ + '?mesa=Mesa-08-Piscina'); await cust.waitForSelector('#fabCall'); await cust.waitForTimeout(3200);
  await cust.click('#fabCall'); await cust.waitForSelector('#callDlg[open]'); await cust.click('[data-reason="menu_question"]'); await cust.waitForSelector('#callStatus:not([hidden])');
  check((await cust.locator('#csTitle').innerText()).toLowerCase().includes('espera'), 'cliente: "À espera de resposta"');
  const row = (await exec(null, '', 'select table_code, reason, status, device_id from waiter_calls'))[0];
  check(row.table_code === 'Mesa-08-Piscina' && row.reason === 'menu_question' && row.status === 'pending' && !!row.device_id, 'base de dados: chamado criado pela função create_call');
  await waiter.waitForSelector('.gc[data-urg]', { timeout: 10000 });
  check((await waiter.locator('.gc[data-urg] .gc-table').innerText()).toLowerCase().includes('mesa 08'), 'garçom vê a Mesa 08');
  await waiter.click('button[data-act=accept]'); await waiter.waitForSelector('.gc.mine', { timeout: 6000 });
  await cust.waitForFunction("document.querySelector('#csSub').textContent.includes('Ana')", null, { timeout: 10000 });
  check(true, 'cliente vê que a Ana Chissano aceitou');
  const r2 = (await exec(null, '', 'select status, accepted_by_name, accepted_by_user is not null as u from waiter_calls'))[0];
  check(r2.status === 'accepted' && r2.accepted_by_name === 'Ana Chissano' && r2.u, 'base de dados: aceite com o nome e id da Ana');
  await cust.screenshot({ path: `${SHOTS}/L2-cliente-aceite.png` });

  console.log('\n[4] Concluir, avaliar e estatísticas reais');
  await waiter.click('button[data-act=complete]'); await waiter.waitForSelector('.gc.done', { timeout: 6000 });
  if (!(await cust.locator('#callDlg[open]').count())) await cust.click('#fabCall');
  await cust.waitForSelector('#csRate:not([hidden])', { timeout: 10000 });
  await cust.click('#csRate .rt button[data-n="4"]'); await cust.fill('#csRate input', 'Atendimento rápido'); await cust.click('#csRate .btn');
  await cust.waitForFunction("document.querySelector('#csRate').textContent.includes('Obrigado')", null, { timeout: 6000 });
  const r3 = (await exec(null, '', 'select status, rating, rating_comment from waiter_calls'))[0];
  check(r3.status === 'completed' && r3.rating === 4 && r3.rating_comment === 'Atendimento rápido', 'base de dados: concluído com nota 4 e comentário');
  await waiter.click('#pn button[data-k=stats]'); await waiter.waitForSelector('.gp-ring', { timeout: 8000 });
  const kp = await waiter.locator('.gp-kpi b').allInnerTexts();
  check(kp[0] === '1' && kp[3].startsWith('4'), `estatísticas da Ana: 1 atendimento, nota ${kp[3]}`);
  await waiter.screenshot({ path: `${SHOTS}/L3-estatisticas.png` });

  console.log('\n[5] Cancelamento e recarregar a meio');
  await cust.reload(); await cust.waitForSelector('#fabCall'); await cust.waitForTimeout(3300);
  await cust.click('#fabCall'); await cust.waitForSelector('#callDlg[open]'); await cust.click('[data-reason="urgent_other"]'); await cust.waitForSelector('#callStatus:not([hidden])');
  await cust.reload(); await cust.waitForSelector('#fabCall'); await cust.waitForTimeout(3500);
  await cust.waitForFunction("document.querySelector('#fabCallTxt').textContent.includes('aguardar')", null, { timeout: 8000 });
  check(true, 'após recarregar, o cliente retoma o chamado em curso');
  await cust.click('#fabCall'); await cust.waitForSelector('#callCancel:not([hidden])'); await cust.click('#callCancel');
  await cust.waitForFunction("document.querySelector('#csTitle').textContent.includes('cancelada')", null, { timeout: 6000 });
  check((await exec(null, '', "select count(*)::int c from waiter_calls where status='cancelled'"))[0].c === 1, 'base de dados: chamado cancelado');

  console.log('\n[6] Garçom desativado perde o acesso');
  const dev = (await exec(null, '', "select id from staff where email='ana@aqua.co.mz'"))[0].id;
  await admin.click('.gp-tab[data-t=calls]'); await admin.click('.gp-tab[data-t=team]'); await admin.waitForSelector('button[data-do=disable]', { timeout: 6000 });
  admin.once('dialog', (d) => d.accept()); await admin.click('button[data-do=disable]');
  await admin.waitForTimeout(800);
  check((await exec(null, '', 'select active from staff where id = $1', [dev]))[0].active === false, 'admin desativa a Ana');
  await waiter.reload(); await waiter.waitForSelector('text=A aguardar aprovação', { timeout: 12000 });
  check(true, 'ao recarregar, a Ana volta ao ecrã de acesso pendente');
} catch (e) { bad++; console.log('  ✗ ERRO NO TESTE:', e.message.split('\n')[0]); }
await browser.close(); srv.close();
console.log('\nErros de JavaScript na consola:', errors.length ? errors : 'nenhum');
console.log(`\nResultado: ${ok} certos, ${bad} falhados`);
process.exit(bad || errors.length ? 1 : 0);
