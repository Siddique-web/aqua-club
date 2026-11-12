/* ============================================================================
   Aqua Club — Chamados cliente⇄garçom, Área do garçom e barra inferior
   --------------------------------------------------------------------------
   Três modos (decididos por BACKEND / ?modo=demo no index.html):
     live      → Supabase (contas reais, tempo real, SQL v3)
     demo      → tudo simulado no navegador (localStorage + BroadcastChannel):
                 abra o site em 2 abas — uma como cliente, outra como garçom
     whatsapp  → sem backend: a Área do garçom explica como ligar (chamados vão por WhatsApp)
   Este ficheiro NÃO precisa de build. Carrega depois do script principal do index.html.
   ============================================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ utilitários */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ts = (x) => (x ? Date.parse(x) : 0);
  const iso = (ms) => new Date(ms).toISOString();
  const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };
  const human = (ms) => {
    if (ms == null || !Number.isFinite(ms) || ms < 0 || ms > 12 * 36e5) return '—';
    const s = Math.round(ms / 1000); if (s < 60) return s + ' s';
    const m = Math.floor(s / 60); if (m < 60) return m + ' min' + (s % 60 ? ' ' + (s % 60) + ' s' : '');
    return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  };
  const hm = (ms) => { if (ms == null || isNaN(ms)) return '—'; const s = Math.round(ms / 1000); if (s < 60) return s + ' s'; const m = Math.floor(s / 60); return m < 60 ? m + ' m ' + pad(s % 60) + ' s' : Math.floor(m / 60) + ' h ' + pad(m % 60) + ' m'; };
  const hhmm = (x) => { const d = new Date(x); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };   // dia LOCAL (corrige o UTC)
  const dayKey = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const DAYN = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MONN = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const dayLabel = (ms) => { const d = new Date(ms), t = startOfDay(Date.now()); const k = startOfDay(ms);
    return k === t ? 'Hoje' : k === t - 864e5 ? 'Ontem' : DAYN[d.getDay()] + ', ' + d.getDate() + ' ' + MONN[d.getMonth()]; };
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
                  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* modo privado */ } },
                  del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* */ } } };
  const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  const REASONS = { request_bill: 'Pedir a conta', menu_question: 'Dúvida sobre o menu', new_order: 'Novo pedido / alterar pedido', urgent_other: 'Urgente / outro', conta: 'Pedir a conta', duvida: 'Dúvida sobre o menu', pedido: 'Novo pedido / alterar pedido', urgente: 'Urgente / outro' };
  const REASON_IC = { request_bill: 'card', menu_question: 'book', new_order: 'plus', urgent_other: 'alert', conta: 'card', duvida: 'book', pedido: 'plus', urgente: 'alert' };
  const ZONES = { rooftop: 'Rooftop', piscina: 'Piscina', 'sala-principal': 'Sala principal' };
  const tableName = (c) => { const m = /^Mesa-(\d+)/i.exec(c || ''); return m ? 'Mesa ' + m[1] : String(c || '').replace(/-/g, ' '); };
  const GOAL = 15;   // meta diária de atendimentos (apenas motivacional)
  const PERIODS = [[1, 'Hoje'], [7, '7 dias'], [30, '30 dias']];

  const siteTables = () => (typeof TABLES !== 'undefined' && Array.isArray(TABLES) && TABLES.length ? TABLES
    : [{ code: 'Mesa-01-Rooftop', zone: 'rooftop' }, { code: 'Mesa-04-Rooftop', zone: 'rooftop' }, { code: 'Mesa-08-Piscina', zone: 'piscina' },
       { code: 'Mesa-12-Piscina', zone: 'piscina' }, { code: 'Mesa-15-Sala', zone: 'sala-principal' }, { code: 'Mesa-16-Sala', zone: 'sala-principal' }]);

  /* ------------------------------------------------------------------ modo */
  const cfg = () => (typeof BACKEND !== 'undefined' && BACKEND) || { url: '', key: '' };
  function mode() {
    const c = cfg(); if (c.url && c.key) return 'live';
    let m = ''; try { m = new URLSearchParams(location.search).get('modo') || (typeof MODE !== 'undefined' ? MODE : ''); } catch (e) { /* */ }
    if (m === 'demo') return 'demo';
    if (m === 'desk' || m === 'live' || (window.AquaOS && AquaOS.live && AquaOS.live())) return 'desk';
    return 'whatsapp';
  }

  /* ------------------------------------------------------------------ normalização */
  const norm = (r) => ({
    id: r.id, tableCode: r.table_code, zone: r.zone, reason: r.reason, note: r.note || '', status: r.status,
    createdAt: r.created_at, acceptedAt: r.accepted_at || null, completedAt: r.completed_at || null,
    by: r.accepted_by_name || '', byUser: r.accepted_by_user || null,
    rating: r.rating == null ? null : +r.rating, comment: r.rating_comment || '', released: r.released_count || 0
  });
  const friendly = (e) => {
    const m = String((e && e.message) || e || '');
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Sem ligação à internet. Tente de novo.';
    if (/invalid login credentials/i.test(m)) return 'E-mail ou palavra-passe incorretos.';
    if (/email not confirmed/i.test(m)) return 'Confirme primeiro o seu e-mail (veja a sua caixa de entrada).';
    if (/already registered|already been registered/i.test(m)) return 'Este e-mail já está registado. Entre ou recupere a palavra-passe.';
    if (/password should be at least|weak password/i.test(m)) return 'A palavra-passe é demasiado fraca (mínimo 8 caracteres).';
    if (/rate limit|too many/i.test(m)) return 'Demasiadas tentativas. Aguarde um momento e tente outra vez.';
    return m || 'Ocorreu um erro. Tente de novo.';
  };
  const fail = (e) => { const x = new Error(friendly(e)); x.raw = e; return x; };

  /* ------------------------------------------------------------------ estatísticas (puro JS, igual para demo e live) */
  function computeStats(calls, sinceMs, days) {
    const inP = (c) => ts(c.createdAt) >= sinceMs;
    const done = calls.filter((c) => c.status === 'completed' && inP(c));
    const taken = calls.filter((c) => (c.status === 'completed' || c.status === 'accepted') && c.acceptedAt && inP(c));
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const resp = taken.map((c) => ts(c.acceptedAt) - ts(c.createdAt)).filter((x) => x >= 0);
    const svc = done.filter((c) => c.completedAt && c.acceptedAt).map((c) => ts(c.completedAt) - ts(c.acceptedAt)).filter((x) => x >= 0);
    const rated = calls.filter((c) => c.rating != null && inP(c));
    const byReason = {}, byZone = {}, byHour = Array(24).fill(0);
    done.forEach((c) => { byReason[c.reason] = (byReason[c.reason] || 0) + 1; byZone[c.zone] = (byZone[c.zone] || 0) + 1; byHour[new Date(ts(c.createdAt)).getHours()]++; });
    const today0 = startOfDay(Date.now()), nd = Math.max(days || 7, 7), series = [];
    const perDay = {}; done.forEach((c) => { const k = dayKey(ts(c.createdAt)); perDay[k] = (perDay[k] || 0) + 1; });
    for (let i = nd - 1; i >= 0; i--) { const ms = today0 - i * 864e5, d = new Date(ms); series.push({ key: dayKey(ms), label: DAYN[d.getDay()], n: perDay[dayKey(ms)] || 0, today: i === 0 }); }
    return { count: done.length, inProgress: calls.filter((c) => c.status === 'accepted').length,
      resp: avg(resp), svc: avg(svc), rating: avg(rated.map((c) => c.rating)), nRated: rated.length,
      byReason, byZone, byHour, series, daysActive: Object.keys(perDay).length, maxDay: Math.max(0, ...Object.values(perDay)) };
  }
  const BADGES = [
    { id: 'first', icon: 'check', name: 'Primeiro atendimento', desc: 'Concluiu o primeiro chamado', ok: (s) => s.count >= 1 },
    { id: 'fast', icon: 'bolt', name: 'Resposta relâmpago', desc: 'Resposta média abaixo de 1 min (mín. 5)', ok: (s) => s.count >= 5 && s.resp != null && s.resp < 60000 },
    { id: 'stars', icon: 'star', name: 'Cinco estrelas', desc: 'Nota média ≥ 4,5 (mín. 5 avaliações)', ok: (s) => s.nRated >= 5 && s.rating >= 4.5 },
    { id: 'marathon', icon: 'flame', name: 'Maratonista', desc: '15 atendimentos num só dia', ok: (s) => s.maxDay >= 15 },
    { id: 'steady', icon: 'calendar', name: 'Constante', desc: 'Atendeu em 5 dias diferentes', ok: (s) => s.daysActive >= 5 }
  ];

  /* ------------------------------------------------------------------ biblioteca Supabase */
  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((res, rej) => {
      let s = document.querySelector('script[data-sb]') || Array.from(document.scripts).find((x) => /supabase-js/.test(x.src));
      const t0 = Date.now();
      const wait = () => { if (window.supabase && window.supabase.createClient) return res(); if (Date.now() - t0 > 15000) return rej(new Error('Failed to fetch')); setTimeout(wait, 80); };
      if (!s) { s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js'; s.async = true; s.dataset.sb = '1'; s.onerror = () => rej(new Error('Failed to fetch')); document.head.appendChild(s); }
      wait();
    });
  }

  /* ================================================================== BACKEND LIVE (Supabase) */
  function makeLive() {
    let sb = null, ready = null;
    const need = async () => {
      if (!ready) ready = (async () => {
        await loadLib(); const c = cfg();
        sb = window.supabase.createClient(c.url, c.key, { auth: { storageKey: 'aq-staff-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
        sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY' && api.onRecovery) api.onRecovery(); });
      })();
      await ready; return sb;
    };
    const rpc = async (fn, args) => { const c = await need(); const { data, error } = await c.rpc(fn, args); if (error) throw fail(error); return data; };
    const first = (d) => (Array.isArray(d) ? d[0] : d) || null;
    const api = {
      mode: 'live', onRecovery: null,
      /* cliente */
      createCall: (table, reason, note, device) => rpc('create_call', { p_table: table, p_reason: reason, p_note: note || null, p_device: device || null }),
      async callStatus(id) {
        const r = first(await rpc('call_status', { p_id: id })); if (!r) return null;
        return { status: r.status, by: r.accepted_by_name || '', createdAt: r.created_at, acceptedAt: r.accepted_at, completedAt: r.completed_at, rating: r.rating };
      },
      cancelCall: (id) => rpc('cancel_call', { p_id: id }),
      rateCall: (id, n, c) => rpc('rate_call', { p_id: id, p_rating: n, p_comment: c || null }),
      /* contas */
      hasStoredSession: () => !!store.get('aq-staff-auth'),
      async session() { const c = await need(); const { data } = await c.auth.getSession(); const u = data && data.session && data.session.user; return u ? { id: u.id, email: u.email } : null; },
      async signIn(email, password) { const c = await need(); const { error } = await c.auth.signInWithPassword({ email, password }); if (error) throw fail(error); },
      async signUp({ name, email, phone, password }) {
        const c = await need();
        const { data, error } = await c.auth.signUp({ email, password, options: { data: { name, phone } } });
        if (error) throw fail(error);
        if (data.user && data.user.identities && data.user.identities.length === 0) throw fail('already registered');
        return { needsConfirm: !data.session };
      },
      async signOut() { const c = await need(); await c.auth.signOut(); },
      async resetPassword(email) { const c = await need(); const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw fail(error); },
      async changePassword(pw) { const c = await need(); const { error } = await c.auth.updateUser({ password: pw }); if (error) throw fail(error); },
      async profile() {
        const c = await need(); const s = await api.session(); if (!s) return null;
        const { data, error } = await c.from('staff').select('*').eq('user_id', s.id).maybeSingle(); if (error) throw fail(error); return data;
      },
      updateProfile: ({ name, phone }) => rpc('update_my_profile', { p_name: name, p_phone: phone || null }),
      /* chamados (equipa) */
      async listCalls(sinceMs) {
        const c = await need();
        const { data, error } = await c.from('waiter_calls').select('*').gte('created_at', iso(sinceMs)).order('created_at', { ascending: true }).limit(1000);
        if (error) throw fail(error); return (data || []).map(norm);
      },
      async myCalls(sinceMs) {
        const c = await need(); const s = await api.session();
        const { data, error } = await c.from('waiter_calls').select('*').eq('accepted_by_user', s.id).gte('created_at', iso(sinceMs)).order('created_at', { ascending: false }).limit(1000);
        if (error) throw fail(error); return (data || []).map(norm);
      },
      acceptCall: (id) => rpc('accept_call', { p_id: id }),
      completeCall: (id) => rpc('complete_call', { p_id: id }),
      releaseCall: (id) => rpc('release_call', { p_id: id }),
      /* admin */
      async team() {
        const c = await need(); const { data, error } = await c.from('staff').select('*').not('user_id', 'is', null).order('created_at', { ascending: true });
        if (error) throw fail(error); return data || [];
      },
      setStaff: (id, active, role) => rpc('admin_set_staff', { p_id: id, p_active: active, p_role: role }),
      /* tempo real (a sondagem a cada poucos segundos continua como rede de segurança) */
      subscribe(cb) {
        let ch = null, dead = false;
        need().then((c) => { if (dead) return; ch = c.channel('gp-calls-' + Math.random().toString(36).slice(2, 7)).on('postgres_changes', { event: '*', schema: 'public', table: 'waiter_calls' }, () => cb()).subscribe(); }).catch(() => {});
        return () => { dead = true; if (ch && sb) sb.removeChannel(ch); };
      }
    };
    return api;
  }

  /* ================================================================== BACKEND DEMO (localStorage) */
  function makeDemo() {
    const KEY = 'aqd.v1', SESS = 'aqd.sess';
    /* a sessão da demonstração vive em sessionStorage: cada aba pode estar numa conta diferente (cliente, garçom, admin) */
    const ss = { get: () => { try { return sessionStorage.getItem(SESS); } catch (e) { return null; } },
                 set: (v) => { try { sessionStorage.setItem(SESS, v); } catch (e) { /* */ } },
                 del: () => { try { sessionStorage.removeItem(SESS); } catch (e) { /* */ } } };
    let bc = null; try { bc = new BroadcastChannel('aqua-demo'); } catch (e) { /* */ }
    const listeners = new Set();
    const ping = () => { listeners.forEach((f) => { try { f(); } catch (e) { /* */ } }); };
    if (bc) bc.onmessage = ping;
    window.addEventListener('storage', (e) => { if (e.key === KEY) ping(); });

    function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function seed() {
      const r = mulberry(42), T = siteTables(), tN = Date.now(), start = startOfDay(tN);
      const staff = [
        { id: 's-admin', user_id: 'u-admin', name: 'Administração', email: '', phone: '', role: 'admin', active: true, color: '#00A8FF', created_at: iso(tN - 40 * 864e5) },
        { id: 's-amelia', user_id: 'u-amelia', name: 'Amélia', email: '', phone: '', role: 'waiter', active: true, color: '#FFB400', created_at: iso(tN - 30 * 864e5) },
        { id: 's-joaquim', user_id: 'u-joaquim', name: 'Joaquim', email: '', phone: '', role: 'waiter', active: true, color: '#16A34A', created_at: iso(tN - 20 * 864e5) }
      ];
      const calls = [], rs = Object.keys(REASONS);
      for (let d = 13; d >= 0; d--) {
        const n = 3 + Math.floor(r() * 7);
        for (let i = 0; i < n; i++) {
          const w = r() < 0.65 ? staff[1] : staff[2], t = T[Math.floor(r() * T.length)];
          const created = start - d * 864e5 + (10 + r() * 11.5) * 36e5;
          if (created > tN - 60000) continue;
          const resp = (20 + r() * 220) * 1000, svc = (60 + r() * 360) * 1000;
          calls.push({ id: uuid(), table_code: t.code, zone: t.zone, reason: rs[Math.floor(r() * rs.length)], note: '', status: 'completed',
            created_at: iso(created), accepted_at: iso(created + resp), completed_at: iso(created + resp + svc),
            accepted_by_name: w.name, accepted_by_user: w.user_id, rating: r() < 0.7 ? 3 + Math.floor(r() * 3) : null,
            rating_comment: '', released_count: 0, device_id: 'seed' });
        }
      }
      return { v: 1, staff, calls };
    }
    const read = () => { try { const d = JSON.parse(store.get(KEY) || ''); if (d && d.v === 1) return d; } catch (e) { /* */ } const d = seed(); store.set(KEY, JSON.stringify(d)); return d; };
    const write = (d) => { store.set(KEY, JSON.stringify(d)); if (bc) bc.postMessage(1); ping(); };
    const meRow = (d) => { const u = ss.get(); return d.staff.find((s) => s.user_id === u) || null; };
    const needStaff = (d) => { const m = meRow(d); if (!m || !m.active) throw new Error('Sem permissão.'); return m; };
    const pub = (s) => { const o = Object.assign({}, s); delete o.pass; return o; };

    const api = {
      mode: 'demo', onRecovery: null,
      /* cliente */
      async createCall(table, reason, note, device) {
        const d = read();
        if (!REASONS[reason]) throw new Error('Motivo inválido.');
        const t = siteTables().find((x) => x.code === table); if (!t) throw new Error('Esta mesa não existe no sistema.');
        const ex = d.calls.find((c) => c.table_code === table && c.reason === reason && (c.status === 'pending' || c.status === 'accepted')); if (ex) return ex.id;
        if (device && d.calls.filter((c) => c.device_id === device && ts(c.created_at) > Date.now() - 600000).length >= 6) throw new Error('Demasiados chamados seguidos. Aguarde um momento.');
        const id = uuid();
        d.calls.push({ id, table_code: t.code, zone: t.zone, reason, note: String(note || '').trim().slice(0, 140), status: 'pending', created_at: iso(Date.now()),
          accepted_at: null, completed_at: null, accepted_by_name: null, accepted_by_user: null, rating: null, rating_comment: '', released_count: 0, device_id: device || null });
        write(d); return id;
      },
      async callStatus(id) {
        const c = read().calls.find((x) => x.id === id); if (!c) return null;
        return { status: c.status, by: c.accepted_by_name || '', createdAt: c.created_at, acceptedAt: c.accepted_at, completedAt: c.completed_at, rating: c.rating };
      },
      async cancelCall(id) { const d = read(), c = d.calls.find((x) => x.id === id); if (c && c.status === 'pending') { c.status = 'cancelled'; write(d); return true; } return false; },
      async rateCall(id, n, comment) {
        if (!(n >= 1 && n <= 5)) throw new Error('Nota inválida.');
        const d = read(), c = d.calls.find((x) => x.id === id);
        if (c && (c.status === 'accepted' || c.status === 'completed') && c.rating == null) { c.rating = n; c.rating_comment = String(comment || '').trim().slice(0, 140); write(d); return true; } return false;
      },
      /* contas */
      hasStoredSession: () => !!ss.get(),
      async session() { const d = read(), m = meRow(d); return m ? { id: m.user_id, email: m.email } : null; },
      async signIn(email, password) {
        const d = read(), m = d.staff.find((s) => s.email.toLowerCase() === String(email).trim().toLowerCase());
        if (!m || m.pass !== password) throw new Error('E-mail ou palavra-passe incorretos.');
        ss.set(m.user_id); ping();
      },
      async signUp({ name, email, phone, password }) {
        const d = read(), em = String(email).trim().toLowerCase();
        if (d.staff.some((s) => s.email.toLowerCase() === em)) throw new Error('Este e-mail já está registado. Entre ou recupere a palavra-passe.');
        if (String(password).length < 8) throw new Error('A palavra-passe é demasiado fraca (mínimo 8 caracteres).');
        const colors = ['#00A8FF', '#FFB400', '#16A34A', '#E11D48', '#7C3AED', '#0891B2', '#EA580C', '#DB2777'], uid = uuid();
        d.staff.push({ id: uuid(), user_id: uid, name: String(name).trim().slice(0, 60), email: em, phone: String(phone || '').trim().slice(0, 20), role: 'waiter', active: false,
          color: colors[Math.floor(Math.random() * colors.length)], created_at: iso(Date.now()), pass: password });
        write(d); ss.set(uid); ping(); return { needsConfirm: false };
      },
      async signOut() { ss.del(); ping(); },
      async resetPassword() { throw new Error('Na demonstração não há recuperação por e-mail. Entre pelo sistema da administração.'); },
      async changePassword(pw) { const d = read(), m = meRow(d); if (!m) throw new Error('Sem sessão.'); if (String(pw).length < 8) throw new Error('A palavra-passe é demasiado fraca (mínimo 8 caracteres).'); m.pass = pw; write(d); },
      async profile() { const m = meRow(read()); return m ? pub(m) : null; },
      async updateProfile({ name, phone }) {
        const d = read(), m = needStaff(d), n = String(name || '').trim().slice(0, 60); if (n.length < 2) throw new Error('Indique o seu nome.');
        m.name = n; m.phone = String(phone || '').trim().slice(0, 20); write(d); return true;
      },
      /* chamados (equipa) */
      async listCalls(sinceMs) { const d = read(); needStaff(d); return d.calls.filter((c) => ts(c.created_at) >= sinceMs).sort((a, b) => ts(a.created_at) - ts(b.created_at)).map(norm); },
      async myCalls(sinceMs) { const d = read(), m = needStaff(d); return d.calls.filter((c) => c.accepted_by_user === m.user_id && ts(c.created_at) >= sinceMs).sort((a, b) => ts(b.created_at) - ts(a.created_at)).map(norm); },
      async acceptCall(id) {
        const d = read(), m = needStaff(d), c = d.calls.find((x) => x.id === id);
        if (!c || c.status !== 'pending') return false;
        Object.assign(c, { status: 'accepted', accepted_by_user: m.user_id, accepted_by_name: m.name, accepted_at: iso(Date.now()) }); write(d); return true;
      },
      async completeCall(id) {
        const d = read(), m = needStaff(d), c = d.calls.find((x) => x.id === id);
        if (!c || c.status !== 'accepted' || (c.accepted_by_user !== m.user_id && m.role !== 'admin')) return false;
        c.status = 'completed'; c.completed_at = iso(Date.now()); write(d); return true;
      },
      async releaseCall(id) {
        const d = read(), m = needStaff(d), c = d.calls.find((x) => x.id === id);
        if (!c || c.status !== 'accepted' || (c.accepted_by_user !== m.user_id && m.role !== 'admin')) return false;
        Object.assign(c, { status: 'pending', accepted_by_user: null, accepted_by_name: null, accepted_at: null, released_count: (c.released_count || 0) + 1 }); write(d); return true;
      },
      /* admin */
      async team() { const d = read(); const m = meRow(d); if (!m || !m.active || m.role !== 'admin') throw new Error('Sem permissão.'); return d.staff.map(pub); },
      async setStaff(id, active, role) {
        const d = read(), m = meRow(d); if (!m || !m.active || m.role !== 'admin') throw new Error('Sem permissão.');
        if (role !== 'waiter' && role !== 'admin') throw new Error('Papel inválido.');
        const t = d.staff.find((s) => s.id === id); if (!t) return false;
        if (t.user_id === m.user_id && (!active || role !== 'admin')) throw new Error('Não pode retirar o seu próprio acesso de administrador.');
        t.active = !!active; t.role = role; write(d); return true;
      },
      subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      /* só demo */
      async simulateCall() {
        const T = siteTables(), t = T[Math.floor(Math.random() * T.length)], rs = Object.keys(REASONS), r = rs[Math.floor(Math.random() * rs.length)];
        const notes = ['', '', 'Mesa junto à piscina', 'Somos 6 pessoas', 'Dividir a conta em 2'];
        return api.createCall(t.code, r, notes[Math.floor(Math.random() * notes.length)], 'sim-' + Math.random().toString(36).slice(2, 6));
      },
      async resetDemo() { store.del(KEY); ss.del(); read(); ping(); }
    };
    return api;
  }

  /* ================================================================== BACKEND DESK (PIN local + API se existir) */
  function makeDesk() {
    const ROSTER = 'aq.os.roster';
    const SESS = 'aq.os.staff.me';
    const COLORS = ['#00A8FF', '#FFB400', '#16A34A', '#E11D48', '#7C3AED', '#0891B2', '#EA580C', '#DB2777', '#0EA5E9', '#CA8A04'];
    const NAMES = ['Amélia Nhampossa', 'João Mucavele', 'Nádia Cossa', 'Carlos Tembe', 'Sónia Machava', 'Pedro Mondlane', 'Lucrécia Dava', 'Miguel Chissano', 'Beatriz Langa', 'Samuel Matola'];
    const seedRoster = () => NAMES.map((name, i) => ({
      id: 'w-' + (i + 1), user_id: 'w-' + (i + 1), name, email: '', phone: '',
      role: 'waiter', active: true, color: COLORS[i % COLORS.length], pin: String(1001 + i),
      created_at: iso(Date.now() - (30 - i) * 864e5)
    })).concat([{
      id: 's-admin', user_id: 's-admin', name: 'Administração', email: '', phone: '',
      role: 'admin', active: true, color: '#0A0A0A', pin: '2468', created_at: iso(Date.now() - 40 * 864e5)
    }]);
    const readRoster = () => {
      try { const d = JSON.parse(store.get(ROSTER) || ''); if (Array.isArray(d) && d.length) return d; } catch (e) { /* */ }
      const d = seedRoster(); store.set(ROSTER, JSON.stringify(d)); return d;
    };
    const writeRoster = (d) => store.set(ROSTER, JSON.stringify(d));
    const readMe = () => { try { return JSON.parse(store.get(SESS) || ''); } catch (e) { return null; } };
    const writeMe = (m) => { if (m) store.set(SESS, JSON.stringify(m)); else store.del(SESS); };
    const listeners = new Set();
    const ping = () => { listeners.forEach((f) => { try { f(); } catch (e) { /* */ } }); };
    try {
      if (!window.__aqDeskBc) {
        window.__aqDeskBc = new BroadcastChannel('aq-os');
        window.__aqDeskBc.onmessage = ping;
      } else {
        const prev = window.__aqDeskBc.onmessage;
        window.__aqDeskBc.onmessage = (ev) => { if (typeof prev === 'function') prev(ev); ping(); };
      }
    } catch (e) { /* */ }
    window.addEventListener('storage', (e) => { if (e.key === 'aq.os.bus' || e.key === ROSTER) ping(); });
    const pub = (s) => { const o = Object.assign({}, s); delete o.pin; return o; };
    const api = {
      mode: 'desk', onRecovery: null,
      async createCall(table, reason, note, device) {
        const n = parseInt(String(table).replace(/\D/g, ''), 10);
        const mapped = { request_bill: 'conta', menu_question: 'duvida', new_order: 'pedido', urgent_other: 'urgente', waiter: 'urgente' }[reason] || reason || 'urgente';
        const id = 'c' + Date.now();
        if (window.AquaBus) {
          AquaBus.pushCall({
            id,
            table_number: Number.isFinite(n) && n > 0 ? n : 0,
            place: table || '',
            reason: mapped,
            note: String(note || '').slice(0, 140),
            status: 'pending',
            created_at: new Date().toISOString(),
            device_id: device || null
          });
        }
        ping();
        return id;
      },
      async callStatus(id) {
        const key = String(id).replace(/^os-/, '');
        const c = (((window.AquaBus && AquaBus.read()) || {}).calls || []).find((x) => String(x.id) === key || String(x.serverId) === key);
        if (!c) return null;
        return { status: c.status === 'closed' ? 'completed' : c.status, by: c.waiterName || '', createdAt: c.created_at, acceptedAt: c.accepted_at };
      },
      async cancelCall(id) {
        const key = String(id).replace(/^os-/, '');
        if (window.AquaBus) AquaBus.patchCall(key, { status: 'cancelled', closed_at: new Date().toISOString() });
        ping();
        return true;
      },
      rateCall: async () => false,
      hasStoredSession: () => !!readMe() || !!store.get('aq.os.staff'),
      async session() { const m = readMe(); return m ? { id: m.user_id, email: m.email || '' } : null; },
      async signIn() { throw new Error('Entre com o PIN da equipa.'); },
      async signUp() { throw new Error('Peça à administração para criar o seu PIN.'); },
      async signOut() { writeMe(null); store.del('aq.os.staff'); ping(); },
      async resetPassword() { throw new Error('Peça à administração para repor o PIN.'); },
      async changePassword(pw) {
        const me = readMe(); if (!me) throw new Error('Sem sessão.');
        if (String(pw).length < 4) throw new Error('O PIN precisa de pelo menos 4 dígitos.');
        const d = readRoster(); const row = d.find((s) => s.user_id === me.user_id); if (!row) throw new Error('Sem permissão.');
        row.pin = String(pw); me.pin = String(pw); writeRoster(d); writeMe(me);
      },
      async profile() { const m = readMe(); return m ? pub(m) : null; },
      async updateProfile({ name, phone }) {
        const d = readRoster(); const me = readMe(); if (!me) throw new Error('Sem sessão.');
        const row = d.find((s) => s.user_id === me.user_id); if (!row) throw new Error('Sem permissão.');
        const n = String(name || '').trim().slice(0, 60); if (n.length < 2) throw new Error('Indique o seu nome.');
        row.name = n; row.phone = String(phone || '').trim().slice(0, 20);
        Object.assign(me, { name: row.name, phone: row.phone }); writeRoster(d); writeMe(me); return true;
      },
      roster: () => readRoster().map(pub),
      openPin(pin, waiterId) {
        const d = readRoster();
        let row = null;
        if (waiterId) row = d.find((s) => String(s.id) === String(waiterId) || String(s.user_id) === String(waiterId));
        else {
          const hits = d.filter((s) => String(s.pin) === String(pin) && s.active);
          if (hits.length > 1) throw new Error('Há mais do que uma pessoa com este PIN. Escolha o nome.');
          row = hits[0] || null;
        }
        if (!row || !row.active || String(row.pin) !== String(pin)) throw new Error('PIN incorrecto.');
        writeMe(row); ping(); return pub(row);
      },
      setPin(id, pin) {
        const me = readMe(); if (!me || me.role !== 'admin') throw new Error('Sem permissão.');
        if (String(pin).length < 4) throw new Error('O PIN precisa de pelo menos 4 dígitos.');
        const d = readRoster(); const t = d.find((s) => s.id === id); if (!t) return false;
        t.pin = String(pin); writeRoster(d); ping(); return true;
      },
      async listCalls() {
        const bus = (window.AquaBus && AquaBus.read()) || { calls: [] };
        return (bus.calls || []).map(mapOsCall);
      },
      async myCalls() {
        const me = readMe(); const all = await api.listCalls();
        return all.filter((c) => !me || c.byUser === me.user_id || c.by === me.name);
      },
      async acceptCall(id) {
        const me = readMe(); if (!me) throw new Error('Sem sessão.');
        const osId = String(id).replace(/^os-/, '');
        if (window.AquaBus) AquaBus.patchCall(osId, { status: 'accepted', accepted_at: new Date().toISOString(), waiterName: me.name, waiter_id: me.id });
        ping(); return true;
      },
      async completeCall(id) {
        const osId = String(id).replace(/^os-/, '');
        if (window.AquaBus) AquaBus.patchCall(osId, { status: 'closed', closed_at: new Date().toISOString() });
        ping(); return true;
      },
      async releaseCall(id) {
        const osId = String(id).replace(/^os-/, '');
        if (window.AquaBus) AquaBus.patchCall(osId, { status: 'pending', accepted_at: null, waiterName: '', waiter_id: null });
        ping(); return true;
      },
      async team() { const me = readMe(); if (!me || me.role !== 'admin') throw new Error('Sem permissão.'); return readRoster(); },
      async inviteStaff({ name, pin, phone }) {
        const me = readMe(); if (!me || me.role !== 'admin') throw new Error('Sem permissão.');
        const n = String(name || '').trim().slice(0, 60);
        if (n.length < 2) throw new Error('Indique o nome do garçom.');
        const p = String(pin || '').trim();
        if (p.length < 4) throw new Error('O PIN precisa de pelo menos 4 dígitos.');
        const d = readRoster();
        if (d.some((s) => String(s.pin) === p)) throw new Error('Este PIN já está em uso.');
        const id = 'w-' + Date.now().toString(36);
        d.splice(Math.max(0, d.length - 1), 0, {
          id, user_id: id, name: n, email: '', phone: String(phone || '').trim().slice(0, 20),
          role: 'waiter', active: true, color: COLORS[d.length % COLORS.length], pin: p, created_at: iso(Date.now())
        });
        writeRoster(d); ping(); return true;
      },
      async setStaff(id, active, role) {
        const me = readMe(); if (!me || me.role !== 'admin') throw new Error('Sem permissão.');
        const d = readRoster(); const t = d.find((s) => s.id === id); if (!t) return false;
        if (t.user_id === me.user_id && (!active || role !== 'admin')) throw new Error('Não pode retirar o seu próprio acesso de administrador.');
        t.active = !!active; t.role = role === 'admin' ? 'admin' : 'waiter'; writeRoster(d); ping(); return true;
      },
      subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); }
    };
    return api;
  }

  let _be = null, _bm = '';
  const backend = () => {
    const m = mode(); if (m === 'whatsapp') return null;
    if (!_be || _bm !== m) {
      _be = m === 'live' ? makeLive() : m === 'demo' ? makeDemo() : makeDesk();
      _bm = m;
    }
    return _be;
  };

  /* ------------------------------------------------------------------ API pública para o site do cliente */
  const need = () => { const b = backend(); if (!b) throw new Error('Sem ligação ao sistema de chamados.'); return b; };
  window.AquaCalls = {
    mode,
    createCall: (t, r, n, d) => need().createCall(t, r, n, d),
    callStatus: (id) => need().callStatus(id),
    cancelCall: (id) => need().cancelCall(id),
    rateCall: (id, n, c) => need().rateCall(id, n, c),
    mountRating: (el, id, done) => mountRating(el, id, done),
    _internals: { computeStats, esc, BADGES }
  };

  /* ====================================================================== ÍCONES */
  const P = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-3.6 3.9-5.5 7.5-5.5s6.7 1.9 7.5 5.5"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M2.8 19.5c.6-3.2 3.1-5 6.2-5s5.6 1.8 6.2 5"/><path d="M16 5.6a3.2 3.2 0 0 1 0 5.8M18 14.8c1.8.6 3 2.2 3.4 4.7"/>',
    chart: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.6 2H4.4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
    star: '<path fill="currentColor" d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
    logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
    list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
    book: '<path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17v.1"/>',
    bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
    flame: '<path d="M12 3c.5 3-2 4.5-3.2 6.7A6 6 0 0 0 12 21a6 6 0 0 0 5-9.4c-1 1-1.8 1.2-2.6 1C14.8 9.8 13.8 5.5 12 3z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 0 12h-3"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.4 3.1 8 7.5 9.5 4.4-1.5 7.5-5.1 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.2 10"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>'
  };
  const ic = (n, c) => '<svg class="gi' + (c ? ' ' + c : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || '') + '</svg>';
  const stars = (n) => n == null ? '' : '<span class="stars" role="img" aria-label="' + n + ' de 5">' + '★'.repeat(n) + '<span class="off">' + '★'.repeat(5 - n) + '</span></span>';
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#00A8FF');
  const avatar = (m, big) => '<span class="gp-av' + (big ? ' lg' : '') + '" style="background:' + safeColor(m.color) + '" aria-hidden="true">' + esc(initials(m.name)) + '</span>';

  /* ====================================================================== ESTADO */
  const emptyOf = () => ({ q: '', from: '', to: '', hour: '', wday: '', cat: '', pay: '', kind: '', st: '', place: '' });
  const emptyCf = () => ({ q: '', from: '', to: '', hour: '', wday: '', reason: '', zone: 'all', st: '', waiter: '' });
  const S = { open: false, view: 'boot', authTab: 'in', tab: 'orders', me: null, calls: [], mine: null, mineAt: 0, team: null,
    period: 7, hper: 7, zone: 'all', of: emptyOf(), cf: emptyCf(), msg: '', msgType: '', unsub: null, pollT: 0, tickT: 0, lastPend: null, pendingN: 0, soundOn: store.get('aq.gp.sound') !== '0', recovery: false,
    osDesk: null, osStaff: store.get('aq.os.staff') || '', osMsg: '', osN: 0, osPoll: 0, livePoll: 0, liveCalls: [], lastLive: null };
  const mt = (n) => Number(n || 0).toLocaleString('pt-PT') + ' MT';
  function hasOsApi() {
    return !!(window.AquaOS && AquaOS.live && AquaOS.live() && AquaOS.origin && AquaOS.origin());
  }
  async function osFetch(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (S.osStaff) headers.Authorization = 'Bearer ' + S.osStaff;
    const root = hasOsApi() ? AquaOS.origin() : '';
    if (!root) throw Object.assign(new Error('offline'), { status: 0, code: 'offline', silent: true });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(root + '/api' + path, { credentials: 'include', method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined, signal: ctrl.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || 'fail'), { status: res.status, code: data.error });
      return data;
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.code === 'offline')) throw Object.assign(new Error('offline'), { status: 0, code: 'offline' });
      throw e;
    } finally { clearTimeout(t); }
  }
  async function loadOsDesk() {
    const countOpen = (orders) => (orders || []).filter((o) => o.status !== 'cancelled' && o.status !== 'delivered').length;
    try {
      S.osDesk = await osFetch('/desk/board');
      S.osMsg = '';
      if (!S.osPoll) S.osPoll = setInterval(() => {
        if (staffLogged()) loadOsDesk().then(() => { if (S.open && S.view === 'app' && ['orders', 'team', 'dash', 'member', 'stats'].includes(S.tab)) renderTab(); }).catch(() => {});
      }, 2000);
    } catch (e) {
      if (window.AquaBus) {
        const d = AquaBus.read();
        S.osDesk = { orders: d.orders || [], calls: d.calls || [], role: (S.me && S.me.role) || 'bus' };
        S.osMsg = '';
      } else if (e.status === 401) { S.osDesk = null; S.osMsg = ''; }
      else S.osMsg = e.message || 'Sem ligação ao sistema de pedidos.';
    }
    setOrderBadge(countOpen(S.osDesk && S.osDesk.orders));
  }
  let root = null, pn = null, toasts = null, deb = 0;

  /* ====================================================================== ALERTAS (som, vibração, título, notificação) */
  let actx = null;
  function unlockAudio() { try { if (!actx) { const A = window.AudioContext || window.webkitAudioContext; if (A) actx = new A(); } if (actx && actx.state === 'suspended') actx.resume(); } catch (e) { /* */ } }
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  function beep() {
    try { unlockAudio(); if (!actx) return; const t = actx.currentTime;
      [[880, 0], [1175, 0.17], [1568, 0.34]].forEach(([f, d]) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.32, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.3);
        o.connect(g); g.connect(actx.destination); o.start(t + d); o.stop(t + d + 0.32); });
    } catch (e) { /* */ }
  }
  const baseTitle = document.title; let ftimer = 0;
  function flashTitle(n) {
    clearInterval(ftimer); if (!document.hidden) return; let i = 0;
    ftimer = setInterval(() => { document.title = (i++ % 2 ? baseTitle : '🔔 (' + n + ') Novo chamado'); if (!document.hidden || i > 40) { clearInterval(ftimer); document.title = baseTitle; } }, 900);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { clearInterval(ftimer); document.title = baseTitle; if (S.me && S.me.active) refreshCalls(); } });
  function toast(html, icon, type) {
    if (!toasts) { toasts = document.createElement('div'); toasts.className = 'gp-toasts'; toasts.id = 'gpToasts'; toasts.setAttribute('role', 'status'); toasts.setAttribute('aria-live', 'polite'); document.body.appendChild(toasts); }
    const t = document.createElement('div'); t.className = 'gp-toast' + (type ? ' ' + type : ''); t.innerHTML = ic(icon || 'bell') + '<span>' + html + '</span>';
    toasts.appendChild(t); setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, 5500);
  }
  function alertNew(fresh) {
    const c = fresh[0];
    toast('<b>Novo chamado</b> · ' + esc(tableName(c.tableCode)) + ' — ' + esc(REASONS[c.reason] || c.reason) + (fresh.length > 1 ? ' (+' + (fresh.length - 1) + ')' : ''), 'bell');
    if (S.soundOn) beep();
    try { if (navigator.vibrate) navigator.vibrate([180, 80, 180]); } catch (e) { /* */ }
    flashTitle(fresh.length);
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Novo chamado — ' + tableName(c.tableCode), { body: REASONS[c.reason] || '', tag: 'aq-call' }); } catch (e) { /* */ } }
  }

  /* ====================================================================== BARRA INFERIOR */
  function staffLogged() { return !!(S.me && S.me.active) || !!store.get('aq.os.staff') || !!store.get('aq.os.staff.me'); }
  function staffChrome() {
    try {
      const q = new URLSearchParams(location.search);
      if (q.get('equipa') === '1' || q.get('staff') === '1') return true;
      if (/^#(garcom|equipa|admin)/.test(location.hash || '')) return true;
      if (staffLogged()) return true;
    } catch (e) { /* */ }
    return false;
  }
  function showStaffBar(on) {
    document.documentElement.classList.toggle('staff-chrome', !!on);
    if (pn) pn.hidden = !on;
  }
  function dockItems() {
    const admin = S.me && S.me.role === 'admin';
    const items = [['orders', 'Pedidos', 'card'], ['calls', 'Chamados', 'bell']];
    if (admin) items.push(['admin', 'Admin', 'users']);
    else items.push(['profile', 'Perfil', 'user']);
    return items;
  }
  function paintNav() {
    if (!pn) return;
    pn.innerHTML = dockItems().map((x) =>
      '<button type="button" data-k="' + x[0] + '" aria-label="' + x[1] + '" title="' + x[1] + '">' + ic(x[2]) + '<span class="lbl">' + x[1] + '</span>' +
      (x[0] === 'orders' ? '<span class="bd" id="pnBdOrd" hidden>0</span>' : '') +
      (x[0] === 'calls' ? '<span class="bd" id="pnBd" hidden>0</span>' : '') + '</button>').join('');
    syncNav(); setBadge(S.pendingN); setOrderBadge(S.osN);
  }
  function buildNav() {
    pn = document.createElement('nav'); pn.className = 'pn'; pn.id = 'pn'; pn.setAttribute('aria-label', 'Navegação da equipa'); pn.hidden = !staffLogged();
    showStaffBar(staffLogged());
    paintNav();
    document.body.appendChild(pn);
    pn.addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (!b) return; navGo(b.dataset.k); });
  }
  function navGo(k) {
    if (k === 'admin') { if (S.open && S.view === 'app') enterTab('dash'); else openPortal('dash'); }
    else if (S.open && S.view === 'app') enterTab(k);
    else openPortal(k);
    syncNav();
  }
  function syncNav() {
    if (!pn) return;
    if (!S.me && staffLogged()) { /* keep */ }
    const cur = !S.open ? '' : ((S.tab === 'team' || S.tab === 'dash' || S.tab === 'member') ? 'admin' : S.tab);
    $$('button[data-k]', pn).forEach((b) => { if (b.dataset.k === cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  }
  function toggleTheme() { const d = document.documentElement; if (d.dataset.theme === 'dark') { delete d.dataset.theme; store.set('aq.theme', 'light'); } else { d.dataset.theme = 'dark'; store.set('aq.theme', 'dark'); } }
  function setOrderBadge(n) {
    S.osN = n || 0;
    const bd = $('#pnBdOrd'); if (bd) { bd.hidden = !S.osN || !staffLogged(); bd.textContent = S.osN > 99 ? '99+' : String(S.osN); }
    const tn = $('#tabNOrd'); if (tn) { tn.hidden = !S.osN; tn.textContent = String(S.osN); }
  }
  function setBadge(n) {
    const prev = S.pendingN; S.pendingN = n;
    const on = staffLogged();
    const bd = $('#pnBd'); if (bd) { bd.hidden = !n || !on; bd.textContent = n > 99 ? '99+' : String(n); if (n > prev) { bd.classList.remove('ping'); void bd.offsetWidth; bd.classList.add('ping'); } }
    const tn = $('#tabN'); if (tn) { tn.hidden = !n; tn.textContent = String(n); }
  }

  /* ====================================================================== PORTAL: abrir / fechar */
  function build() {
    if (root) return;
    root = document.createElement('div'); root.id = 'gp'; root.className = 'gp'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Área do garçom');
    root.innerHTML = '<header class="gp-top"><div class="gp-brand"><img src="assets/logo.webp" alt="" width="38" height="38" onerror="this.onerror=null;this.src=&quot;assets/logo.png&quot;"><span>Aqua <b>Club</b> · Garçom</span></div><span class="sp"></span><span class="gp-mode" id="gpMode"></span>' +
      '<button class="gp-x" type="button" data-act="close" aria-label="Fechar área do garçom">' + ic('x') + '</button></header><div class="gp-scroll" id="gpScroll"><div class="gp-wrap" id="gpMain"></div></div>';
    document.body.appendChild(root);
    root.addEventListener('click', onClick); root.addEventListener('submit', onSubmit); root.addEventListener('change', onFilterChange);
  }
  function setInert(on) { Array.from(document.body.children).forEach((el) => { if (el === root || el === pn || el === toasts || /^(SCRIPT|STYLE|LINK|DIALOG)$/.test(el.tagName)) return; if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); }); }
  async function openPortal(tab) {
    build(); S.tab = tab || 'orders'; S.open = true; root.hidden = false;
    document.documentElement.classList.add('gp-open'); showStaffBar(staffLogged()); setInert(true); syncNav();
    await boot();
    showStaffBar(staffLogged()); paintNav();
    const f = $('.gp-x', root); if (f && S.view !== 'auth') f.focus({ preventScroll: true });
  }
  function closePortal() {
    if (!S.open) return; S.open = false; if (root) root.hidden = true;
    document.documentElement.classList.remove('gp-open', 'gp-admin'); showStaffBar(staffLogged()); setInert(false); paintNav();
    if (/^#(garcom|equipa|admin)/.test(location.hash)) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* */ } }
  }

  /* ====================================================================== arranque: sessão → perfil → vista */
  async function boot() {
    const m = mode(); S.msg = '';
    if (m === 'whatsapp') { S.view = 'nobackend'; render(); return; }
    S.view = 'boot'; render();
    const be = backend(); be.onRecovery = () => { S.recovery = true; if (!S.open) openPortal(S.tab); else boot(); };
    try {
      const sess = await be.session();
      if (!sess) { S.me = null; stopWork(); S.view = 'auth'; render(); return; }
      if (S.recovery) { S.view = 'recover'; render(); return; }
      const p = await be.profile(); S.me = p;
      if (!p) { stopWork(); S.view = 'noprofile'; render(); return; }
      if (!p.active) { stopWork(); S.view = 'pending'; S.pollT = setInterval(async () => { try { const q = await be.profile(); if (q && q.active) { clearInterval(S.pollT); boot(); } } catch (e) { /* */ } }, 6000); render(); return; }
      S.view = 'app'; showStaffBar(true); paintNav(); render(); startWork(); await loadOsDesk(); await enterTab(S.tab);
    } catch (e) { S.view = 'error'; S.msg = e.message; render(); }
  }
  async function silentBoot() {
    const be = backend(); if (!be) return;
    try { be.onRecovery = () => { S.recovery = true; openPortal(S.tab); };
      const sess = await be.session(); if (!sess) return;
      const p = await be.profile(); if (p && p.active) { S.me = p; S.view = 'app'; startWork(); }
    } catch (e) { /* sem rede: ignora */ }
  }
  function isoCall(t) {
    if (!t) return null;
    const s = String(t).replace(' ', 'T');
    return /Z$|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z';
  }
  function mapOsCall(c) {
    const reasonMap = { conta: 'request_bill', duvida: 'menu_question', pedido: 'new_order', urgente: 'urgent_other' };
    const st = c.status === 'closed' ? 'completed' : c.status;
    return {
      id: 'os-' + c.id, osId: c.id, live: true,
      tableCode: (Number(c.table_number) > 0 ? ('Mesa-' + String(c.table_number).padStart(2, '0')) : (c.place || c.note || 'Cliente')),
      zone: 'all',
      reason: reasonMap[c.reason] || c.reason,
      note: [c.customer_name, c.customer_phone, c.note].filter(Boolean).join(' · '),
      status: st,
      createdAt: isoCall(c.created_at || c.ts || Date.now()),
      acceptedAt: isoCall(c.accepted_at),
      completedAt: isoCall(c.closed_at),
      by: c.waiterName || '',
      byUser: c.waiter_id ? 'os-w-' + c.waiter_id : 'live'
    };
  }
  function mergeLiveIntoCalls() {
    const live = S.liveCalls || [];
    const demo = (S.calls || []).filter((c) => !c.live && !String(c.id).startsWith('os-'));
    S.calls = live.concat(demo);
  }
  function busCalls() {
    try {
      const d = (window.AquaBus && AquaBus.read()) || JSON.parse(localStorage.getItem('aq.os.bus') || '{}');
      return (d.calls || []).map(mapOsCall);
    } catch (e) { return []; }
  }
  async function refreshLiveCalls() {
    try {
      let mapped = [];
      try {
        const r = await fetch('/api/live/calls', { credentials: 'include' });
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('json')) {
          const d = await r.json();
          mapped = (d.calls || []).map(mapOsCall);
        }
      } catch (e) { /* estático */ }
      const local = busCalls();
      const seen = new Set(mapped.map((c) => c.id));
      local.forEach((c) => { if (!seen.has(c.id)) mapped.push(c); });
      const prev = sigOf(S.liveCalls || []);
      S.liveCalls = mapped;
      mergeLiveIntoCalls();
      const pend = mapped.filter((c) => c.status === 'pending');
      setBadge(pend.length);
      if (S.lastLive) {
        const fresh = pend.filter((c) => !S.lastLive.has(c.id));
        if (fresh.length) alertNew(fresh);
      }
      S.lastLive = new Set(pend.map((c) => c.id));
      if (S.open && S.view === 'app' && ['calls', 'orders', 'dash', 'member', 'team'].includes(S.tab) && sigOf(mapped) !== prev) renderTab();
    } catch (e) { /* */ }
  }
  function startLiveCalls() {
    if (S.livePoll) return;
    refreshLiveCalls();
    S.livePoll = setInterval(refreshLiveCalls, 3000);
    if (!window.__aqStaffUp) {
      window.__aqStaffUp = true;
      const bump = () => {
        refreshLiveCalls();
        if (S.open && S.view === 'app' && ['orders', 'dash', 'team', 'member', 'stats'].includes(S.tab)) loadOsDesk().then(() => { if (['orders', 'dash', 'team', 'member', 'stats'].includes(S.tab)) renderTab(); }).catch(() => {});
      };
      window.addEventListener('aq-os-up', bump);
      try {
        window.__aqStaffBc = new BroadcastChannel('aq-os');
        window.__aqStaffBc.onmessage = bump;
      } catch (e) { /* */ }
    }
    if (window.io && !S.osSock) {
      S.osSock = window.io({ transports: ['websocket', 'polling'] });
      S.osSock.on('call:new', () => refreshLiveCalls());
      S.osSock.on('call:updated', () => refreshLiveCalls());
      S.osSock.on('order:new', () => { if (['orders', 'dash', 'team', 'member', 'stats'].includes(S.tab)) loadOsDesk().then(() => renderTab()); });
    } else if (!window.io && !document.querySelector('script[data-aq-io]')) {
      const origin = (window.AquaOS && AquaOS.origin && AquaOS.origin()) || '';
      if (!origin) return;
      const s = document.createElement('script');
      s.src = origin + '/socket.io/socket.io.js';
      s.dataset.aqIo = '1';
      s.onload = () => { if (!S.osSock) { S.osSock = window.io({ transports: ['websocket', 'polling'] }); S.osSock.on('call:new', () => refreshLiveCalls()); S.osSock.on('call:updated', () => refreshLiveCalls()); } };
      document.head.appendChild(s);
    }
  }
  function startWork() {
    stopWork(); const be = backend(); if (!be) return;
    S.unsub = be.subscribe(() => { clearTimeout(deb); deb = setTimeout(refreshCalls, 250); });
    S.pollT = setInterval(refreshCalls, 4000); S.tickT = setInterval(tick, 1000);
    S.alarmT = setInterval(nagPending, 3500); refreshCalls();
    startLiveCalls();
  }
  function nagPending() {
    if (!S.soundOn || !S.me || !S.me.active) return;
    const pend = [].concat(S.calls || [], S.liveCalls || []).filter((c) => c && c.status === 'pending');
    if (!pend.length) return;
    beep();
    try { if (navigator.vibrate) navigator.vibrate([160, 70, 160]); } catch (e) { /* */ }
  }
  function stopWork() { if (S.unsub) { try { S.unsub(); } catch (e) { /* */ } } S.unsub = null; clearInterval(S.pollT); clearInterval(S.tickT); clearInterval(S.alarmT); S.lastPend = null; setBadge(0); }
  const sigOf = (l) => l.map((c) => c.id + c.status + c.by + c.released).join('|');
  async function refreshCalls() {
    if (!S.me || !S.me.active) return;
    const be = backend(); if (!be) return;
    try {
      const list = await be.listCalls(Date.now() - 864e5), prev = sigOf(S.calls); S.calls = list;
      mergeLiveIntoCalls();
      const pend = S.calls.filter((c) => c.status === 'pending'); setBadge(pend.length);
      if (S.lastPend) { const fresh = pend.filter((c) => !S.lastPend.has(c.id)); if (fresh.length) alertNew(fresh); }
      S.lastPend = new Set(pend.map((c) => c.id));
      if (S.open && S.view === 'app' && ['calls', 'dash', 'member', 'team', 'stats'].includes(S.tab) && sigOf(list) !== prev) renderTab();
    } catch (e) { /* offline: tenta no próximo ciclo */ }
  }
  function tick() {
    if (!S.open || !root) return; const now = Date.now();
    $$('.gc-timer[data-since]', root).forEach((el) => {
      const ms = now - Date.parse(el.dataset.since); el.lastElementChild.textContent = mmss(ms);
      const card = el.closest('.gc'); if (card && card.dataset.urg != null) { card.classList.toggle('u1', ms >= 120000 && ms < 300000); card.classList.toggle('u2', ms >= 300000); }
    });
  }

  /* ====================================================================== RENDER: vistas */
  const loadingHTML = '<div class="gp-empty">' + ic('clock') + '<b>A carregar…</b></div>';
  function render() {
    const m = $('#gpMain'); if (!m) return; const v = S.view, md = mode();
    const badge = $('#gpMode'); badge.textContent = md === 'demo' ? 'Demonstração' : (md === 'live' || md === 'desk') ? 'Ao vivo' : 'Sem ligação'; badge.className = 'gp-mode' + (md === 'demo' ? ' demo' : '');
    if (v === 'boot') m.innerHTML = loadingHTML;
    else if (v === 'nobackend') m.innerHTML = viewNoBackend();
    else if (v === 'auth') m.innerHTML = viewAuth();
    else if (v === 'confirm') m.innerHTML = viewConfirm();
    else if (v === 'pending') m.innerHTML = viewPending();
    else if (v === 'noprofile') m.innerHTML = viewSimple('shield', 'Conta sem perfil', 'A sua conta existe mas ainda não tem perfil de equipa. Peça ao administrador para verificar, ou saia e crie a conta de novo.', true);
    else if (v === 'recover') m.innerHTML = viewRecover();
    else if (v === 'error') m.innerHTML = viewSimple('alert', 'Não foi possível carregar', esc(S.msg || 'Verifique a ligação à internet.'), false, true);
    else if (v === 'app') { m.innerHTML = appFrame(); renderTab(); }
    document.documentElement.classList.toggle('gp-admin', !!(S.open && S.me && v === 'app'));
    const brand = root && $('.gp-brand span', root);
    if (brand) brand.innerHTML = 'Aqua <b>Club</b> · ' + (S.me && S.me.role === 'admin' && v === 'app' ? 'Admin' : 'Garçom');
    syncNav();
  }
  function viewSimple(icon, title, text, logout, retry) {
    return '<div class="gp-auth"><div class="gp-hero"><div class="ico">' + ic(icon) + '</div><h2>' + title + '</h2><p>' + text + '</p></div><div class="gp-card" style="display:grid;gap:.6rem">' +
      (retry ? '<button class="gb" data-act="retry">Tentar de novo</button>' : '') + (logout ? '<button class="gb line" data-act="logout">' + ic('logout') + 'Sair</button>' : '') + '</div></div>';
  }
  function viewNoBackend() {
    return '<div class="gp-auth"><div class="gp-hero"><div class="ico">' + ic('user') + '</div><h2>Área do garçom</h2><p>Este site está no modo <b>WhatsApp</b>: os chamados seguem por mensagem e não há contas de garçom.</p></div>' +
      '<div class="gp-card"><h3>Como ativar</h3><p class="gp-muted">Ligue o Supabase (gratuito) no ficheiro <b>index.html</b> e corra o <b>schema_v3_garcons.sql</b>. O guia <b>GUIA-GARCONS.md</b> explica tudo em 10 minutos.</p></div>' +
      '<div class="gp-card"><h3>Experimentar já</h3><p class="gp-muted">A demonstração funciona neste navegador, sem configurar nada: abra o site em duas abas — numa chame o garçom, na outra entre como garçom.</p>' +
      '<a class="gb block" style="margin-top:.8rem;text-decoration:none" href="?modo=demo#garcom">Abrir a demonstração</a></div></div>';
  }
  function viewAuth() {
    const up = S.authTab === 'up';
    const desk = mode() === 'desk';
    const pw = (id, label, ac, min) => '<label>' + label + '<span class="gp-pw"><input id="' + id + '" name="' + id + '" type="password" autocomplete="' + ac + '" required minlength="' + (min || 8) + '" inputmode="' + (min === 4 ? 'numeric' : 'text') + '"><button type="button" data-act="pw" aria-label="Mostrar ou esconder a palavra-passe">' + ic('eye') + '</button></span></label>';
    if (desk) {
      return '<div class="gp-auth"><div class="gp-hero"><div class="ico">' + ic('shield') + '</div><h2>Área da equipa</h2><p>Garçons entram com o PIN. A administração entra com PIN de admin ou e-mail da casa.</p></div>' +
        '<div class="gp-seg" role="tablist" aria-label="Como entrar"><button type="button" role="tab" data-act="authtab" data-v="in" aria-selected="' + !up + '">PIN da equipa</button><button type="button" role="tab" data-act="authtab" data-v="up" aria-selected="' + up + '">E-mail admin</button></div>' +
        '<div class="gp-card">' + (up
          ? '<form class="gp-form" data-form="osadmin" novalidate><label>E-mail da administração<input name="email" type="email" autocomplete="username" required></label>' +
            pw('password', 'Palavra-passe', 'current-password') +
            '<button class="gb block" type="submit">Entrar como administração</button><p class="gp-msg ' + S.msgType + '" role="alert">' + esc(S.msg || S.osMsg) + '</p></form>'
          : '<form class="gp-form" data-form="pin" novalidate>' + pw('pin', 'PIN (4 ou mais dígitos)', 'one-time-code', 4) +
            '<button class="gb block" type="submit">Entrar</button><p class="gp-muted" style="margin:0">O PIN é o da sua ficha. Peça-o à administração se ainda não o tiver.</p><p class="gp-msg ' + S.msgType + '" role="alert">' + esc(S.msg) + '</p></form>') + '</div>' +
        (!(window.AquaOS && AquaOS.live && AquaOS.live()) ? '<div class="gp-demo"><b>Neste telemóvel (sem servidor)</b> — garçom <b>1001</b> a <b>1010</b> (Amélia… Samuel). Administração <b>2468</b>. Altere os PINs no Admin depois de entrar.</div>' : '') + '</div>';
    }
    return '<div class="gp-auth"><div class="gp-hero"><div class="ico">' + ic('user') + '</div><h2>Área do garçom</h2><p>Aceite chamados das mesas, acompanhe o seu desempenho e a sua equipa.</p></div>' +
      '<div class="gp-seg" role="tablist" aria-label="Entrar ou criar conta"><button type="button" role="tab" data-act="authtab" data-v="in" aria-selected="' + !up + '">Entrar</button><button type="button" role="tab" data-act="authtab" data-v="up" aria-selected="' + up + '">Criar conta</button></div>' +
      '<div class="gp-card">' + (up
        ? '<form class="gp-form" data-form="up" novalidate><label>Nome completo<input name="name" id="gpName" autocomplete="name" maxlength="60" required></label>' +
          '<div class="gp-row2"><label>E-mail<input name="email" type="email" autocomplete="email" required></label><label>Telemóvel<input name="phone" type="tel" autocomplete="tel" maxlength="20" placeholder="84 000 0000"></label></div>' +
          pw('password', 'Palavra-passe (mín. 8)', 'new-password') +
          '<label>Repetir palavra-passe<input name="password2" type="password" autocomplete="new-password" required minlength="8"></label>' +
          '<button class="gb block" type="submit">Pedir acesso</button><p class="gp-muted" style="margin:0">A conta fica <b>pendente</b> até um administrador a aprovar.</p><p class="gp-msg ' + S.msgType + '" role="alert">' + esc(S.msg) + '</p></form>'
        : '<form class="gp-form" data-form="in" novalidate><label>E-mail<input name="email" id="gpEmail" type="email" autocomplete="username" required></label>' + pw('password', 'Palavra-passe', 'current-password') +
          '<button class="gb block" type="submit">Entrar</button><button type="button" class="gp-link" data-act="forgot">Esqueci a palavra-passe</button><p class="gp-msg ' + S.msgType + '" role="alert">' + esc(S.msg) + '</p></form>') + '</div></div>';
  }
  function viewConfirm() { return viewSimple('mail', 'Conta criada!', 'Enviámos um e-mail de confirmação. Confirme o endereço e depois <b>aguarde a aprovação</b> do administrador. Pode entrar assim que for aprovado.', false) + '<div class="gp-auth"><button class="gb line block" data-act="authtab" data-v="in">Ir para Entrar</button></div>'; }
  function viewPending() {
    return '<div class="gp-auth"><div class="gp-hero"><div class="ico">' + ic('clock') + '</div><h2>A aguardar aprovação</h2><p>Olá, <b>' + esc(S.me.name) + '</b>! O seu pedido de acesso foi recebido. Assim que um administrador o aprovar, esta página abre sozinha.</p></div>' +
      '<div class="gp-card" style="display:grid;gap:.6rem"><button class="gb" data-act="recheck">Verificar agora</button><button class="gb line" data-act="logout">' + ic('logout') + 'Sair</button></div></div>';
  }
  function viewRecover() {
    return '<div class="gp-auth"><div class="gp-hero"><div class="ico">' + ic('shield') + '</div><h2>Nova palavra-passe</h2><p>Escolha uma palavra-passe nova para a sua conta.</p></div><div class="gp-card"><form class="gp-form" data-form="recover" novalidate>' +
      '<label>Nova palavra-passe (mín. 8)<input name="password" type="password" autocomplete="new-password" required minlength="8"></label><button class="gb block" type="submit">Guardar</button><p class="gp-msg ' + S.msgType + '" role="alert">' + esc(S.msg) + '</p></form></div></div>';
  }
  function staffTabs() {
    if (S.me && S.me.role === 'admin') return [
      ['dash', 'Painel', 'home'], ['orders', 'Pedidos', 'card'], ['calls', 'Chamados', 'bell'],
      ['team', 'Equipa', 'users'], ['stats', 'Relatórios', 'chart'], ['profile', 'Casa', 'user']
    ];
    return [
      ['dash', 'Painel', 'home'], ['orders', 'Pedidos', 'card'], ['calls', 'Chamados', 'bell'],
      ['hist', 'Histórico', 'list'], ['stats', 'Relatórios', 'chart'], ['profile', 'Perfil', 'user']
    ];
  }
  function tabSelected(id) {
    if (S.tab === id) return true;
    if (S.tab === 'member' && id === 'team') return true;
    return false;
  }
  function tabBadge(id) {
    if (id === 'calls') return '<span class="n" id="tabN"' + (S.pendingN ? '' : ' hidden') + '>' + S.pendingN + '</span>';
    if (id === 'orders') return '<span class="n" id="tabNOrd"' + (S.osN ? '' : ' hidden') + '>' + S.osN + '</span>';
    return '';
  }
  function appFrame() {
    const me = S.me, admin = me.role === 'admin', tabs = staffTabs();
    const who = '<div class="gp-card"><div class="gp-who">' + avatar(me) + '<div><h2>' + esc(me.name) + '<span class="gp-role">' + (admin ? 'Admin' : 'Garçom') + '</span></h2><small>' + esc(me.email || me.phone || 'PIN da casa') + '</small></div></div></div>';
    const side = '<nav class="gp-side" aria-label="Secções">' + tabs.map((t) =>
      '<button class="gp-side-btn" type="button" data-act="tab" data-t="' + t[0] + '" aria-selected="' + tabSelected(t[0]) + '" title="' + t[1] + '">' + ic(t[2]) + '<span class="gp-side-lab">' + t[1] + '</span>' + tabBadge(t[0]) + '</button>'
    ).join('') + '</nav>';
    return '<div class="gp-shell is-admin">' + side + '<div class="gp-maincol">' + who + '<div id="gpc" aria-live="polite"></div></div></div>';
  }
  async function enterTab(t) {
    const admin = !!(S.me && S.me.role === 'admin');
    if (t === 'admin') t = 'dash';
    if ((t === 'team' || t === 'member') && !admin) t = 'dash';
    S.tab = t; if (S.view !== 'app') { syncNav(); return; }
    $$('.gp-tab, .gp-side-btn', root).forEach((b) => { const on = tabSelected(b.dataset.t); b.setAttribute('aria-selected', String(on)); if (on && b.scrollIntoView) { try { b.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { /* */ } } }); syncNav();
    const c = $('#gpc'); if (!c) return;
    try {
      if (t === 'orders' || t === 'team' || t === 'dash' || t === 'member' || t === 'stats') { c.innerHTML = loadingHTML; await loadOsDesk(); }
      if (['hist', 'stats', 'profile', 'dash', 'member'].includes(t) && (!S.mine || Date.now() - S.mineAt > 15000)) { if (!S.mine) c.innerHTML = loadingHTML; await loadMine(); }
      if (admin && (t === 'team' || t === 'dash' || t === 'member' || t === 'stats')) { c.innerHTML = loadingHTML; await loadTeam(); }
    } catch (e) { toast(esc(e.message), 'alert', 'err'); if (!S.mine) S.mine = []; }
    if (S.tab === t) renderTab();
  }
  async function loadMine() { S.mine = await backend().myCalls(startOfDay(Date.now()) - 29 * 864e5); S.mineAt = Date.now(); }
  async function loadTeam() { const be = backend(); const [staff, calls] = await Promise.all([be.team(), be.listCalls(startOfDay(Date.now()) - 29 * 864e5)]); S.team = { staff, calls }; }
  function renderTab() {
    const c = $('#gpc'); if (!c || S.view !== 'app') return;
    const f = { orders: tabOrders, calls: tabCalls, hist: tabHist, stats: tabStats, profile: tabProfile, team: tabTeam, dash: tabDash, member: tabMember }[S.tab] || tabOrders;
    const sc = $('#gpScroll'), y = sc ? sc.scrollTop : 0; c.innerHTML = f(); if (sc) sc.scrollTop = y; tick();
    $$('.gp-tab, .gp-side-btn', root).forEach((b) => b.setAttribute('aria-selected', String(tabSelected(b.dataset.t))));
  }

  /* ====================================================================== DASHBOARD ADMIN */
  const ZONE_CYCLE = ['rooftop', 'piscina', 'sala-principal'];
  function mergedCalls() {
    const cmap = new Map();
    [].concat(S.calls || [], S.liveCalls || [], S.mine || [], (S.osDesk && S.osDesk.calls) || [], (S.team && S.team.calls) || []).forEach((c) => {
      if (!c) return;
      const id = String(c.id || '');
      if (!id) return;
      const st = c.status === 'closed' ? 'completed' : c.status;
      const prev = cmap.get(id) || {};
      cmap.set(id, Object.assign({}, prev, c, {
        status: st,
        createdAt: c.createdAt || c.created_at || prev.createdAt,
        acceptedAt: c.acceptedAt || c.accepted_at || prev.acceptedAt,
        completedAt: c.completedAt || c.closed_at || prev.completedAt,
        by: c.by || c.waiterName || prev.by || '',
        byUser: c.byUser || c.waiter_id || prev.byUser || null
      }));
    });
    return Array.from(cmap.values());
  }
  function orderMs(o) { return Date.parse(o.created_at || o.ts || 0) || Number(o.ts) || 0; }
  function deskOrders() { return ((S.osDesk && S.osDesk.orders) || []).filter((o) => o && o.status !== 'cancelled'); }
  function revenueOf(list) { return list.filter(isPaid).reduce((s, o) => s + Number(o.total || 0), 0); }
  function callsForMember(m, calls) {
    const ids = new Set([String(m.id || ''), String(m.user_id || '')]);
    const name = String(m.name || '').toLowerCase();
    return (calls || []).filter((c) => {
      const uid = String(c.byUser || c.waiter_id || '');
      const by = String(c.by || c.waiterName || '').toLowerCase();
      return ids.has(uid) || (name && by === name);
    });
  }
  function dayBars(series, money) {
    const maxD = Math.max(1, ...series.map((x) => x.n));
    return '<div class="gp-bars">' + series.map((x) => {
      const label = money ? mt(x.n) : (x.n || '');
      return '<div class="col' + (x.today ? ' today' : '') + '" title="' + x.key + ': ' + label + '"><u>' + (money ? (x.n ? Math.round(x.n / 1000) + 'k' : '') : (x.n || '')) + '</u><i style="height:' + Math.round((x.n / maxD) * 100) + '%"></i><em>' + x.label + '</em></div>';
    }).join('') + '</div>';
  }
  function moneySeries(orders, days) {
    const t0 = startOfDay(Date.now()), per = {};
    (orders || []).forEach((o) => {
      const ms = orderMs(o); if (!ms || !isPaid(o)) return;
      const k = dayKey(ms); per[k] = (per[k] || 0) + Number(o.total || 0);
    });
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const ms = t0 - i * 864e5, d = new Date(ms);
      series.push({ key: dayKey(ms), label: DAYN[d.getDay()], n: per[dayKey(ms)] || 0, today: i === 0 });
    }
    return series;
  }
  function miniCal(hotDays) {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    const first = new Date(y, m, 1);
    const startPad = (first.getDay() + 6) % 7;
    const dim = new Date(y, m + 1, 0).getDate();
    const today = now.getDate();
    const hot = hotDays || new Set();
    const cells = [];
    ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].forEach((d) => cells.push('<em>' + d + '</em>'));
    for (let i = 0; i < startPad; i++) cells.push('<button type="button" class="mute" tabindex="-1"></button>');
    for (let d = 1; d <= dim; d++) {
      const key = y + '-' + pad(m + 1) + '-' + pad(d);
      cells.push('<button type="button" class="' + (d === today ? 'on' : '') + (hot.has(key) ? ' dot' : '') + '" tabindex="-1">' + d + '</button>');
    }
    return '<div class="gp-cal"><div class="gp-cal-head"><span>' + MONN[m] + ' ' + y + '</span><span class="gp-muted">movimento</span></div><div class="gp-cal-grid">' + cells.join('') + '</div></div>';
  }
  function pct(a, b) { return !b ? '—' : Math.round((a / b) * 100) + '%'; }
  function spark(vals, color) {
    const arr = (vals && vals.length) ? vals : [0];
    const n = arr.length, max = Math.max(1, ...arr);
    const pts = arr.map((v, i) => ((n === 1 ? 50 : (i / (n - 1)) * 100).toFixed(1) + ',' + (30 - (v / max) * 26).toFixed(1))).join(' ');
    return '<svg class="gp-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="' + (color || '#00A8FF') + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" points="' + pts + '"/></svg>';
  }
  function donutHtml(parts) {
    const tot = parts.reduce((s, p) => s + p.n, 0);
    if (!tot) return '<p class="gp-muted">Sem dados neste período.</p>';
    const C = 2 * Math.PI * 38;
    let acc = 0;
    const segs = parts.filter((p) => p.n > 0).map((p) => {
      const dash = (p.n / tot) * C, gap = C - dash, off = acc;
      acc += dash;
      return '<circle r="38" cx="50" cy="50" fill="none" stroke="' + p.color + '" stroke-width="12" stroke-dasharray="' + dash.toFixed(2) + ' ' + gap.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"/>';
    }).join('');
    return '<div class="gp-donut"><svg viewBox="0 0 100 100" aria-hidden="true"><circle r="38" cx="50" cy="50" fill="none" stroke="#E8F6FF" stroke-width="12"/>' + segs + '</svg><ul>' +
      parts.map((p) => '<li><i style="background:' + p.color + '"></i>' + esc(p.label) + ' <b>' + p.n + '</b> · ' + pct(p.n, tot) + '</li>').join('') + '</ul></div>';
  }
  function selOpts(cur, list) {
    return list.map((x) => '<option value="' + esc(x[0]) + '"' + (String(cur) === String(x[0]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('');
  }
  function inDateRange(ms, from, to) {
    if (!ms) return !from && !to;
    if (from) { const a = Date.parse(from + 'T00:00:00'); if (Number.isFinite(a) && ms < a) return false; }
    if (to) { const b = Date.parse(to + 'T23:59:59'); if (Number.isFinite(b) && ms > b) return false; }
    return true;
  }
  function matchHourDay(ms, hour, wday) {
    if (!ms && (hour || wday)) return false;
    if (!ms) return true;
    const d = new Date(ms);
    if (hour !== '' && hour != null && String(hour) !== '' && d.getHours() !== Number(hour)) return false;
    if (wday !== '' && wday != null && String(wday) !== '' && d.getDay() !== Number(wday)) return false;
    return true;
  }
  function orderCats(o) {
    return (o.items || o.lines || []).map((i) => String(i.cat || i.category || '').trim()).filter(Boolean);
  }
  function orderText(o) {
    const items = (o.items || o.lines || []).map((i) => i.name || '').join(' ');
    return [o.customer_name, o.customer && o.customer.name, o.customer_phone, o.phone, o.code, orderPlace(o), o.address, items, o.note].join(' ').toLowerCase();
  }
  function knownCats(orders) {
    const set = new Set();
    (orders || []).forEach((o) => orderCats(o).forEach((c) => set.add(c)));
    return Array.from(set).sort();
  }
  function filterOrders(list) {
    const f = S.of || emptyOf();
    const q = String(f.q || '').trim().toLowerCase();
    return (list || []).filter((o) => {
      if (!o) return false;
      if (f.st === 'paid') { if (!isPaid(o) || o.status === 'cancelled') return false; }
      else if (f.st === 'unpaid') { if (isPaid(o) || o.status === 'cancelled') return false; }
      else if (f.st === 'cancelled') { if (o.status !== 'cancelled') return false; }
      else {
        if (o.status === 'cancelled') return false;
        if (f.st && o.status !== f.st) return false;
      }
      if (f.pay && payMethodOf(o) !== f.pay) return false;
      if (f.kind === 'dine' && o.fulfillment !== 'dine_in' && o.take !== 'table') return false;
      if (f.kind === 'delivery' && !isDelivery(o)) return false;
      if (f.kind === 'pickup' && o.take !== 'pickup' && o.fulfillment === 'dine_in') return false;
      if (f.cat && !orderCats(o).includes(f.cat)) return false;
      if (f.place && String(orderPlace(o) || '').toLowerCase().indexOf(String(f.place).toLowerCase()) < 0) return false;
      const ms = orderMs(o);
      if (!inDateRange(ms, f.from, f.to) || !matchHourDay(ms, f.hour, f.wday)) return false;
      if (q && orderText(o).indexOf(q) < 0) return false;
      return true;
    });
  }
  function filterCalls(list) {
    const f = S.cf || emptyCf();
    const q = String(f.q || '').trim().toLowerCase();
    const zone = f.zone || S.zone || 'all';
    return (list || []).filter((c) => {
      if (!c) return false;
      const st = c.status === 'closed' ? 'completed' : c.status;
      if (f.st && st !== f.st) return false;
      if (zone !== 'all' && c.zone !== 'all' && c.zone !== zone) return false;
      if (f.reason && c.reason !== f.reason) return false;
      if (f.waiter) {
        const by = String(c.by || c.waiterName || '').toLowerCase();
        if (by.indexOf(String(f.waiter).toLowerCase()) < 0) return false;
      }
      const ms = ts(c.createdAt);
      if (!inDateRange(ms, f.from, f.to) || !matchHourDay(ms, f.hour, f.wday)) return false;
      if (q) {
        const blob = [tableName(c.tableCode), c.place, c.note, c.by, REASONS[c.reason], c.reason].join(' ').toLowerCase();
        if (blob.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    if (/[;"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function downloadCsv(name, rows) {
    const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Exportado: ' + name, 'check', 'ok');
  }
  function waiterBoard(calls, since) {
    const map = {};
    (calls || []).forEach((c) => {
      const ms = ts(c.createdAt); if (since && ms && ms < since) return;
      const name = String(c.by || c.waiterName || '').trim();
      if (!name) return;
      const row = map[name] || { name, n: 0, pend: 0, resp: [], hours: 0 };
      const st = c.status === 'closed' ? 'completed' : c.status;
      if (st === 'pending') row.pend++;
      if (st === 'accepted' || st === 'completed') {
        row.n++;
        if (c.acceptedAt && c.createdAt) { const r = ts(c.acceptedAt) - ts(c.createdAt); if (r >= 0 && r < 12 * 36e5) row.resp.push(r); }
        if (c.completedAt && c.acceptedAt) { const s = ts(c.completedAt) - ts(c.acceptedAt); if (s >= 0 && s < 12 * 36e5) row.hours += s; }
      }
      map[name] = row;
    });
    return Object.values(map).sort((a, b) => b.n - a.n || b.hours - a.hours);
  }
  function avgArr(a) { return a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
  function insightPeriodMs() { return startOfDay(Date.now()) - ((S.period || 7) - 1) * 864e5; }
  function insightHtml(admin) {
    const ordersAll = deskOrders();
    const since = insightPeriodMs(), t0 = startOfDay(Date.now());
    const orders = ordersAll.filter((o) => orderMs(o) >= since);
    const calls = mergedCalls().filter((c) => ts(c.createdAt) >= since);
    const paid = orders.filter(isPaid);
    const rev = revenueOf(paid);
    const ticket = paid.length ? rev / paid.length : 0;
    const weekR = moneySeries(ordersAll, 7);
    const weekC = computeStats(mergedCalls(), t0 - 6 * 864e5, 7);
    const payMix = [
      { n: paid.filter((o) => payMethodOf(o) === 'mpesa').length, color: '#00A8FF', label: 'M-Pesa' },
      { n: paid.filter((o) => payMethodOf(o) === 'emola').length, color: '#FFD700', label: 'e-Mola' },
      { n: paid.filter((o) => payMethodOf(o) === 'pos').length, color: '#0A0A0A', label: 'POS' },
      { n: orders.filter((o) => !isPaid(o)).length, color: '#C4B59A', label: 'Por pagar' }
    ];
    const board = waiterBoard(mergedCalls(), since);
    const top = board[0];
    const work = board.slice().sort((a, b) => b.hours - a.hours)[0];
    const fastest = board.filter((x) => x.resp.length).sort((a, b) => avgArr(a.resp) - avgArr(b.resp))[0];
    const meName = (S.me && S.me.name) || '';
    const mineRow = board.find((x) => x.name === meName);
    const hrs = Array(24).fill(0);
    orders.forEach((o) => { const ms = orderMs(o); if (ms) hrs[new Date(ms).getHours()]++; });
    calls.forEach((c) => { const ms = ts(c.createdAt); if (ms) hrs[new Date(ms).getHours()]++; });
    const peakH = hrs.indexOf(Math.max(...hrs));
    const maxH = Math.max(1, ...hrs.slice(8, 24));
    const hbars = hrs.slice(8, 24).map((n, i) => '<div class="col' + ((i + 8) === peakH ? ' today' : '') + '" title="' + (i + 8) + 'h"><u>' + (n || '') + '</u><i style="height:' + Math.round((n / maxH) * 100) + '%"></i><em>' + (i + 8) + '</em></div>').join('');
    const rank = board.slice(0, 8).map((w, i) => {
      const avg = avgArr(w.resp);
      return '<div class="gp-rank' + (w.name === meName ? ' me' : '') + '"><b>' + (i + 1) + '</b>' + avatar({ name: w.name, color: i ? '#00A8FF' : '#FFD700' }) +
        '<div><strong>' + esc(w.name) + '</strong><small>' + w.n + ' chamados · ' + (avg == null ? '—' : hm(avg)) + ' resp. · ' + human(w.hours) + ' em atendimento</small></div></div>';
    }).join('');
    const pLabel = S.period === 1 ? 'hoje' : (S.period === 30 ? '30 dias' : '7 dias');
    return segPeriod('period', S.period, PERIODS) +
      '<div class="gp-insight">' +
      '<div class="gp-stat ink"><b>' + mt(rev) + '</b><span>Receita · ' + pLabel + '</span>' + spark(weekR.map((x) => x.n), '#FFD700') + '</div>' +
      '<div class="gp-stat cyan"><b>' + orders.length + '</b><span>Pedidos · ' + pLabel + '</span>' + spark(weekC.series.map((x) => x.n), '#0A0A0A') + '</div>' +
      '<div class="gp-stat"><b>' + (ticket ? mt(Math.round(ticket)) : '—') + '</b><span>Ticket médio</span>' + spark(weekR.map((x) => x.n), '#00A8FF') + '</div>' +
      '<div class="gp-stat sand"><b>' + pct(paid.length, orders.length) + '</b><span>Pedidos pagos</span>' + spark(weekR.map((x) => x.n ? 1 : 0), '#0069A8') + '</div></div>' +
      '<div class="gp-bento">' +
      '<div class="gp-glass"><h3 class="gp-h">Receita · 7 dias</h3>' + dayBars(weekR, true) + '</div>' +
      '<div class="gp-glass"><h3 class="gp-h">Como pagam</h3>' + donutHtml(payMix) + '</div>' +
      '<div class="gp-glass span2"><h3 class="gp-h">Horas de maior movimento</h3><p class="gp-muted" style="margin:0 0 .5rem">Pico às <b>' + (peakH >= 0 ? peakH + 'h' : '—') + '</b> — bom momento para reforçar o piso.</p><div class="gp-bars">' + hbars + '</div></div>' +
      '<div class="gp-glass span2"><h3 class="gp-h">Quem trabalha mais</h3>' +
      '<div class="gp-stat-grid" style="margin-bottom:1rem">' +
      '<div class="gp-stat ink"><b>' + esc(top ? top.name : '—') + '</b><span>Mais chamados' + (top ? ' · ' + top.n : '') + '</span></div>' +
      '<div class="gp-stat cyan"><b>' + esc(work ? work.name : '—') + '</b><span>Mais tempo em atendimento</span></div>' +
      '<div class="gp-stat"><b>' + esc(fastest ? fastest.name : '—') + '</b><span>Resposta mais rápida</span></div>' +
      '<div class="gp-stat sand"><b>' + (admin ? String(board.length) : (mineRow ? String(mineRow.n) : '0')) + '</b><span>' + (admin ? 'Garçons com actividade' : 'Os seus atendimentos') + '</span></div></div>' +
      (rank || '<p class="gp-muted">Ainda sem atendimentos atribuídos neste período.</p>') +
      '<div class="gp-quick" style="margin-top:.8rem"><button class="gb sm" type="button" data-act="export" data-kind="stats">Exportar relatório</button>' +
      '<button class="gb sm line" type="button" data-act="export" data-kind="team">Exportar ranking</button></div></div></div>';
  }
  function tabDash() {
    const orders = deskOrders();
    assignPedidoNumbers(orders);
    const t0 = startOfDay(Date.now());
    const todayO = orders.filter((o) => orderMs(o) >= t0);
    const calls = mergedCalls();
    const pend = calls.filter((c) => c.status === 'pending').length;
    const paidToday = todayO.filter(isPaid);
    const due = orders.filter((o) => !isPaid(o) && o.status !== 'delivered').length;
    const staff = ((S.team && S.team.staff) || []).filter((m) => m.active);
    const waiters = staff.filter((m) => m.role !== 'admin');
    const hot = new Set();
    orders.forEach((o) => { const ms = orderMs(o); if (ms) hot.add(dayKey(ms)); });
    calls.forEach((c) => { const ms = ts(c.createdAt); if (ms) hot.add(dayKey(ms)); });
    const feed = orders.slice().sort((a, b) => orderMs(b) - orderMs(a)).slice(0, 6);
    const callFeed = calls.filter((c) => c.status === 'pending' || c.status === 'accepted').slice(0, 4);
    const faces = waiters.slice(0, 10).map((m) =>
      '<button class="gp-face" type="button" data-act="memberview" data-id="' + esc(m.id) + '" title="' + esc(m.name) + '" style="background:' + esc(m.color || '#00A8FF') + '">' + esc((m.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('')) + '</button>'
    ).join('');
    const admin = S.me && S.me.role === 'admin';
    return '<section class="gp-hero-ban"><span class="gp-chip">Aqua Club · ' + (admin ? 'administração' : 'garçom') + '</span><h2>' + (admin ? 'A casa trabalha melhor junta.' : 'O seu turno, com números claros.') + '</h2><p>Pedidos, chamados, pagamentos e a equipa — o pulso do complexo, em tempo real.</p></section>' +
      insightHtml(admin) +
      '<div class="gp-bento">' +
      '<div class="gp-glass"><h3 class="gp-h">Equipa no piso</h3><div class="gp-faces">' + faces +
      (admin ? '<button class="gp-face add" type="button" data-act="tab" data-t="team" title="Gerir equipa">+</button>' : '') + '</div>' +
      '<p class="gp-muted" style="margin:.75rem 0 0">' + (admin ? (waiters.length + ' garçons activos. Toque num perfil para ver gráficos e PIN.') : 'Acompanhe a casa e o seu desempenho neste painel.') + '</p></div>' +
      '<div class="gp-glass">' + miniCal(hot) + '</div>' +
      '<div class="gp-stat-grid span2">' +
      '<div class="gp-stat ink"><b>' + mt(revenueOf(paidToday)) + '</b><span>Receita hoje</span></div>' +
      '<div class="gp-stat cyan"><b>' + todayO.length + '</b><span>Pedidos hoje</span></div>' +
      '<div class="gp-stat"><b>' + pend + '</b><span>Chamados à espera</span></div>' +
      '<div class="gp-stat sand"><b>' + due + '</b><span>Por cobrar</span></div></div>' +
      '<div class="gp-glass"><h3 class="gp-h">Últimos pedidos</h3><div class="gp-feed">' +
      (feed.length ? feed.map((o) => '<div class="gp-feed-row">' + avatar({ name: o.customer_name || 'Cliente', color: '#00A8FF' }) +
        '<div><b>' + esc(pedidoNo(o) ? ('Pedido ' + pedidoNo(o)) : (o.code || 'Pedido')) + '</b><small>' + esc(o.customer_name || 'Cliente') + ' · ' + esc(orderPlace(o) || '') + '</small></div>' +
        '<span class="gp-chip ' + (isPaid(o) ? 'ok' : 'wait') + '">' + mt(o.total) + '</span></div>').join('') : '<p class="gp-muted">Ainda sem pedidos nesta sessão.</p>') +
      '</div><div class="gp-quick" style="margin-top:.8rem"><button class="gb sm" type="button" data-act="tab" data-t="orders">Ver todos os pedidos</button></div></div>' +
      '<div class="gp-glass"><h3 class="gp-h">Sala agora</h3><div class="gp-feed">' +
      (callFeed.length ? callFeed.map((c) => '<div class="gp-feed-row">' + ic(REASON_IC[c.reason] || 'bell') +
        '<div><b>' + esc(tableName(c.tableCode) || c.place || 'Chamado') + '</b><small>' + esc(REASONS[c.reason] || c.reason) + (c.by ? ' · ' + esc(c.by) : '') + '</small></div>' +
        '<span class="gp-chip ' + (c.status === 'pending' ? 'wait' : 'ok') + '">' + (c.status === 'pending' ? 'À espera' : 'A caminho') + '</span></div>').join('') : '<p class="gp-muted">Tudo calmo no piso.</p>') +
      '</div><div class="gp-quick" style="margin-top:.8rem"><button class="gb sm line" type="button" data-act="tab" data-t="calls">Abrir chamados</button></div></div>' +
      '<div class="gp-glass span2"><h3 class="gp-h">Gestão da casa</h3><div class="gp-quick">' +
      '<button class="gb" type="button" data-act="tab" data-t="orders">Pedidos e pagamentos</button>' +
      '<button class="gb line" type="button" data-act="tab" data-t="calls">Chamados</button>' +
      (admin ? '<button class="gb line" type="button" data-act="tab" data-t="team">Equipa e PINs</button>' : '') +
      '<button class="gb dark" type="button" data-act="tab" data-t="stats">Relatórios</button>' +
      '<button class="gb sm line" type="button" data-act="export" data-kind="orders">Exportar pedidos</button>' +
      '<button class="gb sm line" type="button" data-act="export" data-kind="calls">Exportar chamados</button></div></div></div>';
  }
  function tabMember() {
    const staff = (S.team && S.team.staff) || [];
    const m = staff.find((x) => x.id === S.viewMember || x.user_id === S.viewMember);
    if (!m) return '<div class="gp-card gp-empty">' + ic('users') + '<b>Perfil não encontrado</b><button class="gb" type="button" data-act="tab" data-t="team">Voltar à equipa</button></div>';
    const calls = callsForMember(m, mergedCalls());
    const t0 = startOfDay(Date.now());
    const st = computeStats(calls, t0 - 29 * 864e5, 30);
    const today = computeStats(calls, t0, 1);
    const week = computeStats(calls, t0 - 6 * 864e5, 7);
    const since = new Date(ts(m.created_at) || Date.now());
    const zi = Math.max(0, staff.filter((x) => x.role !== 'admin').findIndex((x) => x.id === m.id));
    const zone = ZONES[ZONE_CYCLE[zi % ZONE_CYCLE.length]] || 'Piso';
    const recent = calls.slice().sort((a, b) => ts(b.createdAt) - ts(a.createdAt)).slice(0, 6);
    const initials = (m.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('');
    return '<p><button class="gb line sm" type="button" data-act="tab" data-t="team">' + ic('users') + ' Toda a equipa</button></p>' +
      '<section class="gp-prof-ban"><div class="inner">' +
      '<div class="gp-av lg" style="background:' + esc(m.color || '#00A8FF') + '">' + esc(initials) + '</div>' +
      '<div><span class="gp-online"><i></i>' + (m.active ? 'Disponível no piso' : 'Inactivo') + '</span>' +
      '<h2>' + esc(m.name) + '</h2><p class="gp-muted" style="color:rgba(255,255,255,.8);margin:.2rem 0 0">' + (m.role === 'admin' ? 'Administração' : 'Garçom') + ' · ' + esc(zone) + (m.phone ? ' · ' + esc(m.phone) : '') + '</p></div></div></section>' +
      '<div class="gp-stat-grid">' +
      '<div class="gp-stat ink"><b>' + today.count + '</b><span>Atendimentos hoje</span></div>' +
      '<div class="gp-stat cyan"><b>' + esc(st.resp == null ? '—' : hm(st.resp)) + '</b><span>Resposta média</span></div>' +
      '<div class="gp-stat"><b>' + (st.rating == null ? '—' : st.rating.toFixed(1).replace('.', ',') + ' ★') + '</b><span>Nota (30 dias)</span></div>' +
      '<div class="gp-stat sand"><b>' + st.count + '</b><span>Atendimentos 30 d</span></div></div>' +
      '<div class="gp-bento">' +
      '<div class="gp-glass"><h3 class="gp-h">Sobre</h3><p class="gp-muted" style="margin:0">Membro desde ' + since.getDate() + ' ' + MONN[since.getMonth()] + ' ' + since.getFullYear() + '. Zona habitual: <b>' + esc(zone) + '</b>. PIN de acesso ' + (m.pin ? '<b>' + esc(m.pin) + '</b>' : 'definido na casa') + '.</p>' +
      '<form class="gp-form" data-form="setpin" data-id="' + esc(m.id) + '" style="margin-top:1rem"><label>Novo PIN<input name="pin" inputmode="numeric" maxlength="8" required minlength="4" placeholder="1001"></label><button class="gb sm" type="submit">Actualizar PIN</button><p class="gp-msg" role="status"></p></form></div>' +
      '<div class="gp-glass"><h3 class="gp-h">Semana</h3>' + dayBars(week.series) + '</div>' +
      '<div class="gp-glass span2"><h3 class="gp-h">Actividade recente</h3>' +
      (recent.length ? '<div class="gp-feed">' + recent.map((c) => '<div class="gp-feed-row"><time>' + hhmm(ts(c.createdAt)) + '</time><div><b>' + esc(tableName(c.tableCode) || 'Chamado') + '</b><small>' + esc(REASONS[c.reason] || c.reason) + '</small></div><span class="gp-chip ' + (c.status === 'completed' ? 'ok' : 'wait') + '">' + (c.status === 'completed' ? 'Concluído' : (c.status === 'accepted' ? 'A caminho' : 'Aberto')) + '</span></div>').join('') + '</div>'
        : '<p class="gp-muted">Ainda sem chamados atribuídos a esta pessoa nesta sessão.</p>') + '</div></div>' +
      (m.user_id === S.me.user_id ? '' : '<div class="gp-quick" style="margin-top:.4rem">' +
        (!m.active ? '<button class="gb ok" type="button" data-act="member" data-id="' + esc(m.id) + '" data-do="approve">Aprovar</button>'
          : '<button class="gb line" type="button" data-act="member" data-id="' + esc(m.id) + '" data-do="' + (m.role === 'admin' ? 'demote' : 'promote') + '">' + (m.role === 'admin' ? 'Tornar garçom' : 'Tornar admin') + '</button><button class="gb bad" type="button" data-act="member" data-id="' + esc(m.id) + '" data-do="disable">Desativar</button>') + '</div>');
  }

  /* ====================================================================== TAB: PEDIDOS (sistema em tempo real) */
  const ST_OS = { review: 'Em análise', received: 'Em análise', preparing: 'Em preparação', ready: 'Pronto', on_the_way: 'A caminho', delivered: 'Entregue', cancelled: 'Cancelado', no_confirm: 'Sem confirmação' };
  const PAY_OS = { unpaid: 'Por pagar', declared: 'Transferência a confirmar', paid_declared: 'Transferência a confirmar', paid: 'Pago', rejected: 'Rejeitado', pay_requested: 'Por pagar' };
  function payMethodOf(o) { return o.payment_method || o.method || ''; }
  function payStatusOf(o) {
    const st = o.payment_status || o.pay;
    if (payMethodOf(o) === 'pos' && st !== 'paid') return 'unpaid';
    return st;
  }
  function payLabel(o) {
    const st = payStatusOf(o), m = payMethodOf(o);
    if (st === 'paid') return 'Pago' + (m === 'pos' ? ' · POS no local' : m === 'mpesa' ? ' · M-Pesa' : m === 'emola' ? ' · e-Mola' : '');
    if (m === 'pos') return 'Por pagar · POS no local';
    return PAY_OS[st] || st;
  }
  function extraLabel(x) { return typeof x === 'string' ? x : ((x && (x.name || x.id)) || ''); }
  function lineBits(i) {
    const bits = [];
    if (i.doneness != null && i.doneness !== '') bits.push('Ponto ' + i.doneness + '%');
    const ex = i.extras;
    if (Array.isArray(ex) && ex.length) bits.push(ex.map(extraLabel).filter(Boolean).join(', '));
    else if (typeof ex === 'string' && ex) bits.push(ex);
    if (i.notes || i.note) bits.push(i.notes || i.note);
    return bits.join(' · ');
  }
  function itemsHtml(o) {
    const rows = o.items || o.lines || [];
    if (!rows.length) return '<p class="gc-note">Sem linhas neste pedido.</p>';
    const fee = Number(o.delivery_fee || o.deliveryFee || 0);
    return '<ul class="gc-items">' + rows.map((i) => {
      const qty = i.qty || i.quantity || 1;
      const name = i.name || i.item_id || 'Item';
      const extra = lineBits(i);
      const price = i.line_total != null ? i.line_total : (i.unit_price || i.unitPriceMzn || 0) * qty;
      return '<li><b>' + esc(qty) + '× ' + esc(name) + '</b>' + (extra ? '<small>' + esc(extra) + '</small>' : '') + '<span>' + mt(price) + '</span></li>';
    }).join('') +
      (fee ? '<li><b>Entrega</b><span>' + mt(fee) + '</span></li>' : '') +
      '<li class="tot"><b>Total</b><span>' + mt(o.total) + '</span></li></ul>';
  }
  function orderPlace(o) {
    return o.place_label || o.placeLabel || (o.table_number ? 'Mesa ' + o.table_number : o.fulfillment || o.address || '');
  }
  function isPaid(o) { return payStatusOf(o) === 'paid'; }
  function isGot(o) { return !!(o.received_ok || (o.driver_ok && o.client_ok)); }
  function isDelivery(o) {
    return o.take === 'delivery' || /delivery/i.test(String(orderPlace(o) || ''));
  }
  function phoneKey(o) {
    let d = String(o.customer_phone || (o.customer && o.customer.phone) || o.phone || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length > 9) d = d.slice(-9);
    return d || ('code:' + String(o.id || o.code || ''));
  }
  function pedidoNo(o) { return Number(o.nPedido || o.nConta || 0) || 0; }
  function assignPedidoNumbers(orders) {
    const groups = {};
    (orders || []).filter((o) => o && o.status !== 'cancelled').slice().sort((a, b) => {
      const ta = Date.parse(a.created_at || a.ts || 0) || Number(a.ts) || 0;
      const tb = Date.parse(b.created_at || b.ts || 0) || Number(b.ts) || 0;
      return ta - tb || String(a.code || '').localeCompare(String(b.code || ''));
    }).forEach((o) => {
      const k = phoneKey(o);
      groups[k] = (groups[k] || 0) + 1;
      o.nPedido = groups[k];
      o.nConta = groups[k];
    });
  }
  function kv(k, v) { return v ? '<div class="gc-kv"><span>' + esc(k) + '</span><b>' + v + '</b></div>' : ''; }
  function cardO(o) {
    const mth = payMethodOf(o);
    const pst = payStatusOf(o);
    const payLine = mth === 'emola' ? 'e-Mola 87 452 1897 · Siddique Faizy Rego' : mth === 'mpesa' ? 'M-Pesa 84 596 1528 · Siddique Faizy Rego' : mth === 'pos' ? 'POS no local — o garçom passa o cartão à mesa' : (mth || '');
    const maps = o.navUrl || o.mapsUrl || (o.lat && o.lng ? 'https://www.google.com/maps?q=' + o.lat + ',' + o.lng : '');
    const phone = o.customer_phone || (o.customer && o.customer.phone) || '';
    const admin = S.me && S.me.role === 'admin';
    const xfer = pst === 'declared' || pst === 'paid_declared';
    const posDue = mth === 'pos' && pst !== 'paid' && o.status !== 'cancelled';
    const n = pedidoNo(o);
    const title = n ? ('Pedido ' + n) : (o.code || 'Pedido');
    const whenTxt = o.created_at || o.ts ? hhmm(ts(o.created_at) || Number(o.ts) || Date.now()) : '';
    const kind = o.fulfillment === 'dine_in' ? 'No local' : (isDelivery(o) ? 'Delivery' : (o.take === 'pickup' ? 'Para levar · busca' : (o.fulfillment || '')));
    const got = isGot(o), paid = isPaid(o);
    const done = o.status === 'delivered' && paid;
    const cls = done ? ' done' : (xfer || posDue ? ' u1' : '');
    const acts = [];
    if (!done && o.status !== 'cancelled') {
      if (xfer) acts.push('<button class="gb ok" type="button" data-act="osord" data-id="' + esc(o.id) + '" data-do="paid">Confirmar pagamento</button>');
      if (posDue) acts.push('<button class="gb ok" type="button" data-act="osord" data-id="' + esc(o.id) + '" data-do="pospaid">POS cobrado → Pago</button>');
      if (admin && pst !== 'paid' && !posDue && !xfer) acts.push('<button class="gb line" type="button" data-act="osord" data-id="' + esc(o.id) + '" data-do="markpaid">Confirmar pago</button>');
      if (!['preparing', 'ready', 'on_the_way', 'delivered'].includes(o.status)) acts.push('<button class="gb" type="button" data-act="osord" data-id="' + esc(o.id) + '" data-do="preparing">A preparar</button>');
      if (!['ready', 'on_the_way', 'delivered'].includes(o.status)) acts.push('<button class="gb line" type="button" data-act="osord" data-id="' + esc(o.id) + '" data-do="ready">Pedido pronto</button>');
      if (isDelivery(o) && (o.status === 'ready' || o.status === 'on_the_way') && !o.driver_ok && !got) acts.push('<button class="gb" type="button" data-act="osord" data-id="' + esc(o.id) + '" data-do="driver">Saiu para entrega</button>');
      if (!got) acts.push('<button class="gb ok" type="button" data-act="osord" data-id="' + esc(o.id) + '" data-do="receive">Marcar entregue</button>');
    }
    return '<article class="gc' + cls + '"><div class="gc-top"><span class="gc-table">' + esc(title) + '</span>' +
      '<span class="gc-zone">' + esc(kind || orderPlace(o) || 'Pedido') + '</span></div>' +
      '<div class="gc-chips">' +
      '<span class="gp-chip">' + esc(ST_OS[o.status] || o.status) + '</span>' +
      '<span class="gp-chip ' + (paid ? 'ok' : (xfer ? 'wait' : '')) + '">' + esc(payLabel(o)) + '</span>' +
      (got && !paid ? '<span class="gp-chip wait">Recebido · falta pagamento</span>' : '') +
      (done ? '<span class="gp-chip ok">Entregue e pago</span>' : '') +
      '</div>' +
      '<div class="gc-meta">' +
      kv('Código', esc(o.code || '—') + (whenTxt ? ' · ' + esc(whenTxt) : '')) +
      kv('Cliente', esc(o.customer_name || (o.customer && o.customer.name) || 'Cliente')) +
      kv('Telemóvel', phone ? '<a href="tel:+' + esc(String(phone).replace(/\D/g, '')) + '">' + esc(phone) + '</a>' : '') +
      kv('Local', esc(orderPlace(o))) +
      kv('Morada', esc(o.address || o.bairro || '')) +
      kv('GPS', (o.lat && o.lng) ? (Number(o.lat).toFixed(5) + ', ' + Number(o.lng).toFixed(5) + (maps ? ' · <a href="' + esc(maps) + '" target="_blank" rel="noopener">Maps</a>' : '')) : (maps ? '<a href="' + esc(maps) + '" target="_blank" rel="noopener">Maps</a>' : '')) +
      kv('WhatsApp', o.waGroupOpt ? 'Quer grupo WA' : '') +
      kv('Pagamento', esc(payLine || payLabel(o)) + (o.payment_ref || o.ref ? ' · SMS ' + esc(o.payment_ref || o.ref) : '')) +
      kv('Notas', esc(o.note || '')) +
      '</div>' +
      itemsHtml(o) +
      (acts.length ? '<div class="gc-actions">' + acts.join('') + '</div>' : (done ? '<p class="gp-muted" style="margin:0">Pedido cumprido: pago e recebido.</p>' : '')) +
      '</article>';
  }
  function hourOpts(cur) {
    const list = [['', 'Qualquer hora']];
    for (let h = 8; h <= 23; h++) list.push([String(h), pad(h) + ':00']);
    return selOpts(cur, list);
  }
  function dayOpts(cur) {
    return selOpts(cur, [['', 'Qualquer dia']].concat(DAYN.map((n, i) => [String(i), n])));
  }
  function orderFilterBar(source) {
    const f = S.of || emptyOf();
    const cats = knownCats(source);
    return '<form class="gp-filters" data-form="ofilter"><h3 class="gp-h">Filtrar pedidos</h3><div class="gp-fg">' +
      '<label>Cliente, telemóvel, código<input name="q" value="' + esc(f.q) + '" placeholder="Nome ou mesa"></label>' +
      '<label>De<input name="from" type="date" value="' + esc(f.from) + '"></label>' +
      '<label>Até<input name="to" type="date" value="' + esc(f.to) + '"></label>' +
      '<label>Hora<select name="hour">' + hourOpts(f.hour) + '</select></label>' +
      '<label>Dia da semana<select name="wday">' + dayOpts(f.wday) + '</select></label>' +
      '<label>Categoria<select name="cat">' + selOpts(f.cat, [['', 'Todas']].concat(cats.map((c) => [c, c]))) + '</select></label>' +
      '<label>Pagamento<select name="pay">' + selOpts(f.pay, [['', 'Todos'], ['mpesa', 'M-Pesa'], ['emola', 'e-Mola'], ['pos', 'POS']]) + '</select></label>' +
      '<label>Tipo<select name="kind">' + selOpts(f.kind, [['', 'Todos'], ['dine', 'No local'], ['pickup', 'Para levar'], ['delivery', 'Delivery']]) + '</select></label>' +
      '<label>Estado<select name="st">' + selOpts(f.st, [['', 'Activos'], ['review', 'Em análise'], ['preparing', 'A preparar'], ['ready', 'Pronto'], ['on_the_way', 'A caminho'], ['delivered', 'Entregue'], ['paid', 'Pagos'], ['unpaid', 'Por pagar'], ['cancelled', 'Cancelados']]) + '</select></label>' +
      '<label>Local<input name="place" value="' + esc(f.place) + '" placeholder="Mesa, zona…"></label></div>' +
      '<div class="gp-quick"><button class="gb sm" type="submit">Aplicar</button><button class="gb sm line" type="button" data-act="freset" data-k="of">Limpar</button>' +
      '<button class="gb sm dark" type="button" data-act="export" data-kind="orders">Exportar CSV</button></div></form>';
  }
  function callFilterBar(all) {
    const f = S.cf || emptyCf();
    const waiters = Array.from(new Set((all || []).map((c) => c.by || c.waiterName).filter(Boolean))).sort();
    const zones = ['all'].concat(Array.from(new Set(siteTables().map((x) => x.zone).concat((all || []).map((c) => c.zone)).filter(Boolean))));
    return '<form class="gp-filters" data-form="cfilter"><h3 class="gp-h">Filtrar chamados</h3><div class="gp-fg">' +
      '<label>Mesa, nota, garçom<input name="q" value="' + esc(f.q) + '" placeholder="Pesquisar"></label>' +
      '<label>De<input name="from" type="date" value="' + esc(f.from) + '"></label>' +
      '<label>Até<input name="to" type="date" value="' + esc(f.to) + '"></label>' +
      '<label>Hora<select name="hour">' + hourOpts(f.hour) + '</select></label>' +
      '<label>Dia da semana<select name="wday">' + dayOpts(f.wday) + '</select></label>' +
      '<label>Motivo<select name="reason">' + selOpts(f.reason, [['', 'Todos']].concat(Object.keys(REASONS).filter((k, i, a) => a.indexOf(k) === i && ['request_bill', 'menu_question', 'new_order', 'urgent_other', 'conta', 'duvida', 'pedido', 'urgente'].includes(k)).map((k) => [k, REASONS[k]]))) + '</select></label>' +
      '<label>Zona<select name="zone">' + selOpts(f.zone || 'all', zones.map((z) => [z, z === 'all' ? 'Todas' : (ZONES[z] || z)])) + '</select></label>' +
      '<label>Estado<select name="st">' + selOpts(f.st, [['', 'Todos'], ['pending', 'Por atender'], ['accepted', 'A caminho'], ['completed', 'Concluídos']]) + '</select></label>' +
      '<label>Garçom<select name="waiter">' + selOpts(f.waiter, [['', 'Todos']].concat(waiters.map((w) => [w, w]))) + '</select></label></div>' +
      '<div class="gp-quick"><button class="gb sm" type="submit">Aplicar</button><button class="gb sm line" type="button" data-act="freset" data-k="cf">Limpar</button>' +
      '<button class="gb sm dark" type="button" data-act="export" data-kind="calls">Exportar CSV</button></div></form>';
  }
  function tabOrders() {
    const source = (S.osDesk && S.osDesk.orders) || [];
    assignPedidoNumbers(source);
    const orders = filterOrders(source);
    const seen = new Set();
    const take = (pred) => orders.filter((o) => { if (seen.has(o.id) || o.status === 'cancelled') return false; if (!pred(o)) return false; seen.add(o.id); return true; });
    const wait = take((o) => { const s = payStatusOf(o); return s === 'declared' || s === 'paid_declared'; });
    const posDue = take((o) => payMethodOf(o) === 'pos' && !isPaid(o));
    const waitPay = take((o) => isGot(o) && !isPaid(o) && o.status !== 'delivered');
    const review = take((o) => o.status === 'review' || o.status === 'received' || o.status === 'no_confirm');
    const prep = take((o) => o.status === 'preparing');
    const ready = take((o) => o.status === 'ready' || o.status === 'on_the_way');
    const done = take((o) => o.status === 'delivered' && isPaid(o));
    const liveN = orders.filter((o) => o.status !== 'cancelled' && !(o.status === 'delivered' && isPaid(o))).length;
    const paidN = orders.filter((o) => o.status !== 'cancelled' && isPaid(o)).length;
    const doneN = orders.filter((o) => o.status === 'delivered' && isPaid(o)).length;
    const t0 = startOfDay(Date.now());
    const cmap = new Map();
    [].concat(S.calls || [], S.liveCalls || [], (S.osDesk && S.osDesk.calls) || []).forEach((c) => {
      if (!c) return;
      const id = String(c.id || '');
      const st = c.status === 'closed' ? 'completed' : c.status;
      cmap.set(id, Object.assign({}, c, { status: st, createdAt: c.createdAt || c.created_at, completedAt: c.completedAt || c.closed_at }));
    });
    const attended = Array.from(cmap.values()).filter((c) => (c.status === 'completed' || c.status === 'accepted') && (ts(c.completedAt) >= t0 || ts(c.createdAt) >= t0 || ts(c.acceptedAt || c.accepted_at) >= t0)).length;
    const block = (title, list, empty) => '<div class="gp-sec"><span>' + title + '</span><span class="n">' + list.length + '</span></div>' +
      (list.length ? '<div class="gp-list">' + list.map(cardO).join('') + '</div>' : (empty || ''));
    return orderFilterBar(source) + '<div class="gp-kpis"><div class="gp-kpi"><b>' + attended + '</b><span>Chamados atendidos</span></div>' +
      '<div class="gp-kpi"><b>' + doneN + '</b><span>Pedidos concluídos</span></div>' +
      '<div class="gp-kpi"><b>' + paidN + '</b><span>Pagos</span></div>' +
      '<div class="gp-kpi hot"><b>' + done.length + '</b><span>Entregues</span></div>' +
      '<div class="gp-kpi hot"><b>' + wait.length + '</b><span>Pagamentos a confirmar</span></div>' +
      '<div class="gp-kpi"><b>' + liveN + '</b><span>Pedidos ativos</span></div></div>' +
      (wait.length ? block('M-Pesa / e-Mola a confirmar', wait) : '') +
      (posDue.length ? block('POS no local — por pagar', posDue) : '') +
      (waitPay.length ? block('Recebidos · falta confirmar pagamento', waitPay) : '') +
      block('Em análise', review, '<div class="gp-card gp-empty">' + ic('list') + '<b>Nada em análise</b>Quando o cliente envia o pedido, aparece aqui com extras, ponto e notas.</div>') +
      (prep.length ? block('Em preparação', prep) : '') +
      (ready.length ? block('Prontos / a caminho', ready) : '') +
      (done.length ? block('Entregues (pago e recebido)', done) : '');
  }

  /* ====================================================================== TAB: CHAMADOS */
  const urgOf = (ms) => (ms >= 300000 ? 'u2' : ms >= 120000 ? 'u1' : '');
  function cardPending(c) {
    const ms = Date.now() - ts(c.createdAt);
    return '<article class="gc ' + urgOf(ms) + '" data-urg="1" data-id="' + esc(c.id) + '"><div class="gc-top"><span class="gc-table">' + esc(tableName(c.tableCode)) + '</span><span class="gc-zone">' + esc(ZONES[c.zone] || c.zone) + '</span></div>' +
      '<div class="gc-reason">' + ic(REASON_IC[c.reason] || 'bell') + esc(REASONS[c.reason] || c.reason) + (c.released ? ' <span class="gp-chip wait">devolvido</span>' : '') + '</div>' +
      (c.note ? '<p class="gc-note">“' + esc(c.note) + '”</p>' : '') +
      '<div class="gc-foot"><span class="gc-timer" data-since="' + esc(c.createdAt) + '" title="Tempo à espera">' + ic('clock') + '<span>' + mmss(ms) + '</span></span>' +
      '<div class="gc-actions"><button class="gb" type="button" data-act="accept" data-id="' + esc(c.id) + '">' + ic('check') + 'Aceitar</button></div></div></article>';
  }
  function cardActive(c, mine, admin) {
    return '<article class="gc mine" data-id="' + esc(c.id) + '"><div class="gc-top"><span class="gc-table">' + esc(tableName(c.tableCode)) + '</span><span class="gc-zone">' + esc(ZONES[c.zone] || c.zone) + '</span></div>' +
      '<div class="gc-reason">' + ic(REASON_IC[c.reason] || 'bell') + esc(REASONS[c.reason] || c.reason) + '</div>' + (c.note ? '<p class="gc-note">“' + esc(c.note) + '”</p>' : '') +
      '<div class="gc-foot"><div><span class="gc-state">' + (mine ? 'A caminho · em atendimento' : esc(c.by || 'Colega') + ' a atender') + '</span><br>' +
      '<span class="gc-timer" data-since="' + esc(c.acceptedAt || c.createdAt) + '" title="Tempo desde que foi aceite">' + ic('clock') + '<span>' + mmss(Date.now() - ts(c.acceptedAt || c.createdAt)) + '</span></span></div>' +
      ((mine || admin) ? '<div class="gc-actions"><button class="gb ok" type="button" data-act="complete" data-id="' + esc(c.id) + '">' + ic('check') + 'Concluir</button><button class="gb line" type="button" data-act="release" data-id="' + esc(c.id) + '">' + ic('undo') + 'Devolver</button></div>' : '') + '</div></article>';
  }
  function tabCalls() {
    const me = S.me, t0 = startOfDay(Date.now()), raw = mergedCalls(), admin = me.role === 'admin';
    const all = filterCalls(raw);
    const isMine = (c) => c.byUser === me.user_id || !!c.live || c.by === me.name;
    const zf = () => true;
    const pendAll = all.filter((c) => c.status === 'pending'), pend = pendAll.filter(zf).sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
    const mine = all.filter((c) => c.status === 'accepted' && isMine(c)).sort((a, b) => ts(a.acceptedAt) - ts(b.acceptedAt));
    const others = all.filter((c) => c.status === 'accepted' && !isMine(c) && zf(c));
    const doneT = all.filter((c) => c.status === 'completed' && isMine(c) && ts(c.completedAt) >= t0).sort((a, b) => ts(b.completedAt) - ts(a.completedAt));
    const st = computeStats(all.filter(isMine), t0, 1);
    return callFilterBar(raw) + '<div class="gp-kpis"><div class="gp-kpi hot"><b>' + pendAll.length + '</b><span>Por atender</span></div><div class="gp-kpi"><b>' + mine.length + '</b><span>Comigo agora</span></div>' +
      '<div class="gp-kpi"><b>' + st.count + '</b><span>Concluídos hoje</span></div><div class="gp-kpi"><b>' + esc(st.resp == null ? '—' : hm(st.resp)) + '</b><span>Resposta média hoje</span></div></div>' +
      '<div class="gp-sec"><span>Por atender</span><span class="n">' + pend.length + '</span></div>' +
      (pend.length ? '<div class="gp-list">' + pend.map(cardPending).join('') + '</div>'
        : '<div class="gp-card gp-empty">' + ic('spark') + '<b>Tudo calmo</b>Nenhum chamado à espera' + (S.zone !== 'all' ? ' nesta zona' : '') + '. Avisamos assim que alguém chamar.</div>') +
      (mine.length ? '<div class="gp-sec"><span>Em curso comigo</span><span class="n">' + mine.length + '</span></div><div class="gp-list">' + mine.map((c) => cardActive(c, true, admin)).join('') + '</div>' : '') +
      (others.length ? '<div class="gp-sec"><span>Em curso (colegas)</span><span class="n">' + others.length + '</span></div><div class="gp-list">' + others.map((c) => cardActive(c, false, admin)).join('') + '</div>' : '') +
      (doneT.length ? '<div class="gp-sec"><span>Concluídos por mim hoje</span><span class="n">' + doneT.length + '</span></div><div class="gp-list">' + doneT.slice(0, 6).map((c) =>
        '<article class="gc done"><div class="gc-top"><span class="gc-table">' + esc(tableName(c.tableCode)) + '</span><span class="gp-chip ok">' + hhmm(ts(c.completedAt)) + '</span></div><small class="gp-muted">' + esc(REASONS[c.reason] || c.reason) +
        ' · resposta ' + human(ts(c.acceptedAt) - ts(c.createdAt)) + ' ' + stars(c.rating) + '</small></article>').join('') + '</div>' : '') +
      '<p class="gp-muted" style="margin:.8rem 1rem 0">Os chamados do site aparecem aqui em tempo real. Toque em Aceitar para o cliente ver que o garçom está a caminho.</p>';
  }

  /* ====================================================================== TAB: HISTÓRICO */
  const segPeriod = (act, cur, opts) => '<div class="gp-seg" role="group" aria-label="Período">' + opts.map((o) => '<button type="button" data-act="' + act + '" data-v="' + o[0] + '" aria-selected="' + (cur === o[0]) + '">' + o[1] + '</button>').join('') + '</div>';
  function tabHist() {
    const since = startOfDay(Date.now()) - (S.hper - 1) * 864e5, rows = (S.mine || []).filter((c) => ts(c.createdAt) >= since && c.status !== 'cancelled').sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
    let h = segPeriod('hper', S.hper, PERIODS);
    if (!rows.length) return h + '<div class="gp-card gp-empty">' + ic('list') + '<b>Sem atendimentos</b>Os chamados que aceitar aparecem aqui.</div>';
    let last = '';
    h += '<div class="gp-list">';
    rows.forEach((c) => {
      const k = dayKey(ts(c.createdAt)); if (k !== last) { h += '<div class="gp-day">' + esc(dayLabel(ts(c.createdAt))) + '</div>'; last = k; }
      h += '<div class="gp-item"><time>' + hhmm(ts(c.createdAt)) + '</time><div><b>' + esc(tableName(c.tableCode)) + '</b><small>' + esc(REASONS[c.reason] || c.reason) + ' · resposta ' + human(ts(c.acceptedAt) - ts(c.createdAt)) +
        (c.completedAt ? ' · atendimento ' + human(ts(c.completedAt) - ts(c.acceptedAt)) : '') + '</small>' + (c.comment ? '<small>“' + esc(c.comment) + '”</small>' : '') + '</div>' +
        '<div style="text-align:right"><span class="gp-chip ' + (c.status === 'completed' ? 'ok' : 'wait') + '">' + (c.status === 'completed' ? 'Concluído' : 'Em curso') + '</span><br>' + stars(c.rating) + '</div></div>';
    });
    return h + '</div>';
  }

  /* ====================================================================== TAB: ESTATÍSTICAS */
  function tabStats() {
    const t0 = startOfDay(Date.now()), p = S.period, mine = S.mine || [];
    const s = computeStats(mine, t0 - (p - 1) * 864e5, p), today = computeStats(mine, t0, 1), m30 = computeStats(mine, t0 - 29 * 864e5, 30);
    const C = 2 * Math.PI * 48, dash = C * Math.min(1, today.count / GOAL);
    const maxD = Math.max(1, ...s.series.map((x) => x.n)), long = s.series.length > 14;
    const bars = s.series.map((x, i) => '<div class="col' + (x.today ? ' today' : '') + '" title="' + x.key + ': ' + x.n + '"><u>' + (x.n || '') + '</u><i style="height:' + Math.round((x.n / maxD) * 100) + '%"></i><em>' + (long ? (i % 5 === 0 || x.today ? x.key.slice(8) : '') : x.label) + '</em></div>').join('');
    const hrs = s.byHour.slice(8), maxH = Math.max(1, ...hrs);
    const hbars = hrs.map((n, i) => '<div class="col" title="' + (i + 8) + 'h: ' + n + '"><u>' + (n || '') + '</u><i style="height:' + Math.round((n / maxH) * 100) + '%"></i><em>' + ((i + 8) % 2 === 0 ? (i + 8) : '') + '</em></div>').join('');
    const maxR = Math.max(1, ...Object.values(s.byReason), 1);
    const rbars = Object.keys(REASONS).map((k) => '<div class="r"><span>' + esc(REASONS[k]) + '</span><span class="t"><i style="width:' + Math.round(((s.byReason[k] || 0) / maxR) * 100) + '%"></i></span><span class="v">' + (s.byReason[k] || 0) + '</span></div>').join('');
    const maxZ = Math.max(1, ...Object.values(s.byZone), 1);
    const zbars = Object.keys(ZONES).map((k) => '<div class="r"><span>' + esc(ZONES[k]) + '</span><span class="t"><i style="width:' + Math.round(((s.byZone[k] || 0) / maxZ) * 100) + '%"></i></span><span class="v">' + (s.byZone[k] || 0) + '</span></div>').join('');
    const comments = mine.filter((c) => c.comment).slice(0, 4);
    const admin = S.me && S.me.role === 'admin';
    return insightHtml(admin) +
      '<div class="gp-glass"><h3 class="gp-h">O seu desempenho neste período</h3></div>' +
      '<div class="gp-card gp-goal"><div class="gp-ring" role="img" aria-label="' + today.count + ' de ' + GOAL + ' atendimentos hoje"><svg viewBox="0 0 112 112"><circle class="bg" cx="56" cy="56" r="48"/><circle class="fg" cx="56" cy="56" r="48" stroke-dasharray="' + dash.toFixed(1) + ' ' + C.toFixed(1) + '"/></svg><b>' + today.count + '</b></div>' +
      '<div><h3 style="margin-bottom:.3rem">Meta de hoje</h3><p class="gp-muted" style="margin:0">' + today.count + ' de ' + GOAL + ' atendimentos.<br>' + (today.count >= GOAL ? '<b>Meta cumprida — excelente trabalho!</b>' : 'Faltam ' + (GOAL - today.count) + ' para a meta.') + '</p></div></div>' +
      '<div class="gp-kpis"><div class="gp-kpi hot"><b>' + s.count + '</b><span>Atendimentos</span></div><div class="gp-kpi"><b>' + esc(s.resp == null ? '—' : hm(s.resp)) + '</b><span>Resposta média</span></div>' +
      '<div class="gp-kpi"><b>' + esc(s.svc == null ? '—' : hm(s.svc)) + '</b><span>Tempo de atendimento</span></div><div class="gp-kpi"><b>' + (s.rating == null ? '—' : s.rating.toFixed(1).replace('.', ',') + ' ★') + '</b><span>Nota média' + (s.nRated ? ' (' + s.nRated + ')' : '') + '</span></div></div>' +
      '<div class="gp-card"><h3>Atendimentos por dia</h3><div class="gp-bars">' + bars + '</div></div>' +
      '<div class="gp-card"><h3>Horas de maior movimento</h3><div class="gp-bars">' + hbars + '</div></div>' +
      '<div class="gp-card"><h3>Motivos mais atendidos</h3><div class="gp-hbar">' + rbars + '</div></div>' +
      '<div class="gp-card"><h3>Por zona</h3><div class="gp-hbar">' + zbars + '</div></div>' +
      '<div class="gp-card"><h3>Conquistas (30 dias)</h3><div class="gp-badges">' + BADGES.map((b) => '<div class="gp-bdg' + (b.ok(m30) ? '' : ' off') + '">' + ic(b.icon) + '<div><b>' + esc(b.name) + '</b><small>' + esc(b.desc) + '</small></div></div>').join('') + '</div></div>' +
      (comments.length ? '<div class="gp-card"><h3>O que dizem os clientes</h3><div class="gp-list">' + comments.map((c) => '<div class="gp-item" style="grid-template-columns:1fr auto"><div><b style="text-transform:none">“' + esc(c.comment) + '”</b><small>' + esc(tableName(c.tableCode)) + ' · ' + esc(dayLabel(ts(c.createdAt))) + '</small></div>' + stars(c.rating) + '</div>').join('') + '</div></div>' : '');
  }

  /* ====================================================================== TAB: PERFIL */
  function tabProfile() {
    const me = S.me, t0 = startOfDay(Date.now()), m30 = computeStats(S.mine || [], t0 - 29 * 864e5, 30), today = computeStats(S.mine || [], t0, 1), week = computeStats(S.mine || [], t0 - 6 * 864e5, 7), since = new Date(ts(me.created_at));
    const canN = 'Notification' in window, perm = canN ? Notification.permission : 'denied';
    const initials = (me.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('');
    return '<section class="gp-prof-ban"><div class="inner"><div class="gp-av lg" style="background:' + esc(me.color || '#00A8FF') + '">' + esc(initials) + '</div><div><span class="gp-online"><i></i>Em serviço</span><h2>' + esc(me.name) + '</h2><p style="margin:.2rem 0 0;color:rgba(255,255,255,.8)">' + (me.role === 'admin' ? 'Administração' : 'Garçom') + (me.phone ? ' · ' + esc(me.phone) : '') + '</p></div></div></section>' +
      '<div class="gp-stat-grid"><div class="gp-stat ink"><b>' + today.count + '</b><span>Hoje</span></div><div class="gp-stat cyan"><b>' + esc(m30.resp == null ? '—' : hm(m30.resp)) + '</b><span>Resposta média</span></div><div class="gp-stat"><b>' + (m30.rating == null ? '—' : m30.rating.toFixed(1).replace('.', ',') + ' ★') + '</b><span>Nota 30 d</span></div><div class="gp-stat sand"><b>' + m30.count + '</b><span>Atendimentos 30 d</span></div></div>' +
      '<div class="gp-glass"><h3 class="gp-h">A sua semana</h3>' + dayBars(week.series) + '</div>' +
      '<p class="gp-muted">Membro desde ' + since.getDate() + ' ' + MONN[since.getMonth()] + ' ' + since.getFullYear() + (me.email ? ' · ' + esc(me.email) : '') + '</p>' +
      '<div class="gp-card"><h3>Os meus dados</h3><form class="gp-form" data-form="profile" novalidate><div class="gp-row2"><label>Nome<input name="name" value="' + esc(me.name) + '" maxlength="60" required></label><label>Telemóvel<input name="phone" type="tel" value="' + esc(me.phone || '') + '" maxlength="20"></label></div>' +
      '<button class="gb" type="submit" style="justify-self:start">Guardar alterações</button><p class="gp-msg" role="status"></p></form></div>' +
      '<div class="gp-card"><h3>Ecrã</h3><div class="gp-form"><button class="gb line" type="button" data-act="theme">' + ic('moon') + 'Alternar tema claro / escuro</button></div></div>' +
      '<div class="gp-card"><h3>Alertas</h3><div class="gp-form"><label style="display:flex;align-items:center;gap:.7rem;font-weight:700"><input type="checkbox" data-act="sound" ' + (S.soundOn ? 'checked' : '') + ' style="width:22px;min-height:22px"> Som quando chega um chamado</label>' +
      (canN ? '<button class="gb line" type="button" data-act="notif" ' + (perm === 'granted' ? 'disabled' : '') + '>' + ic('bell') + (perm === 'granted' ? 'Notificações ativas' : 'Ativar notificações do navegador') + '</button>' : '') +
      '<p class="gp-muted" style="margin:0">Mantenha esta página aberta (pode estar em segundo plano) para ser avisado de novos chamados.</p></div></div>' +
      '<div class="gp-card"><h3>PIN / palavra-passe</h3><form class="gp-form" data-form="pass" novalidate><label>Novo PIN (mín. 4) ou palavra-passe<input name="password" type="password" autocomplete="new-password" required minlength="4"></label><button class="gb line" type="submit" style="justify-self:start">Alterar</button><p class="gp-msg" role="status"></p></form></div>' +
      '<button class="gb dark block" type="button" data-act="logout">' + ic('logout') + 'Terminar sessão</button>';
  }

  /* ====================================================================== TAB: EQUIPA (admin) */
  function tabTeam() {
    if (!S.team) return loadingHTML;
    const t0 = startOfDay(Date.now()), since = t0 - 29 * 864e5, { staff, calls } = S.team, me = S.me;
    const pending = staff.filter((m) => !m.active && m.role === 'waiter'), active = staff.filter((m) => m.active);
    const all = computeStats(calls.filter((c) => c.byUser), since, 30);
    const memberCard = (m) => {
      const st = computeStats(callsForMember(m, calls), since, 30), self = m.user_id === me.user_id;
      return '<div class="gp-card gp-member" role="button" tabindex="0" data-act="memberview" data-id="' + esc(m.id) + '">' + avatar(m) + '<div><b style="font:800 1.05rem var(--fh,system-ui);text-transform:uppercase">' + esc(m.name) + '</b><span class="gp-role">' + (m.role === 'admin' ? 'Admin' : 'Garçom') + '</span> ' +
        (m.active ? '' : '<span class="gp-chip off">Inativo</span>') + '<br><small class="gp-muted">' + esc(m.email || '') + (m.phone ? ' · ' + esc(m.phone) : '') + '</small>' +
        '<div class="mini"><span><b>' + st.count + '</b> atend.</span><span>resposta <b>' + esc(st.resp == null ? '—' : hm(st.resp)) + '</b></span><span>nota <b>' + (st.rating == null ? '—' : st.rating.toFixed(1).replace('.', ',') + ' ★') + '</b></span></div></div>' +
        '<div class="acts">' + (!m.active ? '<button class="gb ok sm" type="button" data-act="member" data-id="' + esc(m.id) + '" data-do="approve">' + ic('check') + 'Aprovar</button>'
          : self ? '<span class="gp-muted">É a sua conta</span>'
          : '<button class="gb line sm" type="button" data-act="member" data-id="' + esc(m.id) + '" data-do="' + (m.role === 'admin' ? 'demote' : 'promote') + '">' + (m.role === 'admin' ? 'Tornar garçom' : 'Tornar admin') + '</button><button class="gb bad sm" type="button" data-act="member" data-id="' + esc(m.id) + '" data-do="disable">Desativar</button>') + '</div></div>';
    };
    return '<div class="gp-kpis"><div class="gp-kpi hot"><b>' + pending.length + '</b><span>A aguardar aprovação</span></div><div class="gp-kpi"><b>' + active.length + '</b><span>Na equipa</span></div><div class="gp-kpi"><b>' + all.count + '</b><span>Atendimentos (30 d)</span></div>' +
      '<div class="gp-kpi"><b>' + (all.rating == null ? '—' : all.rating.toFixed(1).replace('.', ',') + ' ★') + '</b><span>Nota média da equipa</span></div></div>' +
      '<div class="gp-glass"><h3 class="gp-h">Novo garçom</h3><form class="gp-form" data-form="invite" novalidate><div class="gp-row2"><label>Nome<input name="name" required maxlength="60" placeholder="Nome no piso"></label><label>PIN<input name="pin" inputmode="numeric" required minlength="4" maxlength="8" placeholder="ex. 1011"></label></div><label>Telemóvel (opcional)<input name="phone" type="tel" maxlength="20"></label><button class="gb" type="submit" style="justify-self:start">Criar perfil</button><p class="gp-msg" role="status"></p></form></div>' +
      '<div class="gp-sec"><span>Pedidos de acesso</span><span class="n">' + pending.length + '</span></div>' +
      (pending.length ? '<div class="gp-list">' + pending.map(memberCard).join('') + '</div>' : '<div class="gp-card gp-empty">' + ic('shield') + '<b>Sem pedidos pendentes</b>Quem criar conta na Área do garçom aparece aqui para aprovação.</div>') +
      '<div class="gp-sec"><span>Equipa ativa</span><span class="n">' + active.length + '</span></div><div class="gp-list">' + active.map(memberCard).join('') + '</div>' +
      tabTables();
  }
  function tabTables() {
    const orders = ((S.osDesk && S.osDesk.orders) || []).filter((o) => o.status !== 'cancelled' && o.payment_status !== 'paid');
    const g = {};
    orders.forEach((o) => {
      const k = orderPlace(o) || 'Sem mesa';
      (g[k] = g[k] || []).push(o);
    });
    const keys = Object.keys(g);
    if (!keys.length) return '<div class="gp-sec"><span>Pedidos em aberto por mesa</span><span class="n">0</span></div><div class="gp-card gp-empty">' + ic('card') + '<b>Nenhum pedido em aberto</b></div>';
    return '<div class="gp-sec"><span>Pedidos em aberto por mesa</span><span class="n">' + keys.length + '</span></div><div class="gp-list">' + keys.map((k) => {
      const list = g[k], tot = list.reduce((s, o) => s + Number(o.total || 0), 0);
      return '<article class="gc"><div class="gc-top"><span class="gc-table">' + esc(k) + '</span><span class="gc-zone">' + mt(tot) + '</span></div>' +
        list.map((o) => '<p class="gc-note"><b>' + esc(pedidoNo(o) ? ('Pedido ' + pedidoNo(o)) : o.code) + '</b> · ' + esc(o.customer_name || '') + ' · ' + mt(o.total) + ' · ' + esc(ST_OS[o.status] || o.status) + '</p>').join('') +
        '<div class="gc-actions"><button class="gb ok sm" type="button" data-act="closetable" data-k="' + esc(k) + '">Marcar pagos nesta mesa</button></div></article>';
    }).join('') + '</div>';
  }

  /* ====================================================================== EVENTOS */
  function applyNamedFilter(form) {
    const v = Object.fromEntries(new FormData(form).entries());
    if (form.dataset.form === 'ofilter') S.of = Object.assign(emptyOf(), v);
    if (form.dataset.form === 'cfilter') { S.cf = Object.assign(emptyCf(), v); S.zone = S.cf.zone || 'all'; }
  }
  function onFilterChange(e) {
    const f = e.target.closest('form[data-form="ofilter"],form[data-form="cfilter"]');
    if (!f) return;
    if (e.target.matches('select, input[type="date"]')) { applyNamedFilter(f); renderTab(); }
  }
  function doExport(kind) {
    const stamp = dayKey(Date.now());
    if (kind === 'orders') {
      const src = (S.osDesk && S.osDesk.orders) || [];
      assignPedidoNumbers(src);
      const rows = filterOrders(src);
      downloadCsv('aqua-pedidos-' + stamp + '.csv', [['Pedido', 'Codigo', 'Quando', 'Cliente', 'Telefone', 'Local', 'Tipo', 'Categoria', 'Estado', 'Pagamento', 'Metodo', 'Total MT']].concat(rows.map((o) => {
        const ms = orderMs(o), d = ms ? new Date(ms) : null;
        return [pedidoNo(o) || '', o.code || '', d ? d.toLocaleString('pt-PT') : '', o.customer_name || '', o.customer_phone || o.phone || '', orderPlace(o) || '', o.fulfillment || o.take || '', orderCats(o).join(' | '), ST_OS[o.status] || o.status, payLabel(o), payMethodOf(o), Number(o.total || 0)];
      })));
      return;
    }
    if (kind === 'calls') {
      const rows = filterCalls(mergedCalls());
      downloadCsv('aqua-chamados-' + stamp + '.csv', [['Quando', 'Mesa', 'Zona', 'Motivo', 'Estado', 'Garcom', 'Resposta', 'Atendimento', 'Nota']].concat(rows.map((c) => {
        const cr = ts(c.createdAt);
        return [cr ? new Date(cr).toLocaleString('pt-PT') : '', tableName(c.tableCode) || c.place || '', ZONES[c.zone] || c.zone || '', REASONS[c.reason] || c.reason, c.status, c.by || '', (c.acceptedAt && c.createdAt) ? human(ts(c.acceptedAt) - ts(c.createdAt)) : '', (c.completedAt && c.acceptedAt) ? human(ts(c.completedAt) - ts(c.acceptedAt)) : '', c.note || ''];
      })));
      return;
    }
    const since = insightPeriodMs(), board = waiterBoard(mergedCalls(), since), orders = deskOrders().filter((o) => orderMs(o) >= since), paid = orders.filter(isPaid);
    if (kind === 'team') {
      downloadCsv('aqua-ranking-' + stamp + '.csv', [['Garcom', 'Chamados', 'Resposta media', 'Tempo em atendimento']].concat(board.map((w) => [w.name, w.n, avgArr(w.resp) == null ? '' : hm(avgArr(w.resp)), human(w.hours)])));
      return;
    }
    downloadCsv('aqua-relatorio-' + stamp + '.csv', [
      ['Indicador', 'Valor'], ['Periodo (dias)', S.period], ['Pedidos', orders.length], ['Pagos', paid.length],
      ['Receita MT', revenueOf(paid)], ['Ticket medio MT', paid.length ? Math.round(revenueOf(paid) / paid.length) : 0],
      ['Chamados', mergedCalls().filter((c) => ts(c.createdAt) >= since).length], ['Top garcom', (board[0] && board[0].name) || '']
    ].concat(board.map((w) => ['Ranking · ' + w.name, w.n + ' chamados'])));
  }
  const say = (form, text, type) => { const p = $('.gp-msg', form); if (p) { p.textContent = text || ''; p.className = 'gp-msg ' + (type || ''); } };
  const busy = (form, on) => { const b = $('button[type=submit]', form); if (b) b.disabled = !!on; };
  async function guard(fn) {
    try { return await fn(); }
    catch (e) {
      if (!(e && (e.silent || e.code === 'offline'))) toast(esc(e.message || e), 'alert', 'err');
      return undefined;
    }
  }
  async function patchDeskOrder(id, body) {
    let r = null;
    if (hasOsApi()) {
      try { r = await osFetch('/desk/orders/' + id, { method: 'PATCH', body }); } catch (e) { r = null; }
    }
    if (window.AquaBus) {
      const row = AquaBus.patchOrder(id, body);
      if (!r) r = row;
    }
    return r;
  }
  async function onClick(e) {
    unlockAudio();
    const b = e.target.closest('[data-act]'); if (!b || !root.contains(b)) return; const a = b.dataset.act, be = backend();
    if (a === 'close') return closePortal();
    if (a === 'authtab') { S.authTab = b.dataset.v; S.msg = ''; S.msgType = ''; S.view = 'auth'; return render(); }
    if (a === 'pw') { const i = b.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; return; }
    if (a === 'fill') { S.authTab = 'in'; S.view = 'auth'; render(); return; }
    if (a === 'forgot') {
      const em = ($('#gpEmail', root) || {}).value; const f = $('form[data-form=in]', root);
      if (!em) return say(f, 'Escreva o seu e-mail acima e toque de novo.', 'err');
      try { await be.resetPassword(em.trim()); say(f, 'Enviámos um e-mail com o link para criar nova palavra-passe.', 'ok'); } catch (x) { say(f, x.message, 'err'); } return;
    }
    if (a === 'retry' || a === 'recheck') return boot();
    if (a === 'logout') {
      await guard(() => be && be.signOut());
      store.del('aq.os.staff'); store.del('aq.os.staff.me'); S.osStaff = ''; S.osDesk = null;
      S.me = null; S.mine = null; S.team = null; S.calls = []; stopWork(); S.authTab = 'in'; S.view = 'auth'; S.msg = '';
      showStaffBar(false); paintNav(); return render();
    }
    if (a === 'theme') { toggleTheme(); return; }
    if (a === 'closetable') {
      const k = b.dataset.k;
      const list = ((S.osDesk && S.osDesk.orders) || []).filter((o) => orderPlace(o) === k && o.status !== 'cancelled' && o.payment_status !== 'paid');
      for (const o of list) {
        const body = { payment_status: 'paid' };
        await patchDeskOrder(o.id, body);
      }
      toast('Pedidos desta mesa marcados como pagos.', 'check', 'ok'); await loadOsDesk(); renderTab(); return;
    }
    if (a === 'osord') {
      const doWhat = b.dataset.do, id = b.dataset.id;
      const body = doWhat === 'paid' ? { payment_status: 'paid' }
        : doWhat === 'pospaid' ? { payment_status: 'paid', payment_method: 'pos' }
        : doWhat === 'markpaid' ? { payment_status: 'paid' }
        : doWhat === 'driver' ? { driver_ok: true, status: 'on_the_way' }
        : doWhat === 'receive' ? { received_ok: true, client_ok: true, driver_ok: true }
        : { status: doWhat };
      b.disabled = true;
      const r = await patchDeskOrder(id, body);
      b.disabled = false;
      if (r) {
        const paidNow = (r.payment_status === 'paid' || r.pay === 'paid');
        const gotNow = !!(r.received_ok || (r.driver_ok && r.client_ok));
        const msg = r.status === 'delivered' && paidNow ? 'Pedido entregue — pago e recebido.'
          : doWhat === 'receive' && !paidNow ? 'Recebido pelo cliente. Falta confirmar o pagamento.'
          : (doWhat === 'paid' || doWhat === 'pospaid' || doWhat === 'markpaid') && gotNow ? 'Pagamento confirmado — pedido entregue.'
          : doWhat === 'paid' || doWhat === 'pospaid' || doWhat === 'markpaid' ? 'Pagamento confirmado.'
          : doWhat === 'driver' ? 'Saiu para entrega.'
          : doWhat === 'ready' ? 'Pedido marcado como pronto.'
          : 'Pedido em preparação.';
        toast(msg, 'check', 'ok');
        await loadOsDesk();
        renderTab();
      } else toast('Não foi possível atualizar este pedido.', 'alert', 'err');
      return;
    }
    if (a === 'tab') return enterTab(b.dataset.t);
    if (a === 'memberview') { S.viewMember = b.dataset.id; return enterTab('member'); }
    if (a === 'export') { doExport(b.dataset.kind); return; }
    if (a === 'freset') {
      if (b.dataset.k === 'cf') { S.cf = emptyCf(); S.zone = 'all'; } else S.of = emptyOf();
      return renderTab();
    }
    if (a === 'zone') { S.zone = b.dataset.v; return renderTab(); }
    if (a === 'hper') { S.hper = +b.dataset.v; return renderTab(); }
    if (a === 'period') { S.period = +b.dataset.v; return renderTab(); }
    if (a === 'sound') { S.soundOn = b.checked; store.set('aq.gp.sound', S.soundOn ? '1' : '0'); if (S.soundOn) beep(); return; }
    if (a === 'notif') { try { await Notification.requestPermission(); } catch (x) { /* */ } return renderTab(); }
    if (a === 'simulate') { await guard(() => be.simulateCall()); return refreshCalls(); }
    if (a === 'resetdemo') { await be.resetDemo(); S.mine = null; S.calls = []; S.lastPend = null; return boot(); }
    if (a === 'accept' || a === 'complete' || a === 'release') {
      if (b.disabled) return; b.disabled = true; const id = b.dataset.id;
      if (String(id).startsWith('os-')) {
        const osId = id.slice(3);
        const path = a === 'complete' || a === 'release' ? '/live/calls/' + osId + '/close' : '/live/calls/' + osId + '/accept';
        let r = null;
        if (hasOsApi()) {
          try { r = await osFetch(path, { method: 'POST', body: {} }); } catch (e) { r = null; }
        }
        if (window.AquaBus) {
          const patch = a === 'accept'
            ? { status: 'accepted', accepted_at: new Date().toISOString(), waiterName: (S.me && S.me.name) || 'Garçom' }
            : { status: 'closed', closed_at: new Date().toISOString() };
          const row = AquaBus.patchCall(osId, patch);
          if (!r) r = { call: row };
        }
        if (r) {
          toast(a === 'accept' ? 'Chamado aceite — o cliente já vê que está a caminho.' : a === 'complete' ? 'Chamado concluído. Bom trabalho!' : 'Chamado encerrado.', 'check', 'ok');
          await refreshLiveCalls(); if (S.tab === 'calls') renderTab();
        }
        return;
      }
      const r = await guard(() => (a === 'accept' ? be.acceptCall(id) : a === 'complete' ? be.completeCall(id) : be.releaseCall(id)));
      if (r === true) {
        if (a === 'accept') toast('Chamado aceite — o cliente já vê que está a caminho.', 'check', 'ok');
        else if (a === 'complete') toast('Chamado concluído. Bom trabalho!', 'check', 'ok');
        else { toast('Chamado devolvido à fila.', 'undo'); if (S.lastPend) S.lastPend.add(id); }
      } else if (r === false) toast(a === 'accept' ? 'Outro colega já aceitou este chamado.' : 'Não foi possível atualizar este chamado.', 'alert', 'err');
      S.mineAt = 0; await refreshCalls(); if (S.tab === 'calls') renderTab(); return;
    }
    if (a === 'member') {
      const m = S.team.staff.find((x) => x.id === b.dataset.id); if (!m) return; const d = b.dataset.do;
      const next = { approve: [true, 'waiter'], promote: [true, 'admin'], demote: [true, 'waiter'], disable: [false, m.role] }[d];
      if (d === 'disable' && !confirm('Desativar ' + m.name + '? Deixa de poder entrar e aceitar chamados.')) return;
      const ok = await guard(() => be.setStaff(m.id, next[0], next[1]));
      if (ok) { toast(d === 'approve' ? esc(m.name) + ' aprovado(a).' : 'Equipa atualizada.', 'check', 'ok'); await guard(loadTeam); if (S.tab === 'member' && d === 'disable') return enterTab('team'); renderTab(); }
    }
  }
  async function onSubmit(e) {
    e.preventDefault(); const f = e.target, kind = f.dataset.form, be = backend(), v = Object.fromEntries(new FormData(f).entries());
    if (!kind) return;
    if (kind === 'ofilter' || kind === 'cfilter') { applyNamedFilter(f); renderTab(); return; }
    if (!be && kind !== 'osadmin') return;
    say(f, '');
    const email = String(v.email || '').trim();
    try {
      if (kind === 'pin') {
        const pin = String(v.pin || '').trim();
        if (pin.length < 4) return say(f, 'Indique o PIN da equipa.', 'err');
        busy(f, true);
        let ok = false;
        try {
          const r = await osFetch('/staff/open', { method: 'POST', body: { pin } });
          if (r && r.token) {
            store.set('aq.os.staff', r.token); S.osStaff = r.token;
            const me = { id: 'os-w-' + r.waiter.id, user_id: 'os-w-' + r.waiter.id, name: r.waiter.name, email: '', phone: r.waiter.phone || '', role: 'waiter', active: true, color: '#00A8FF', created_at: iso(Date.now()) };
            store.set('aq.os.staff.me', JSON.stringify(me)); S.me = me; ok = true;
          }
        } catch (e) { /* local */ }
        if (!ok) {
          const desk = backend();
          if (!desk || !desk.openPin) throw new Error('PIN incorrecto.');
          S.me = desk.openPin(pin);
        }
        S.msg = ''; toast('Sessão da equipa aberta.', 'check', 'ok'); await boot();
      } else if (kind === 'osadmin') {
        if (!/^\S+@\S+\.\S+$/.test(email) || !v.password) return say(f, 'Indique o e-mail e a palavra-passe.', 'err');
        busy(f, true);
        await osFetch('/auth/login', { method: 'POST', body: { email, password: v.password, remember: true } });
        const adminMe = { id: 's-admin', user_id: 's-admin', name: 'Administração', email: email, phone: '', role: 'admin', active: true, color: '#0A0A0A', created_at: iso(Date.now()) };
        store.set('aq.os.staff.me', JSON.stringify(adminMe)); S.me = adminMe;
        await loadOsDesk();
        toast('Administração ligada.', 'check', 'ok');
        await boot();
      } else if (kind === 'in') {
        if (!/^\S+@\S+\.\S+$/.test(email) || !v.password) return say(f, 'Indique o e-mail e a palavra-passe.', 'err');
        busy(f, true); await be.signIn(email, v.password); S.msg = ''; await boot();
      } else if (kind === 'up') {
        const name = String(v.name || '').trim();
        if (name.length < 2) return say(f, 'Indique o seu nome completo.', 'err');
        if (!/^\S+@\S+\.\S+$/.test(email)) return say(f, 'Indique um e-mail válido.', 'err');
        if (String(v.password).length < 8) return say(f, 'A palavra-passe precisa de pelo menos 8 caracteres.', 'err');
        if (v.password !== v.password2) return say(f, 'As palavras-passe não coincidem.', 'err');
        busy(f, true); const r = await be.signUp({ name, email, phone: String(v.phone || '').trim(), password: v.password });
        if (r.needsConfirm) { S.view = 'confirm'; render(); } else await boot();
      } else if (kind === 'recover') {
        if (String(v.password).length < 8) return say(f, 'A palavra-passe precisa de pelo menos 8 caracteres.', 'err');
        busy(f, true); await be.changePassword(v.password); S.recovery = false; toast('Palavra-passe atualizada.', 'check', 'ok'); await boot();
      } else if (kind === 'profile') {
        busy(f, true); await be.updateProfile({ name: v.name, phone: v.phone }); S.me = await be.profile(); S.mine = null; say(f, 'Dados guardados.', 'ok');
        const w = $('.gp-who', root); if (w) w.parentElement.outerHTML = '<div class="gp-card"><div class="gp-who">' + avatar(S.me) + '<div><h2>' + esc(S.me.name) + '<span class="gp-role">' + (S.me.role === 'admin' ? 'Admin' : 'Garçom') + '</span></h2><small>' + esc(S.me.email || '') + '</small></div></div></div>';
      } else if (kind === 'pass') {
        if (String(v.password).length < (mode() === 'desk' ? 4 : 8)) return say(f, 'Indique um PIN ou palavra-passe válida.', 'err');
        busy(f, true); await be.changePassword(v.password); f.reset(); say(f, 'Palavra-passe alterada.', 'ok');
      } else if (kind === 'setpin') {
        if (!be || !be.setPin) throw new Error('Sem permissão para alterar PIN.');
        busy(f, true); await be.setPin(f.dataset.id, String(v.pin || '').trim()); say(f, 'PIN actualizado.', 'ok'); await guard(loadTeam); renderTab();
      } else if (kind === 'invite') {
        if (!be || !be.inviteStaff) throw new Error('Sem permissão para criar perfil.');
        busy(f, true); await be.inviteStaff({ name: v.name, pin: v.pin, phone: v.phone }); f.reset(); say(f, 'Perfil criado. O garçom entra com este PIN.', 'ok'); await guard(loadTeam); renderTab();
      }
    } catch (x) {
      if (kind === 'in' || kind === 'up' || kind === 'recover' || kind === 'pin' || kind === 'osadmin') { S.msg = x.message; S.msgType = 'err'; if (S.view === 'auth' || S.view === 'recover') { const keep = Object.assign({}, v); render(); const nf = $('form', root); if (nf) { ['name', 'email', 'phone', 'pin'].forEach((k) => { if (nf.elements[k] && keep[k]) nf.elements[k].value = keep[k]; }); } } }
      else say(f, x.message, 'err');
    } finally { busy(f, false); }
  }

  /* ====================================================================== AVALIAÇÃO (cliente) */
  function mountRating(el, id, done) {
    el.dataset.on = '1'; let n = 0;
    el.innerHTML = '<p><b>Como foi o atendimento?</b></p><div class="rt" role="radiogroup" aria-label="Nota de 1 a 5">' + [1, 2, 3, 4, 5].map((i) => '<button type="button" role="radio" aria-checked="false" data-n="' + i + '" aria-label="' + i + ' de 5">★</button>').join('') +
      '</div><input type="text" maxlength="140" placeholder="Quer deixar um comentário? (opcional)" aria-label="Comentário opcional"><button type="button" class="btn btn-cyan" disabled>Enviar avaliação</button><p class="msg" role="status"></p>';
    const stars_ = $$('.rt button', el), send = $('.btn', el), msg = $('.msg', el), inp = $('input', el);
    const paint = (k) => stars_.forEach((s, i) => { s.classList.toggle('on', i < k); s.setAttribute('aria-checked', String(i + 1 === n)); });
    stars_.forEach((s) => { s.addEventListener('mouseenter', () => paint(+s.dataset.n)); s.addEventListener('mouseleave', () => paint(n)); s.addEventListener('focus', () => paint(+s.dataset.n)); s.addEventListener('blur', () => paint(n));
      s.addEventListener('click', () => { n = +s.dataset.n; paint(n); send.disabled = false; }); });
    send.addEventListener('click', async () => {
      if (!n) return; send.disabled = true; msg.textContent = 'A enviar…';
      try { await need().rateCall(id, n, inp.value); el.innerHTML = '<p><b>Obrigado pela sua avaliação! ' + '★'.repeat(n) + '</b></p><p class="msg">A sua opinião ajuda a equipa a melhorar.</p>'; if (done) done(); }
      catch (x) { msg.textContent = x.message || 'Não foi possível enviar a avaliação.'; send.disabled = false; }
    });
  }

  /* ====================================================================== ARRANQUE */
  function checkHash() {
    const h = location.hash;
    if (/type=recovery/.test(h) && mode() === 'live') { S.recovery = true; backend().session().then(() => openPortal('calls')); return; }
    if (/^#(garcom|equipa)/.test(h)) openPortal(/stats/.test(h) ? 'stats' : /admin/.test(h) ? 'dash' : 'orders');
    else if (/^#admin/.test(h)) openPortal('dash');
  }
  function init() {
    try { if (store.get('aq.theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch (e) { /* */ }
    buildNav();
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.open && !document.querySelector('dialog[open]')) closePortal(); });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-open-staff]');
      if (!b) return;
      e.preventDefault();
      openPortal(b.getAttribute('data-open-staff') || 'orders');
    });
    window.addEventListener('hashchange', checkHash);
    const be = backend(); if (be && be.hasStoredSession()) silentBoot().then(() => { showStaffBar(staffLogged()); paintNav(); });
    startLiveCalls();
    checkHash();
  }
  window.AquaGarcom = { open: openPortal, close: closePortal, _state: S };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
