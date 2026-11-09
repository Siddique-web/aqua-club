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

  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      method: opts.method || 'GET',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'fail'), { code: data.error });
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
    ].concat((catalog.categories || []).filter((c) => c.id !== 'rapidos').map((c) => [c.id, loc(c, lang)]));
    AquaUI.rebuildCats(cats);
  }

  window.AquaOS = {
    async canOrder() { return true; },
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
        note: o.note || '',
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
      o.pay = r.order.payment_status === 'paid' ? 'paid' : 'unpaid';
      o.deliveryFee = r.order.delivery_fee || o.deliveryFee;
      o.deliveryBand = r.order.delivery_band || o.deliveryBand;
      o.total = r.order.total || o.total;
      return r.order;
    },
    async declarePay(o, method, ref) {
      const r = await api('/orders/' + o.id + '/pay', {
        method: 'POST',
        body: { method, ref: ref || '', code: o.code, currency: 'MT', payTo: (typeof PAYMENT !== 'undefined' && PAYMENT.methods.find((m) => m.id === method)?.digits) || undefined }
      });
      return r.order;
    },
    async orderStatus(code) {
      const r = await api('/orders/status?code=' + encodeURIComponent(code));
      return r.order;
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

  async function boot() {
    applyLangButtons();
    try {
      catalog = await api('/catalog');
      if (catalog.club) {
        CONTACT.address = catalog.club.address;
        CONTACT.phone = catalog.club.phoneDisplay;
        CONTACT.whatsapp = catalog.club.whatsapp;
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
    } catch (e) { console.warn('Catálogo em linha indisponível; menu local.', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
