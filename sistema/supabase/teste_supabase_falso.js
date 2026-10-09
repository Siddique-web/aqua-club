/* Supabase falso, só para testes: guarda tudo em localStorage e avisa as outras páginas por BroadcastChannel.
   Imita as regras de segurança do schema_v2 (cliente anónimo só cria pedidos; equipa autenticada vê tudo). */
(function () {
  const KEY = 'fake-sb-db', bc = new BroadcastChannel('fake-sb');
  const uuid = () => crypto.randomUUID();
  const seed = () => ({ tables: ['Mesa-01-Rooftop', 'Mesa-04-Rooftop', 'Mesa-08-Piscina', 'Mesa-15-Sala'].map((c) => ({ id: uuid(), code: c, zone: c.includes('Rooftop') ? 'rooftop' : c.includes('Piscina') ? 'piscina' : 'sala-principal' })), orders: [], waiter_calls: [], order_events: [], session: null });
  const db = () => { try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch (e) { return seed(); } };
  const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  if (!localStorage.getItem(KEY)) save(seed());
  const USERS = [{ email: 'staff@aqua.test', password: 'segredo123' }];
  const subs = [];
  const deliver = (table, eventType, row, old) => subs.forEach((s) => { if (s.table !== table) return; if (s.filter) { const [k, v] = s.filter.split('=eq.'); if (String(row[k]) !== v) return; } s.cb({ eventType, new: row, old: old || {} }); });
  const notify = (table, eventType, row, old) => { deliver(table, eventType, row, old); bc.postMessage({ table, eventType, row, old }); };
  bc.onmessage = (e) => deliver(e.data.table, e.data.eventType, e.data.row, e.data.old);
  const authed = () => Boolean(db().session);
  const log = (d, o, ev, detail) => d.order_events.push({ id: d.order_events.length + 1, order_id: o.id, at: new Date().toISOString(), actor: authed() ? db().session.user.email : 'cliente', event: ev, detail });
  function from(table) {
    const q = { op: 'select', f: [], ord: null, lim: null, p: null, one: false, ret: false };
    const api = {
      select() { if (q.op !== 'select') q.ret = true; return api; }, insert(p) { q.op = 'insert'; q.p = p; return api; }, update(p) { q.op = 'update'; q.p = p; return api; },
      eq(k, v) { q.f.push([k, v]); return api; }, order(k, o) { q.ord = [k, o && o.ascending === false ? -1 : 1]; return api; }, limit(n) { q.lim = n; return api; }, single() { q.one = true; return api; },
      then(res, rej) { return Promise.resolve().then(run).then(res, rej); }
    };
    function run() {
      const d = db(), now = new Date().toISOString();
      if (table === 'orders' && !authed()) {                               /* regras RLS do cliente anónimo */
        if (q.op === 'select' || q.op === 'update') return { data: null, error: { message: 'permission denied for table orders (RLS)' } };
        if (q.op === 'insert') { const r = q.p; if (!(r.accepted_terms === true && (r.customer_name || '').length >= 2 && (r.customer_phone || '').length >= 9 && r.code && r.payment_status === 'unpaid' && r.status === 'received')) return { data: null, error: { message: 'new row violates row-level security policy for table "orders"' } }; }
      }
      if (table === 'order_events' && !authed()) return { data: null, error: { message: 'permission denied' } };
      const rows = d[table] || (d[table] = []);
      const match = (r) => q.f.every(([k, v]) => String(r[k]) === String(v));
      if (q.op === 'insert') {
        const row = Object.assign({ id: uuid(), created_at: now, updated_at: now }, q.p);
        if (table === 'orders') { row.payment_status = row.payment_status || 'unpaid'; if (rows.some((r) => r.code === row.code)) return { data: null, error: { message: 'duplicate key value violates unique constraint "orders_code_uq"' } }; }
        if (table === 'waiter_calls') row.status = row.status || 'pending';
        rows.push(row); if (table === 'orders') log(d, row, 'criado', { nome: row.customer_name, telemovel: row.customer_phone, total: row.total_mzn, termos_aceites: row.accepted_terms });
        save(d); notify(table, 'INSERT', row); return { data: q.ret ? (q.one ? row : [row]) : null, error: null };
      }
      if (q.op === 'update') {
        const out = []; rows.forEach((r) => { if (!match(r)) return; const old = Object.assign({}, r); Object.assign(r, q.p, { updated_at: now });
          if (table === 'orders') { if (r.status !== old.status) log(d, r, 'estado', { de: old.status, para: r.status, motivo: r.cancel_reason }); if (r.payment_status !== old.payment_status) log(d, r, 'pagamento', { de: old.payment_status, para: r.payment_status, metodo: r.payment_method, ref: r.payment_ref }); }
          out.push(r); save(d); notify(table, 'UPDATE', r, old); });
        return { data: q.ret ? (q.one ? out[0] : out) : null, error: null };
      }
      let out = rows.filter(match).slice();
      if (q.ord) out.sort((a, b) => (a[q.ord[0]] > b[q.ord[0]] ? 1 : -1) * q.ord[1]);
      if (q.lim) out = out.slice(0, q.lim);
      return { data: q.one ? out[0] : out, error: null };
    }
    return api;
  }
  const client = {
    from,
    rpc(name, a) {
      const d = db();
      if (name === 'order_status') { const o = d.orders.find((x) => x.code === a.p_code); return Promise.resolve({ data: o ? [{ status: o.status, payment_status: o.payment_status, payment_method: o.payment_method || null }] : [], error: null }); }
      if (name === 'set_payment') {
        if (!['pay_requested', 'paid_declared'].includes(a.p_status)) return Promise.resolve({ data: null, error: { message: 'estado de pagamento inválido' } });
        const o = d.orders.find((x) => x.code === a.p_code && ['unpaid', 'pay_requested'].includes(x.payment_status) && x.status !== 'cancelled');
        if (!o) return Promise.resolve({ data: false, error: null });
        const old = Object.assign({}, o); Object.assign(o, { payment_status: a.p_status, payment_method: a.p_method, payment_ref: a.p_ref, updated_at: new Date().toISOString() });
        d.order_events.push({ id: d.order_events.length + 1, order_id: o.id, at: new Date().toISOString(), actor: 'cliente', event: 'pagamento', detail: { de: old.payment_status, para: o.payment_status, metodo: o.payment_method, ref: o.payment_ref } });
        save(d); notify('orders', 'UPDATE', o, old); return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: { message: 'função desconhecida' } });
    },
    channel() { const ch = { on(t, opts, cb) { subs.push({ table: opts.table, filter: opts.filter, cb }); return ch; }, subscribe() { return ch; } }; return ch; },
    removeChannel() {},
    auth: {
      async signInWithPassword({ email, password }) { const u = USERS.find((x) => x.email === email && x.password === password); if (!u) return { data: {}, error: { message: 'Invalid login credentials' } }; const d = db(); d.session = { user: { email } }; save(d); return { data: { session: d.session }, error: null }; },
      async getSession() { return { data: { session: db().session }, error: null }; },
      async signOut() { const d = db(); d.session = null; save(d); return { error: null }; }
    }
  };
  window.supabase = { createClient: () => client };
})();
