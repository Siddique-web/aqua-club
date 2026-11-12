/* Liga o site original (slides e fotos) ao sistema de pedidos, mesas, pagamentos e línguas. */
(function () {
  const FOOD = {
    tabuas: ['assets/prato-petiscos.jpg', 'assets/prato-petiscos-d2.jpg', 'assets/petiscos.jpg'],
    entradas: ['assets/prato-petiscos.jpg', 'assets/prato-petiscos-d1.jpg', 'assets/petiscos.jpg'],
    saladas: ['assets/prato-petiscos-d1.jpg', 'assets/petiscos.jpg'],
    sopas: ['assets/prato-petiscos-d2.jpg', 'assets/prato-petiscos.jpg'],
    pizzas: ['assets/prato-petiscos.jpg', 'assets/petiscos.jpg', 'assets/prato-petiscos-d1.jpg'],
    massas: ['assets/prato-petiscos-d2.jpg', 'assets/prato-petiscos.jpg'],
    carnes: ['assets/prato-petiscos-d2.jpg', 'assets/petiscos.jpg'],
    peixes: ['assets/prato-petiscos-d1.jpg', 'assets/prato-petiscos.jpg'],
    sandes: ['assets/prato-petiscos.jpg', 'assets/prato-petiscos-d1.jpg'],
    vegetarianos: ['assets/petiscos.jpg', 'assets/prato-petiscos-d1.jpg'],
    extras: ['assets/prato-petiscos-d2.jpg', 'assets/petiscos.jpg'],
    sobremesas: ['assets/prato-mousse.jpg', 'assets/sobremesas.jpg', 'assets/prato-mousse-d1.jpg'],
    cocktails: ['assets/bar.jpg', 'assets/prato-bar.jpg', 'assets/bar-balcao.jpg'],
    cervejas: ['assets/bar-balcao.jpg', 'assets/bar.jpg'],
    vinhos: ['assets/bar.jpg', 'assets/prato-bar.jpg'],
    espirituosas: ['assets/bar-balcao.jpg', 'assets/bar.jpg'],
    cafetaria: ['assets/bar.jpg', 'assets/bar-balcao.jpg'],
    grupos: ['assets/prato-petiscos.jpg', 'assets/petiscos.jpg'],
    rapidos: ['assets/prato-petiscos.jpg', 'assets/prato-petiscos-d1.jpg']
  };
  function hashId(id) {
    let h = 0;
    for (let i = 0; i < String(id).length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function photoFor(m) {
    const pool = FOOD[m.cat] || FOOD.entradas;
    return pool[hashId(m.id) % pool.length];
  }
  const loc = (obj, lang) => (obj && typeof obj === 'object' && (obj[lang] || obj.pt)) || obj || '';
  let lang = localStorage.getItem('aqua_lang') || 'pt';
  let catalog = null;
  let live = false;
  let origin = '';
  let sock = null;
  let sockUp = false;

  function apiOrigin() {
    try {
      const q = new URLSearchParams(location.search).get('api');
      if (q) {
        localStorage.setItem('aqua_api', q);
        return String(q).replace(/\/$/, '');
      }
      const stored = localStorage.getItem('aqua_api');
      if (stored) return String(stored).replace(/\/$/, '');
      const cfg = String(window.AQUA_API || '').replace(/\/$/, '');
      if (cfg) return cfg;
    } catch (e) { /* */ }
    return '';
  }
  function apiUrl(path) { return origin + '/api' + path; }

  async function probeOrigin(base) {
    const root = String(base || '').replace(/\/$/, '');
    const url = root + '/api/health';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch(url, { credentials: 'include', signal: ctrl.signal });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.ok) return root;
    } catch (e) { /* */ }
    finally { clearTimeout(t); }
    return '';
  }

  async function resolveOrigin() {
    const preferred = apiOrigin();
    if (preferred) {
      const ok = await probeOrigin(preferred);
      if (ok) return ok;
    }
    const same = await probeOrigin(location.origin);
    if (same) return same;
    return '';
  }

  function loadIo(cb) {
    if (window.io) { cb(window.io); return; }
    if (!origin) { cb(null); return; }
    const s = document.createElement('script');
    s.src = origin + '/socket.io/socket.io.js';
    s.async = true;
    s.onload = () => cb(window.io || null);
    s.onerror = () => cb(null);
    document.head.appendChild(s);
  }

  function connectSock(handlers) {
    loadIo((io) => {
      if (!io || sock) {
        if (sock && handlers) bindSock(handlers);
        return;
      }
      try {
        sock = io(origin || undefined, { transports: ['websocket', 'polling'], withCredentials: true });
        sock.on('connect', () => { sockUp = true; });
        sock.on('disconnect', () => { sockUp = false; });
        bindSock(handlers || {});
      } catch (e) { sock = null; sockUp = false; }
    });
  }

  function bindSock(handlers) {
    if (!sock) return;
    sock.off('order:updated'); sock.off('order:new'); sock.off('call:updated'); sock.off('call:new');
    if (handlers.onOrder) {
      sock.on('order:updated', handlers.onOrder);
      sock.on('order:new', handlers.onOrder);
    }
    if (handlers.onCall) {
      sock.on('call:updated', handlers.onCall);
      sock.on('call:new', handlers.onCall);
    }
  }

  const BUS_KEY = 'aq.os.bus';
  function readBus() {
    try { return JSON.parse(localStorage.getItem(BUS_KEY) || ''); } catch (e) { /* */ }
    return { orders: [], calls: [] };
  }
  function writeBus(d) {
    const next = { orders: (d.orders || []).slice(0, 80), calls: (d.calls || []).slice(0, 80) };
    try { localStorage.setItem(BUS_KEY, JSON.stringify(next)); } catch (e) { /* */ }
    try { window.dispatchEvent(new CustomEvent('aq-os-up', { detail: next })); } catch (e) { /* */ }
    try {
      if (!window.__aqBc) window.__aqBc = new BroadcastChannel('aq-os');
      window.__aqBc.postMessage('up');
    } catch (e) { /* */ }
  }
  window.AquaBus = {
    read: readBus,
    write: writeBus,
    pushCall(c) { const d = readBus(); d.calls = d.calls || []; d.calls.unshift(c); writeBus(d); },
    pushOrder(o) { const d = readBus(); d.orders = d.orders || []; d.orders.unshift(o); writeBus(d); },
    patchCall(id, patch) {
      const d = readBus(); const c = (d.calls || []).find((x) => String(x.id) === String(id));
      if (c) Object.assign(c, patch); writeBus(d); return c;
    },
    patchOrder(id, patch) {
      const d = readBus(); const o = (d.orders || []).find((x) => String(x.id) === String(id) || String(x.code) === String(id));
      if (o) {
        Object.assign(o, patch);
        if (patch.payment_status === 'paid') o.pay = 'paid';
        if (patch.payment_status === 'declared') o.pay = 'paid_declared';
        if (patch.payment_status === 'unpaid') o.pay = 'unpaid';
        if (o.driver_ok && o.client_ok) o.status = 'delivered';
        else if ((o.driver_ok || o.client_ok) && (o.status === 'ready' || o.status === 'preparing' || o.status === 'review' || o.status === 'received')) o.status = 'on_the_way';
      }
      writeBus(d); return o;
    }
  };

  async function api(path, opts = {}) {
    const res = await fetch(apiUrl(path), {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      method: opts.method || 'GET',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json().catch(() => ({})) : {};
    if (!ct.includes('json') || !res.ok) throw Object.assign(new Error((data && data.error) || 'offline'), { code: data.error || 'offline' });
    return data;
  }

  function applyLangButtons() {
    lang = (window.AquaI18n && AquaI18n.lang()) || localStorage.getItem('aqua_lang') || 'pt';
    document.querySelectorAll('#langBar [data-lang]').forEach((b) => {
      b.classList.toggle('on', b.dataset.lang === lang);
    });
    if (window.AquaI18n) AquaI18n.onChange((l) => { lang = l; paintMenuLang(); if (window.AquaOS && AquaOS.onTable) { const s = document.getElementById('menuTable'); if (s && s.value) AquaOS.onTable(s.value); } });
  }

  function paintMenuLang() {
    if (!catalog || !window.AquaUI) return;
    MENU.forEach((m) => {
      const src = catalog.menu.find((x) => x.id === m.id);
      if (!src) return;
      m.name = loc(src, lang);
      m.desc = loc(src.desc, lang);
    });
    const cats = [
      ['rapidos', { pt: 'Pratos rápidos', en: 'Quick dishes', es: 'Platos rápidos', fr: 'Plats rapides', zh: '快手菜' }[lang] || 'Pratos rápidos'],
      ['todos', { pt: 'Todos', en: 'All', es: 'Todo', fr: 'Tout', zh: '全部' }[lang] || 'Todos']
    ];
    const seen = new Set(['rapidos', 'todos']);
    (catalog.categories || []).forEach((c) => {
      if (!c || !c.id || seen.has(c.id)) return;
      seen.add(c.id);
      cats.push([c.id, loc(c, lang) || c.id]);
    });
    (catalog.menu || []).forEach((m) => {
      if (!m || !m.cat || seen.has(m.cat)) return;
      seen.add(m.cat);
      cats.push([m.cat, m.cat]);
    });
    AquaUI.rebuildCats(cats);
  }

  window.AquaOS = {
    live: () => live,
    origin: () => origin,
    socketUp: () => sockUp,
    connectLive(handlers) { connectSock(handlers || {}); },
    joinOrder(code) {
      if (sock && code) try { sock.emit('join', 'order:' + code); } catch (e) { /* */ }
    },
    async canOrder() { return live; },
    async placeOrder(o) {
      const dine = o.fulfillment !== 'takeaway';
      const tableNumber = dine ? (parseInt(String(o.table).replace(/\D/g, ''), 10) || Number(o.table)) : null;
      const body = {
        fulfillment: dine ? 'dine_in' : 'takeaway',
        take: o.take || (o.deliveryFee ? 'delivery' : 'pickup'),
        tableNumber,
        currency: 'MT',
        deliveryFee: o.deliveryFee || 0,
        deliveryBand: o.deliveryBand || '',
        km: o.km,
        lat: o.lat,
        lng: o.lng,
        address: o.address || '',
        placeLabel: o.placeLabel || '',
        name: o.name || '',
        phone: o.phone || '',
        waGroupOpt: !!o.waGroupOpt,
        nConta: o.nConta || 0,
        note: [o.nConta ? ('Conta ' + o.nConta) : '', o.note, o.bairro, o.waGroupOpt ? 'Grupo WA: sim' : '', o.navUrl ? ('Maps ' + o.navUrl) : ''].filter(Boolean).join(' · '),
        lines: (o.lines || []).map((l) => ({
          itemId: l.itemId || l.menuItemId,
          qty: l.qty || l.quantity,
          extras: l.extras || [],
          doneness: l.doneness,
          details: {}
        }))
      };
      const r = await api('/orders', { method: 'POST', body });
      o.code = r.order.code;
      o.id = r.order.id;
      o.status = r.order.status || 'review';
      o.pay = r.order.payment_status === 'declared' ? 'paid_declared' : (r.order.payment_status === 'paid' ? 'paid' : 'unpaid');
      o.deliveryFee = r.order.delivery_fee || o.deliveryFee;
      o.deliveryBand = r.order.delivery_band || o.deliveryBand;
      o.total = r.order.total || o.total;
      return r.order;
    },
    async declarePay(o, method, ref, geo) {
      const r = await api('/orders/' + o.id + '/pay', {
        method: 'POST',
        body: {
          method, ref: ref || '', code: o.code, currency: 'MT',
          payTo: (typeof PAYMENT !== 'undefined' && PAYMENT.methods.find((m) => m.id === method)?.digits) || undefined,
          lat: geo && geo.lat, lng: geo && geo.lng, change: !!(o && o.method)
        }
      });
      return r.order;
    },
    async orderStatus(code) {
      const r = await api('/orders/status?code=' + encodeURIComponent(code));
      return r.order;
    },
    async confirmDelivery(o) {
      try {
        const r = await api('/orders/confirm-delivery', { method: 'POST', body: { code: o.code } });
        return r.order;
      } catch (e) {
        if (window.AquaBus) return AquaBus.patchOrder(o.id || o.code, { client_ok: 1, status: o.status });
        return null;
      }
    },
    async createCall(code, reason, extra) {
      const map = { request_bill: 'conta', menu_question: 'duvida', new_order: 'pedido', urgent_other: 'urgente' };
      const tableNumber = parseInt(String(code).replace(/\D/g, ''), 10);
      const r = await api('/calls', {
        method: 'POST',
        body: {
          tableNumber,
          reason: map[reason] || reason || 'duvida',
          note: (extra && extra.note) || '',
          name: (extra && extra.name) || '',
          phone: (extra && extra.phone) || ''
        }
      });
      return r.call.id;
    },
    async callStatus(id) {
      const r = await api('/calls/' + id);
      const st = r.call.status === 'closed' ? 'completed' : r.call.status;
      return { status: st, by: r.call.waiterName || '', createdAt: r.call.created_at, acceptedAt: r.call.accepted_at };
    },
    async cancelCall(id) {
      return api('/calls/' + id + '/cancel', { method: 'POST', body: {} });
    },
    async onTable(code) {
      const n = parseInt(String(code).replace(/\D/g, ''), 10);
      const box = document.getElementById('waiterBox');
      if (!n || !box) return;
      try {
        const r = await api('/waiter-for-table/' + n);
        if (!r.waiter) { box.hidden = true; return; }
        const w = r.waiter;
        box.hidden = false;
        const tr = (k) => (window.AquaI18n ? AquaI18n.t(k) : k);
        box.innerHTML = `<img src="${w.photo}" alt="">
          <div><b>${tr('menu.waiter')}</b><h3 style="margin:.2rem 0">${w.name}</h3>
          <p style="margin:0;color:#3D4852">${w.bio || ''}</p>
          <p style="margin:.3rem 0 0"><b>${w.phone}</b>
          <button type="button" class="btn btn-line" data-copy="${w.phone}">${tr('menu.copy')}</button></p></div>`;
        box.querySelector('[data-copy]')?.addEventListener('click', () => {
          navigator.clipboard.writeText(String(w.phone).replace(/\s/g, '')).catch(() => {});
        });
      } catch { box.hidden = true; }
    }
  };

  async function loadCatalog() {
    try {
      const data = await api('/catalog');
      if (data && Array.isArray(data.menu)) { live = true; return data; }
    } catch (e) { /* estático (Vercel) usa catalog.json */ }
    live = false;
    const r = await fetch('catalog.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('catalog');
    return r.json();
  }

  async function boot() {
    applyLangButtons();
    origin = await resolveOrigin();
    try {
      catalog = await loadCatalog();
      if (catalog.club) {
        CONTACT.address = catalog.club.address;
        CONTACT.phone = catalog.club.phoneDisplay;
        CONTACT.whatsapp = catalog.club.whatsapp;
        if (catalog.club.whatsappGroup) CONTACT.whatsappGroup = catalog.club.whatsappGroup;
        CONTACT.email = catalog.club.email;
        const pay = catalog.club.payments || {};
        if (typeof PAYMENT !== 'undefined' && PAYMENT.methods) {
          PAYMENT.methods.forEach((m) => {
            const src = pay[m.id];
            if (!src) return;
            m.number = src.number || m.number;
            m.digits = src.digits || m.digits;
            m.holder = src.holder || m.holder;
            m.network = src.network || m.network;
            if (src.name) m.label = src.name + (src.network ? ' (' + src.network + ')' : '');
          });
        }
      }
      MENU.length = 0;
      catalog.menu.forEach((m) => {
        MENU.push({
          id: m.id,
          cat: m.cat,
          name: loc(m, lang),
          desc: loc(m.desc, lang) || '',
          price: m.price,
          img: photoFor(m),
          available: m.available !== false,
          quick: !!m.quick,
          doneness: !!m.doneness,
          extras: m.extras || [],
          details: m.details || []
        });
      });
      const wait = () => window.AquaUI ? Promise.resolve() : new Promise((r) => setTimeout(() => r(wait()), 50));
      await wait();
      paintMenuLang();
      AquaUI.fillTables();
      if (AquaUI.rebuildWall) AquaUI.rebuildWall();
      if (live) connectSock({});
      if (AquaUI.liveOrders) AquaUI.liveOrders();
    } catch (e) { console.warn('Catálogo em linha indisponível; menu local.', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
