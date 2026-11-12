import { LANGS, t, loc } from './i18n.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const state = {
  lang: LANGS.some((l) => l.id === localStorage.getItem('aqua_lang')) ? localStorage.getItem('aqua_lang') : 'pt',
  user: null,
  catalog: null,
  tables: [],
  shifts: [],
  table: Number(localStorage.getItem('aqua_table') || 0) || null,
  fulfillment: localStorage.getItem('aqua_ful') || 'dine_in',
  cart: JSON.parse(localStorage.getItem('aqua_cart') || '[]'),
  view: location.hash.replace('#/', '') || 'menu',
  waiter: null,
  cat: 'all',
  q: '',
  staff: JSON.parse(sessionStorage.getItem('aqua_staff') || 'null'),
  admin: null,
  socket: null,
  lastDemoCode: localStorage.getItem('aqua_demo_code') || ''
};

function saveCart() { localStorage.setItem('aqua_cart', JSON.stringify(state.cart)); }
function tr(k) { return t(state.lang, k); }
function money(n) { return Number(n || 0).toLocaleString('pt-MZ') + ' MT'; }
function elapsed(ts) {
  if (!ts) return '—';
  const raw = String(ts).replace(' ', 'T');
  const t = Date.parse(/Z$|[+-]\d\d:\d\d$/.test(raw) ? raw : raw + 'Z');
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s % 60).padStart(2, '0')}`;
}
function stLab(s) {
  return ({ review: 'Em análise', received: 'Em análise', preparing: 'A preparar', ready: 'Pronto', delivered: 'Entregue', cancelled: 'Cancelado', no_confirm: 'Sem confirmação' }[s] || s);
}
function payLab(s) {
  return ({ unpaid: 'Por pagar', declared: 'Declarado', paid: 'Pago', rejected: 'Rejeitado' }[s] || s);
}
function tickTimers() {
  $$('[data-from]').forEach((el) => { el.textContent = elapsed(el.dataset.from); });
}
setInterval(tickTimers, 1000);

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.staff?.token) headers.Authorization = 'Bearer ' + state.staff.token;
  const res = await fetch('/api' + path, { credentials: 'include', ...opts, headers, body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'fail'), { code: data.error, status: res.status });
  return data;
}

function toast(msg) {
  const n = document.createElement('div');
  n.className = 'toast'; n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2800);
}

async function copyText(v) {
  const text = String(v).replace(/\s/g, '');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  toast(tr('copied'));
}

function setLang(id) {
  if (!LANGS.some((l) => l.id === id)) return;
  state.lang = id;
  localStorage.setItem('aqua_lang', id);
  document.documentElement.lang = id === 'zh' ? 'zh-CN' : id;
  render();
}

function go(view) {
  state.view = view;
  const hash = '#/' + view;
  if (location.hash !== hash) location.hash = hash;
  else render();
}

function cartTotal() {
  return state.cart.reduce((s, l) => s + l.lineTotal, 0);
}

function donenessLabel(pct) {
  const scale = state.catalog?.doneness || [];
  const hit = scale.find((d) => pct >= d.min && pct <= d.max) || scale[3];
  return loc(hit, state.lang) + (hit?.temp ? ' · ' + hit.temp : '');
}

function header() {
  return `<header class="header">
    <a class="brand" href="#/menu">
      <span class="logo">AC</span>
      <span><b>Aqua Club</b><small>${tr('brandSub')}</small></span>
    </a>
    <nav class="nav">
      <a class="${state.view==='menu'?'on':''}" href="#/menu">${tr('nav.menu')}</a>
      <a class="${state.view==='mesas'?'on':''}" href="#/mesas">${tr('nav.tables')}</a>
      <a class="${state.view==='conta'?'on':''}" href="#/conta">${tr('nav.account')}</a>
      <a class="${state.view==='contacto'?'on':''}" href="#/contacto">${tr('nav.contact')}</a>
      <a class="${state.view==='staff'?'on':''}" href="#/staff">${tr('nav.staff')}</a>
      <a class="${state.view==='admin'?'on':''}" href="#/admin">${tr('nav.admin')}</a>
      <div class="langpick">
        <button type="button" class="lang-btn" data-lang-toggle aria-haspopup="listbox" aria-expanded="false" title="${tr('nav.lang')}">
          <span class="flag" data-flag="${state.lang}" aria-hidden="true"></span>
          <span>${tr('nav.lang')}</span>
        </button>
        <div class="lang-menu" role="listbox">${LANGS.map((l) => `<button type="button" role="option" class="${state.lang===l.id?'on':''}" data-lang="${l.id}"><span class="flag" data-flag="${l.id}" aria-hidden="true"></span>${l.label} <b>${l.flag}</b></button>`).join('')}</div>
      </div>
    </nav>
  </header>`;
}

function waiterCard() {
  const w = state.waiter;
  if (!w) return `<p class="muted">${tr('noWaiter')}</p>`;
  return `<div class="waiter">
    <img alt="${w.name}" src="${w.photo}">
    <div><div class="badge">${tr('waiterToday')}</div>
    <h3>${w.name}</h3>
    <p class="muted">${w.bio || ''}</p>
    <p class="copy"><b>${w.phone}</b> <button class="btn btn-line" data-copy="${w.phone}">${tr('copy')}</button></p></div>
  </div>`;
}

function filteredMenu() {
  return (state.catalog?.menu || []).filter((m) => {
    if (state.cat === 'rapidos' && !m.quick) return false;
    if (state.cat !== 'rapidos' && state.cat !== 'all' && m.cat !== state.cat) return false;
    const blob = (loc(m, state.lang) + ' ' + loc(m.desc, state.lang)).toLowerCase();
    return !state.q || blob.includes(state.q.toLowerCase());
  });
}

function paintCards() {
  const box = $('.cards');
  if (!box || state.view !== 'menu' && !location.hash.includes('menu') && state.view !== '') return;
  if (!$('#q')) return;
  const items = filteredMenu();
  box.innerHTML = items.map(menuCard).join('') || `<p class="muted">${tr('emptyCart')}</p>`;
  $$('[data-add]').forEach((b) => b.onclick = () => openItem(b.dataset.add));
}

function menuView() {
  const items = filteredMenu();
  const cats = [{ id: 'rapidos', ...{ pt: tr('quick'), en: tr('quick'), es: tr('quick'), fr: tr('quick'), zh: tr('quick') } }, { id: 'all', pt: tr('all'), en: tr('all'), es: tr('all'), fr: tr('all'), zh: tr('all') }, ...(state.catalog?.categories || []).filter((c) => c.id !== 'rapidos')];
  return `<section class="hero"><div class="wrap">
    <h1>${tr('heroTitle')}</h1>
    <p>${tr('heroLead')}</p>
    <div class="cta">
      <a class="btn btn-cyan" href="#/menu">${tr('ctaMenu')}</a>
      <a class="btn btn-dark" href="#/mesas">${tr('ctaTable')}</a>
      ${state.table ? `<span class="badge">${tr('table')} ${state.table} · ${state.fulfillment === 'takeaway' ? tr('takeaway') : tr('dineIn')}</span>` : ''}
    </div>
    ${waiterCard()}
  </div></section>
  <section class="section" id="menu"><div class="wrap">
    <div class="menu-toolbar">
      <input class="search" id="q" value="${state.q}" placeholder="${tr('search')}">
      <div class="cats">${cats.map((c) => `<button class="chip ${state.cat===c.id?'on':''}" data-cat="${c.id}">${c.id==='rapidos'||c.id==='all'? (c.pt || loc(c, state.lang)) : loc(c, state.lang)}</button>`).join('')}</div>
    </div>
    <div class="cards">${items.map(menuCard).join('') || `<p class="muted">${tr('emptyCart')}</p>`}</div>
  </div></section>`;
}

function menuCard(m) {
  return `<article class="card">
    ${m.quick ? `<span class="badge">${tr('quick')}</span>` : ''}
    <h3>${loc(m, state.lang)}</h3>
    <p class="muted">${loc(m.desc, state.lang)}</p>
    <div class="row"><span class="price">${money(m.price)}</span>
    <button class="btn btn-cyan" data-add="${m.id}">${tr('add')}</button></div>
  </article>`;
}

function mesasView() {
  return `<section class="section"><div class="wrap">
    <h2>${tr('tableAsk')}</h2>
    <p class="muted">${tr('tableHelp')}</p>
    <div class="cta" style="margin:1rem 0">
      <button class="btn ${state.fulfillment==='dine_in'?'btn-cyan':'btn-line'}" data-ful="dine_in">${tr('dineIn')}</button>
      <button class="btn ${state.fulfillment==='takeaway'?'btn-cyan':'btn-line'}" data-ful="takeaway">${tr('takeaway')}</button>
    </div>
    <div class="tables">${state.tables.map((tb) => `<button class="tbl ${tb.status} ${state.table===tb.number?'on':''}" data-table="${tb.number}">${tb.number}<br><small>${tb.status}</small></button>`).join('')}</div>
    ${waiterCard()}
  </div></section>`;
}

function authForms() {
  if (state.user && !state.user.emailVerified) {
    return `<div class="card">
      <h3>${tr('verifyTitle')}</h3>
      <p class="muted">${tr('verifyHelp')}</p>
      ${state.lastDemoCode ? `<p class="ok">${tr('demoCode')} <b>${state.lastDemoCode}</b></p>` : ''}
      <label>${tr('verifyBtn')}<input id="vcode" maxlength="6" inputmode="numeric"></label>
      <button class="btn btn-cyan" id="doVerify">${tr('verifyBtn')}</button>
      <button class="btn btn-line" id="doResend">${tr('resend')}</button>
    </div>`;
  }
  if (state.user) {
    return `<div class="card"><h3>${state.user.name}</h3>
      <p>${state.user.email} · ${state.user.phone}</p>
      ${state.user.waGroupOpt ? `<p><a class="btn btn-cyan" target="_blank" rel="noopener" href="${state.catalog.club.whatsappGroup}">${tr('waJoin')}</a></p>` : ''}
      <button class="btn btn-dark" id="logout">${tr('logout')}</button></div>`;
  }
  return `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
    <form class="card" id="loginForm"><h3>${tr('login')}</h3>
      <label>${tr('email')}<input name="email" type="email" required></label>
      <label>${tr('password')}<input name="password" type="password" required></label>
      <label class="row"><span>${tr('remember')}</span><input type="checkbox" name="remember"></label>
      <button class="btn btn-cyan" type="submit">${tr('login')}</button>
      <p class="err" id="loginErr"></p>
    </form>
    <form class="card" id="regForm"><h3>${tr('register')}</h3>
      <label>${tr('name')}<input name="name" required></label>
      <label>${tr('email')}<input name="email" type="email" required></label>
      <label>${tr('phone')}<input name="phone" required placeholder="87 950 1491"></label>
      <label>${tr('password')}<input name="password" type="password" minlength="8" required></label>
      <label>${tr('confirm')}<input name="confirm" type="password" required></label>
      <label class="row"><span>${tr('remember')}</span><input type="checkbox" name="remember"></label>
      <fieldset style="border:2px solid var(--line);border-radius:8px;padding:.6rem .8rem">
        <legend>WhatsApp</legend>
        <label class="row"><span>${tr('waOpt')}</span><input type="radio" name="waGroup" value="yes" checked></label>
        <label class="row"><span>${tr('waRefuse')}</span><input type="radio" name="waGroup" value="no"></label>
      </fieldset>
      <button class="btn btn-yellow" type="submit">${tr('register')}</button>
      <p class="err" id="regErr"></p>
    </form>
  </div>`;
}

function contaView() {
  return `<section class="section"><div class="wrap">
    <h2>${tr('nav.account')}</h2>
    ${authForms()}
    <div id="mine"></div>
  </div></section>`;
}

function contactView() {
  const c = state.catalog.club;
  return `<section class="section"><div class="wrap">
    <h2>${tr('nav.contact')}</h2>
    <p>${c.legal}<br>${c.address}</p>
    <p class="copy"><b>${tr('phoneClub')}: ${c.phoneDisplay}</b>
      <button class="btn btn-line" data-copy="${c.phoneTel}">${tr('copy')}</button>
      <a class="btn btn-cyan" href="tel:${c.phoneTel}">Tel</a>
      <a class="btn btn-dark" target="_blank" rel="noopener" href="https://wa.me/${c.whatsapp}">WhatsApp</a>
    </p>
    ${state.user?.waGroupOpt ? `<p><a class="btn btn-yellow" target="_blank" href="${c.whatsappGroup}">${tr('waJoin')}</a></p>` : ''}
    <p class="muted">${tr('hours')}</p>
    <p class="alert">${tr('payOnly')}</p>
    <div class="kpis">
      <div class="kpi"><span>M-Pesa</span><b>${c.payments.mpesa.number}</b><button class="btn btn-line" data-copy="${c.payments.mpesa.digits}">${tr('copy')}</button></div>
      <div class="kpi"><span>e-Mola</span><b>${c.payments.emola.number}</b><button class="btn btn-line" data-copy="${c.payments.emola.digits}">${tr('copy')}</button></div>
      <div class="kpi"><span>POS</span><b>${tr('pos')}</b></div>
    </div>
  </div></section>`;
}

function dock() {
  const n = state.cart.reduce((s, l) => s + l.qty, 0);
  return `<div class="dock">
    <button class="btn btn-yellow" data-open="cart">${tr('cart')} · ${n} · ${money(cartTotal())}</button>
    <button class="btn btn-cyan" data-open="call">${tr('callWaiter')}</button>
  </div>`;
}

function cartSheet() {
  const lines = state.cart.map((l, i) => `<div class="row" style="border-bottom:1px solid var(--line);padding:.4rem 0">
    <div><b>${l.name}</b><div class="muted">${l.qty} × ${money(l.unit)} ${l.doneness!=null? '· '+donenessLabel(l.doneness):''}</div></div>
    <div><b>${money(l.lineTotal)}</b><br><button data-rm="${i}">×</button></div>
  </div>`).join('') || `<p>${tr('emptyCart')}</p>`;
  return `<div class="modal" id="cartModal"><div class="sheet">
    <h3>${tr('cart')}</h3>
    ${lines}
    <p class="row"><span>${tr('total')}</span><b>${money(cartTotal())}</b></p>
    <p class="muted">${tr('noFx')}</p>
    ${!state.user ? `<p class="alert">${tr('needLogin')}</p><a class="btn btn-cyan" href="#/conta">${tr('login')}</a>` :
      !state.user.emailVerified ? `<p class="alert">${tr('needLogin')}</p>` :
      `<button class="btn btn-cyan btn-block" id="place">${tr('checkout')}</button>`}
    <button class="btn btn-line" data-close>OK</button>
  </div></div>`;
}

function itemSheet(m) {
  const extras = [...(m.extras || []), ...(state.catalog.extras || [])];
  return `<div class="modal" id="itemModal"><div class="sheet">
    <h3>${loc(m, state.lang)}</h3>
    <p class="muted">${loc(m.desc, state.lang)}</p>
    <p class="price">${money(m.price)}</p>
    ${m.doneness ? `<label>${tr('doneness')} (<span id="dpct">60</span>%)
      <input class="range" id="doneness" type="range" min="0" max="100" value="60">
      <small id="dlab">${donenessLabel(60)}</small>
      <p class="muted">${tr('donenessHint')}</p></label>` : ''}
    ${(m.details||[]).map((d) => `<label>${loc(d, state.lang)}<select data-detail="${d.id}">${(d.options||[]).map((o,i)=>`<option value="${i}">${loc(o, state.lang)}</option>`).join('')}</select></label>`).join('')}
    <div>${extras.map((e)=>`<label class="row"><span>${loc(e, state.lang)} · ${money(e.price)}</span><input type="checkbox" data-ex="${e.id}"></label>`).join('')}</div>
    <label>${tr('qty')}<input id="qty" type="number" min="1" max="20" value="1"></label>
    <button class="btn btn-cyan" id="addConfirm" data-id="${m.id}">${tr('add')}</button>
    <button class="btn btn-line" data-close>OK</button>
  </div></div>`;
}

function callSheet() {
  const reasons = state.catalog.reasons || [];
  return `<div class="modal" id="callModal"><div class="sheet">
    <h3>${tr('callWaiter')}</h3>
    <p>${tr('table')} ${state.table || '—'}</p>
    <label>${tr('reason')}<select id="reason">${reasons.map((r)=>`<option value="${r.id}">${loc(r, state.lang)}</option>`).join('')}</select></label>
    <label>${tr('note')}<input id="callNote"></label>
    <button class="btn btn-dark" id="sendCall">${tr('sendCall')}</button>
    <button class="btn btn-line" data-close>OK</button>
  </div></div>`;
}

function paySheet(order) {
  const c = state.catalog.club;
  return `<div class="modal" id="payModal"><div class="sheet">
    <h3>${tr('pay')} ${order.code}</h3>
    <p class="alert">${tr('payOnly')}</p>
    <p class="muted">${tr('noFx')}</p>
    ${['mpesa','emola'].map((k)=>`<div class="kpi"><b>${tr(k)}</b><p>${c.payments[k].number}</p>
      <button class="btn btn-line" data-copy="${c.payments[k].digits}">${tr('copy')}</button>
      <button class="btn btn-cyan" data-pay="${k}" data-oid="${order.id}">${tr('declared')}</button></div>`).join('')}
    <div class="kpi"><b>${tr('pos')}</b>
      <button class="btn btn-cyan" data-pay="pos" data-oid="${order.id}">${tr('declared')}</button></div>
    <button class="btn btn-line" data-close>OK</button>
  </div></div>`;
}

function staffView() {
  if (state.staff?.waiter) return `<section class="section"><div class="wrap" id="staffBoard"><p>…</p></div></section>`;
  const waiters = state.adminWaiters || [];
  return `<section class="section"><div class="wrap">
    <h2>${tr('staffPin')}</h2>
    <p class="muted">${tr('chooseWaiter')}</p>
    <div class="cards" id="waiterPick"></div>
  </div></section>`;
}

function adminView() {
  if (!state.user || state.user.role !== 'admin') {
    return `<section class="section"><div class="wrap"><h2>${tr('admin')}</h2>
      <form class="card" id="loginForm"><label>${tr('email')}<input name="email" type="email" autocomplete="username"></label>
      <label>${tr('password')}<input name="password" type="password" autocomplete="current-password"></label>
      <label class="row"><span>${tr('remember')}</span><input type="checkbox" name="remember" checked></label>
      <button class="btn btn-dark" type="submit">${tr('login')}</button></form></div></section>`;
  }
  return `<section class="section"><div class="wrap" id="adminRoot"><p>…</p></div></section>`;
}

function render() {
  const root = $('#app');
  let body = '';
  if (state.view === 'mesas') body = mesasView();
  else if (state.view === 'conta') body = contaView();
  else if (state.view === 'contacto') body = contactView();
  else if (state.view === 'staff') body = staffView();
  else if (state.view === 'admin') body = adminView();
  else body = menuView();
  root.innerHTML = header() + body + dock() + `<footer class="wrap"><p>Aqua Club · ${state.catalog?.club.legal || ''} · ${state.catalog?.club.phoneDisplay || ''}</p></footer>`;
  bind();
  if (state.view === 'conta' && state.user) loadMine();
  if (state.view === 'staff') loadStaff();
  if (state.view === 'admin' && state.user?.role === 'admin') loadAdmin();
}

function bind() {
  const pick = $('.langpick');
  const tog = $('[data-lang-toggle]');
  if (tog && pick) {
    tog.onclick = (e) => {
      e.stopPropagation();
      const open = pick.classList.toggle('open');
      tog.setAttribute('aria-expanded', String(open));
    };
    document.addEventListener('click', () => pick.classList.remove('open'), { once: true });
  }
  $$('[data-lang]').forEach((b) => b.onclick = () => setLang(b.dataset.lang));
  $$('.nav a').forEach((a) => a.onclick = (e) => { e.preventDefault(); go(a.getAttribute('href').replace('#/', '')); });
  const q = $('#q'); if (q) q.oninput = () => { state.q = q.value; paintCards(); };
  $$('[data-cat]').forEach((b) => b.onclick = () => { state.cat = b.dataset.cat; render(); });
  $$('[data-add]').forEach((b) => b.onclick = () => openItem(b.dataset.add));
  $$('[data-table]').forEach((b) => b.onclick = () => selectTable(Number(b.dataset.table)));
  $$('[data-ful]').forEach((b) => b.onclick = () => { state.fulfillment = b.dataset.ful; localStorage.setItem('aqua_ful', state.fulfillment); render(); });
  $$('[data-copy]').forEach((b) => b.onclick = () => copyText(b.dataset.copy));
  $$('[data-open="cart"]').forEach((b) => b.onclick = () => showHtml(cartSheet()));
  $$('[data-open="call"]').forEach((b) => b.onclick = () => showHtml(callSheet()));
  const lf = $('#loginForm'); if (lf) lf.onsubmit = onLogin;
  const rf = $('#regForm'); if (rf) rf.onsubmit = onRegister;
  const lo = $('#logout'); if (lo) lo.onclick = onLogout;
  const dv = $('#doVerify'); if (dv) dv.onclick = onVerify;
  const rs = $('#doResend'); if (rs) rs.onclick = onResend;
}

function showHtml(html) {
  $('.modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = $('.modal');
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.dataset.close != null) modal.remove();
    if (e.target.dataset.rm != null) { state.cart.splice(Number(e.target.dataset.rm), 1); saveCart(); modal.remove(); showHtml(cartSheet()); render(); }
    if (e.target.id === 'place') placeOrder();
    if (e.target.id === 'sendCall') sendCall();
    if (e.target.id === 'addConfirm') confirmAdd(e.target.dataset.id);
    if (e.target.dataset.pay) declarePay(Number(e.target.dataset.oid), e.target.dataset.pay);
    if (e.target.dataset.copy) copyText(e.target.dataset.copy);
  });
  const range = $('#doneness');
  if (range) range.oninput = () => { $('#dpct').textContent = range.value; $('#dlab').textContent = donenessLabel(Number(range.value)); };
}

function openItem(id) {
  const m = state.catalog.menu.find((x) => x.id === id);
  showHtml(itemSheet(m));
}

function confirmAdd(id) {
  const m = state.catalog.menu.find((x) => x.id === id);
  const qty = Number($('#qty')?.value || 1);
  const extras = $$('[data-ex]:checked').map((x) => x.dataset.ex);
  const doneness = m.doneness ? Number($('#doneness').value) : null;
  const details = {};
  $$('[data-detail]').forEach((s) => { details[s.dataset.detail] = s.value; });
  let extraSum = 0;
  extras.forEach((ex) => {
    const def = [...(m.extras||[]), ...state.catalog.extras].find((e) => e.id === ex);
    if (def) extraSum += def.price;
  });
  const unit = m.price + extraSum;
  state.cart.push({ itemId: m.id, name: loc(m, state.lang), qty, extras, doneness, details, unit, lineTotal: unit * qty });
  saveCart();
  $('.modal')?.remove();
  toast(tr('add'));
  render();
}

async function selectTable(n) {
  state.table = n;
  localStorage.setItem('aqua_table', String(n));
  const r = await api('/waiter-for-table/' + n);
  state.waiter = r.waiter;
  render();
}

async function placeOrder() {
  try {
    const order = (await api('/orders', { method: 'POST', body: {
      fulfillment: state.fulfillment,
      tableNumber: state.table,
      currency: 'MT',
      lines: state.cart.map((l) => ({ itemId: l.itemId, qty: l.qty, extras: l.extras, doneness: l.doneness, details: l.details }))
    } })).order;
    state.cart = []; saveCart();
    $('.modal')?.remove();
    render();
    toast(order.code);
    showHtml(paySheet(order));
  } catch (e) { toast(tr('err.' + e.code) || e.code); if (e.code === 'auth' || e.code === 'verify') go('conta'); }
}

async function declarePay(id, method) {
  try {
    const payTo = method === 'pos' ? null : state.catalog.club.payments[method].digits;
    await api('/orders/' + id + '/pay', { method: 'POST', body: { method, currency: 'MT', payTo } });
    toast(tr('declared'));
    $('.modal')?.remove();
    if (state.view === 'conta') loadMine();
  } catch (e) { toast(tr('err.' + (e.code || '')) || e.code); }
}

async function sendCall() {
  try {
    await api('/calls', { method: 'POST', body: { tableNumber: state.table, reason: $('#reason').value, note: $('#callNote').value } });
    toast(tr('sendCall'));
    $('.modal')?.remove();
  } catch (e) { toast(tr('err.' + (e.code || '')) || e.code); }
}

async function onLogin(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const r = await api('/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password'), remember: fd.get('remember') === 'on' } });
    state.user = r.user;
    render();
  } catch (err) { const box = $('#loginErr'); if (box) box.textContent = tr('err.' + err.code); }
}

async function onRegister(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const r = await api('/auth/register', { method: 'POST', body: {
      name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone'),
      password: fd.get('password'), confirm: fd.get('confirm'),
      remember: fd.get('remember') === 'on', waGroupOpt: fd.get('waGroup') === 'yes'
    } });
    state.user = r.user;
    if (r.demoCode) { state.lastDemoCode = r.demoCode; localStorage.setItem('aqua_demo_code', r.demoCode); }
    render();
  } catch (err) { $('#regErr').textContent = tr('err.' + err.code); }
}

async function onVerify() {
  try {
    const r = await api('/auth/verify', { method: 'POST', body: { code: $('#vcode').value } });
    state.user = r.user;
    toast(tr('verifyBtn'));
    render();
  } catch (e) { toast(tr('err.' + e.code)); }
}

async function onResend() {
  const r = await api('/auth/resend', { method: 'POST', body: {} });
  if (r.demoCode) { state.lastDemoCode = r.demoCode; localStorage.setItem('aqua_demo_code', r.demoCode); }
  render();
}

async function onLogout() {
  await api('/auth/logout', { method: 'POST', body: {} });
  state.user = null;
  render();
}

async function loadMine() {
  try {
    const box = $('#mine');
    if (!box) return;
    const r = await api('/orders/mine');
    box.innerHTML = `<h3>${tr('stats')}</h3>
      <div class="kpis">
        <div class="kpi"><span>${tr('ordersN')}</span><b>${r.stats.orders}</b></div>
        <div class="kpi"><span>${tr('spent')}</span><b>${money(r.stats.spent)}</b></div>
        <div class="kpi"><span>${tr('open')}</span><b>${r.stats.open}</b></div>
        <div class="kpi"><span>${tr('paid')}</span><b>${r.stats.paid}</b></div>
      </div>
      <p>
        <button class="chip" data-f="">${tr('all')}</button>
        <button class="chip" data-f="unpaid">${tr('unpaid')}</button>
        <button class="chip" data-f="paid">${tr('paid')}</button>
      </p>
      <div id="olist">${orderList(r.orders)}</div>`;
    $$('[data-f]').forEach((b) => b.onclick = async () => {
      const n = await api('/orders/mine' + (b.dataset.f ? '?pay=' + b.dataset.f : ''));
      $('#olist').innerHTML = orderList(n.orders);
      bindOrderPay();
    });
    bindOrderPay();
  } catch {}
}

function mapsLink(o) {
  if (!o?.navUrl && !o?.mapsUrl) return '';
  return `<a href="${o.navUrl || o.mapsUrl}" target="_blank" rel="noopener">Google Maps</a>`;
}
function orderList(orders) {
  return `<table class="table"><thead><tr><th>${tr('code')}</th><th>${tr('table')}</th><th>${tr('status')}</th><th>${tr('total')}</th><th></th></tr></thead><tbody>
    ${orders.map((o) => `<tr><td><b>${o.code}</b><div class="muted">${o.created_at}<br>${o.customer_name || ''} ${o.customer_phone || ''}<br>${o.placed_by} ${o.waiter?.name || ''}</div></td>
      <td>${o.place_label || (o.table_number ? 'Mesa ' + o.table_number : o.fulfillment || '—')}<div class="muted">${mapsLink(o)}</div></td>
      <td><span class="pill">${stLab(o.status)}</span> <span class="pill ${o.payment_status}">${payLab(o.payment_status)}</span></td>
      <td>${money(o.total)}</td>
      <td>${o.payment_status!=='paid'?`<button class="btn btn-cyan" data-payopen="${o.id}">${tr('pay')}</button>`:''}</td></tr>`).join('')}
  </tbody></table>`;
}

function bindOrderPay() {
  $$('[data-payopen]').forEach((b) => b.onclick = async () => {
    const r = await api('/orders/mine');
    const o = r.orders.find((x) => x.id === Number(b.dataset.payopen));
    if (o) showHtml(paySheet(o));
  });
}

async function loadStaff() {
  if (!state.staff?.waiter) {
    const tables = await api('/tables');
    const ids = [...new Set(tables.shifts.map((s) => s.waiter_id))];
    $('#waiterPick').innerHTML = tables.shifts.map((s) => `<article class="card">
      <img src="${s.waiter_photo}" alt="" style="width:64px;height:64px;border-radius:50%">
      <h3>${s.waiter_name}</h3>
      <p class="muted">${tr('table')} ${s.table_from}–${s.table_to}</p>
      <label>${tr('pin')}<input data-pin="${s.waiter_id}" type="password"></label>
      <button class="btn btn-cyan" data-openstaff="${s.waiter_id}">${tr('openBoard')}</button>
    </article>`).join('');
    $$('[data-openstaff]').forEach((b) => b.onclick = async () => {
      try {
        const pin = $(`[data-pin="${b.dataset.openstaff}"]`).value;
        const r = await api('/staff/open', { method: 'POST', body: { waiterId: Number(b.dataset.openstaff), pin } });
        state.staff = r; sessionStorage.setItem('aqua_staff', JSON.stringify(r));
        render();
      } catch (e) { toast(tr('err.pin')); }
    });
    return;
  }
  const res = await fetch('/api/staff/board', { headers: { Authorization: 'Bearer ' + state.staff.token } });
  if (!res.ok) { state.staff = null; sessionStorage.removeItem('aqua_staff'); render(); return; }
  const board = await res.json();
  const root = $('#staffBoard');
  if (!root) return;
  root.innerHTML = `<div class="waiter"><img src="${board.waiter.photo}" alt=""><div>
    <h3>${board.waiter.name}</h3><p>${tr('table')} ${board.shift?.table_from}–${board.shift?.table_to}</p>
    <button class="btn btn-line" id="staffOut">${tr('logout')}</button></div></div>
    <h3>Chamados (todos, em tempo real)</h3>
    <div class="call-live">${(board.calls || []).map((c) => `<div class="call-row ${c.status}">
      <b>${tr('table')} ${c.table_number}</b>
      <span>${c.reason} · ${c.customer_name || ''} ${c.customer_phone || ''} · ${c.status}</span>
      <span class="timer" data-from="${c.created_at}">${elapsed(c.created_at)}</span>
      ${c.status==='pending'?`<button class="btn btn-cyan" data-acc="${c.id}">Atender</button>`:''}
      ${c.status==='accepted'?`<button class="btn btn-dark" data-cls="${c.id}">Concluir</button>`:''}
    </div>`).join('') || '<p>—</p>'}</div>
    <h3>Pedidos em tempo real</h3>
    <table class="table"><thead><tr><th>Código</th><th>Cliente</th><th>Estado</th><th>Total</th><th></th></tr></thead><tbody>
    ${(board.orders || []).map((o) => `<tr>
      <td><b>${o.code}</b><div class="muted">${(o.items||[]).map((i)=>i.qty+'× '+i.name).join(', ')}</div></td>
      <td>${o.customer_name || '—'}<div class="muted">${o.place_label || (o.table_number ? 'Mesa '+o.table_number : '')} · ${o.customer_phone || ''}</div></td>
      <td><span class="pill">${stLab(o.status)}</span> <span class="pill ${o.payment_status}">${payLab(o.payment_status)}${o.payment_method ? ' · ' + o.payment_method : ''}${o.payment_ref ? ' · ' + o.payment_ref : ''}</span></td>
      <td>${money(o.total)}</td>
      <td class="ops">
        ${o.payment_status==='declared'?`<button class="btn btn-ok" data-sconf="${o.id}">Confirmar → A preparar</button>`:''}
        ${o.status!=='preparing' && o.status!=='ready' && o.status!=='on_the_way' && o.status!=='delivered'?`<button class="btn btn-cyan" data-sprep="${o.id}">A preparar</button>`:''}
        ${o.status!=='ready' && o.status!=='on_the_way' && o.status!=='delivered'?`<button class="btn btn-line" data-sready="${o.id}">Pedido pronto</button>`:''}
        ${(o.status==='ready'||o.status==='on_the_way')&&!o.driver_ok?`<button class="btn btn-ok" data-sdrv="${o.id}">Saiu para entrega</button>`:''}
      </td></tr>`).join('') || '<tr><td colspan="5">Sem pedidos ainda.</td></tr>'}
    </tbody></table>
    <h3>${tr('cart')}</h3>
    <form id="staffOrder" class="card">
      <label>${tr('table')}<select name="table">${(board.tables||[]).map((t)=>`<option>${t.number}</option>`).join('')}</select></label>
      <p class="muted">${tr('quick')}</p>
      <div id="staffCart"></div>
      <button class="btn btn-cyan">${tr('checkout')}</button>
    </form>
    ${orderList(board.orders || [])}`;
  $('#staffOut').onclick = () => { state.staff = null; sessionStorage.removeItem('aqua_staff'); render(); };
  $$('[data-acc]').forEach((b) => b.onclick = async () => { await fetch('/api/staff/calls/'+b.dataset.acc+'/accept', { method:'POST', headers:{ Authorization:'Bearer '+state.staff.token }}); loadStaff(); });
  $$('[data-cls]').forEach((b) => b.onclick = async () => { await fetch('/api/staff/calls/'+b.dataset.cls+'/close', { method:'POST', headers:{ Authorization:'Bearer '+state.staff.token }}); loadStaff(); });
  const staffHead = { Authorization: 'Bearer ' + state.staff.token, 'Content-Type': 'application/json' };
  $$('[data-sconf]').forEach((b) => b.onclick = async () => { await fetch('/api/staff/orders/'+b.dataset.sconf, { method:'PATCH', headers: staffHead, body: JSON.stringify({ payment_status:'paid' }) }); loadStaff(); });
  $$('[data-sprep]').forEach((b) => b.onclick = async () => { await fetch('/api/staff/orders/'+b.dataset.sprep, { method:'PATCH', headers: staffHead, body: JSON.stringify({ status:'preparing' }) }); loadStaff(); });
  $$('[data-sready]').forEach((b) => b.onclick = async () => { await fetch('/api/staff/orders/'+b.dataset.sready, { method:'PATCH', headers: staffHead, body: JSON.stringify({ status:'ready' }) }); loadStaff(); });
  $$('[data-sdrv]').forEach((b) => b.onclick = async () => { await fetch('/api/staff/orders/'+b.dataset.sdrv, { method:'PATCH', headers: staffHead, body: JSON.stringify({ driver_ok:true, status:'on_the_way' }) }); loadStaff(); });
  const staffCart = [];
  const box = $('#staffCart');
  box.innerHTML = (state.catalog.menu.filter((m)=>m.quick).slice(0,12).map((m)=>`<button type="button" class="chip" data-sadd="${m.id}">${loc(m,state.lang)}</button>`).join(''));
  $$('[data-sadd]').forEach((b) => b.onclick = () => {
    const m = state.catalog.menu.find((x)=>x.id===b.dataset.sadd);
    staffCart.push({ itemId: m.id, qty: 1, extras: [], doneness: m.doneness ? 60 : null, details: {} });
    toast(loc(m, state.lang));
  });
  $('#staffOrder').onsubmit = async (e) => {
    e.preventDefault();
    if (!staffCart.length) { toast(tr('emptyCart')); return; }
    const r = await fetch('/api/staff/orders', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+state.staff.token }, body: JSON.stringify({ tableNumber: Number(e.target.table.value), lines: staffCart }) });
    if (!r.ok) { toast(tr('err.table')); return; }
    staffCart.length = 0; loadStaff();
  };
}

async function loadAdmin() {
  const d = await api('/admin/overview');
  const el = $('#adminRoot');
  if (!el) return;
  const k = d.kpis;
  el.innerHTML = `<div class="dash">
    <h2>${tr('admin')} · ${d.date}</h2>
    <div class="dash-hero">
      <div class="dcard"><span>Receita confirmada</span><b>${money(k.revenue)}</b><small>hoje ${money(k.todayPaid || 0)}</small></div>
      <div class="dcard"><span>Por receber</span><b>${money(k.unpaidSum || 0)}</b><small>${k.unpaid} contas abertas</small></div>
      <div class="dcard"><span>Pedidos</span><b>${k.orders}</b><small>${k.inReview || 0} em análise · ${k.preparing || 0} a preparar</small></div>
      <div class="dcard"><span>Chamados</span><b>${k.pendingCalls}</b><small>${k.liveCalls || 0} a caminho · espera média ${d.callWait?.avg_sec ? Math.round(d.callWait.avg_sec) + 's' : '—'}</small></div>
      <div class="dcard light"><span>Mesas</span><b>${k.occupied}/${k.occupied + k.free + k.reserved}</b><small>${k.free} livres · ${k.reserved} reservadas</small></div>
    </div>
    <p class="cta">
      <a class="btn btn-line" href="/api/admin/export.csv">${tr('exportCsv')}</a>
      <a class="btn btn-line" href="/api/admin/export.xls">${tr('exportXls')}</a>
      <a class="btn btn-line" href="/api/admin/export.pdf">${tr('exportPdf')}</a>
    </p>
    <div class="charts">
      <div class="chart-box"><h3>Entradas 7 dias</h3><div id="chartDays"></div></div>
      <div class="chart-box"><h3>Pagamentos</h3><div id="chartPay"></div></div>
      <div class="chart-box pale"><h3>Pedidos por hora (24 h)</h3><div id="chartHour"></div></div>
      <div class="chart-box pale"><h3>Mais pedidos</h3><div id="chartCat"></div></div>
    </div>
    <h3>Chamados ao vivo</h3>
    <div class="call-live">${(d.calls || []).filter((c) => c.status === 'pending' || c.status === 'accepted').map((c) => `
      <div class="call-row ${c.status}">
        <b>${tr('table')} ${c.table_number}</b>
        <span>${c.reason} · ${c.customer_name || c.note || '—'}</span>
        <span class="timer" data-from="${c.created_at}">${elapsed(c.created_at)}</span>
        <span>${c.status === 'pending' ? 'À espera' : 'Aceite'}</span>
      </div>`).join('') || '<p class="muted">Nenhum chamado neste momento.</p>'}
    </div>
    <h3>${tr('alerts')}</h3>
    ${d.alerts.map((a)=>`<div class="alert">${a.message} <small>${a.created_at}</small></div>`).join('') || '—'}
    <h3>${tr('nav.tables')}</h3>
    <div class="tables">${d.tables.map((tb)=>`<button class="tbl ${tb.status}" data-at="${tb.number}">${tb.number}</button>`).join('')}</div>
    <p class="cta"><button class="btn btn-line" data-st="free">${tr('setFree')}</button>
      <button class="btn btn-yellow" data-st="reserved">${tr('setReserved')}</button>
      <button class="btn btn-dark" data-st="occupied">${tr('setOccupied')}</button></p>
    <h3>Transferências a confirmar</h3>
    ${(d.recent || []).filter((o) => o.payment_status === 'declared').length
      ? `<table class="table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Método</th><th>Total</th><th></th></tr></thead><tbody>
      ${d.recent.filter((o) => o.payment_status === 'declared').map((o) => `<tr>
        <td><b>${o.code}</b><div class="muted">${(o.items||[]).map((i)=>i.qty+'× '+i.name).join(', ')}</div></td>
        <td>${o.customer_name || '—'}<div class="muted">${o.customer_phone || ''}</div></td>
        <td>${o.payment_method === 'emola' ? 'e-Mola 87 452 1897' : o.payment_method === 'mpesa' ? 'M-Pesa 84 596 1528' : (o.payment_method || '—')}<div class="muted">ref. ${o.payment_ref || o.code} · Siddique Faizy Rego</div></td>
        <td>${money(o.total)}</td>
        <td class="ops">
          <button class="btn btn-ok" data-conf="${o.id}">Confirmar → A preparar</button>
          <button class="btn btn-yellow" data-noconf="${o.id}">Não confirmado</button>
        </td></tr>`).join('')}
      </tbody></table>`
      : '<p class="muted">Nenhuma transferência à espera de confirmação.</p>'}
    <h3>Pedidos — gestão em tempo real</h3>
    <table class="table"><thead><tr><th>${tr('code')}</th><th>${tr('customer')}</th><th>Local</th><th>${tr('status')}</th><th>${tr('total')}</th><th></th></tr></thead><tbody>
    ${d.recent.map((o)=>`<tr><td>${o.code}<div class="muted">${(o.items||[]).map((i)=>i.qty+'× '+i.name).join(', ')}</div></td>
      <td>${o.customer_name || o.customer?.name || '—'}<div class="muted">${o.customer_phone || o.customer?.phone || ''}</div></td>
      <td>${o.place_label || (o.table_number ? 'Mesa ' + o.table_number : o.fulfillment)}${o.navUrl ? `<div class="muted"><a href="${o.navUrl}" target="_blank" rel="noopener">Google Maps</a></div>` : ''}</td>
      <td><span class="pill">${stLab(o.status)}</span> <span class="pill ${o.payment_status}">${payLab(o.payment_status)}${o.payment_ref && o.payment_status!=='unpaid' ? ' · ' + o.payment_ref : ''}</span></td>
      <td>${money(o.total)}</td>
      <td class="ops">
        ${o.payment_status==='declared'?`<button class="btn btn-ok" data-conf="${o.id}">Confirmar transferência</button>`:''}
        ${o.payment_status==='unpaid'?`<button class="btn btn-ok" data-conf="${o.id}">Marcar pago</button>`:''}
        ${o.status!=='preparing' && o.status!=='ready' && o.status!=='on_the_way' && o.status!=='delivered'?`<button class="btn btn-cyan" data-prep="${o.id}">A preparar</button>`:''}
        <button class="btn btn-yellow" data-noconf="${o.id}">Sem confirmação</button>
        ${o.status!=='ready' && o.status!=='on_the_way' && o.status!=='delivered'?`<button class="btn btn-line" data-ready="${o.id}">Pedido pronto</button>`:''}
        ${(o.status==='ready'||o.status==='on_the_way')&&!o.driver_ok?`<button class="btn btn-ok" data-drv="${o.id}">Saiu para entrega</button>`:''}
      </td></tr>`).join('')}
    </tbody></table>
    <h3>${tr('assign')}</h3>
    ${d.waiters.map((w)=>{ const sh=d.shifts.find((s)=>s.waiter_id===w.id); return `<form class="row" data-shift="${w.id}" style="margin:.4rem 0;flex-wrap:wrap">
      <img src="${w.photo}" width="36" height="36" style="border-radius:50%" alt="">
      <b>${w.name}</b>
      <input name="from" type="number" min="1" max="40" value="${sh?.table_from??''}" placeholder="${tr('from')}" style="width:70px">
      <input name="to" type="number" min="1" max="40" value="${sh?.table_to??''}" placeholder="${tr('to')}" style="width:70px">
      <button class="btn btn-cyan">${tr('save')}</button></form>`; }).join('')}
    <h3>${tr('newWaiter')}</h3>
    <form id="newW" class="card"><label>${tr('name')}<input name="name" required></label>
      <label>${tr('phone')}<input name="phone" required></label>
      <label>PIN<input name="pin" required></label>
      <label>Bio<input name="bio"></label>
      <button class="btn btn-yellow">${tr('save')}</button></form>
    <h3>Desempenho dos garçons</h3>
    <table class="table">${d.waiterStats.map((w)=>`<tr><td>${w.name}</td><td>${w.orders} ${tr('ordersN')}</td><td>${money(w.revenue)}</td><td>${w.calls} chamados</td><td>${w.avg_sec ? Math.round(w.avg_sec)+'s' : '—'}</td></tr>`).join('')}</table>
  </div>`;

  let selected = null;
  $$('[data-at]').forEach((b) => b.onclick = () => { selected = Number(b.dataset.at); $$('[data-at]').forEach((x)=>x.classList.toggle('on', x===b)); });
  $$('[data-st]').forEach((b) => b.onclick = async () => { if (!selected) return; await api('/admin/tables/'+selected, { method:'PATCH', body:{ status: b.dataset.st }}); loadAdmin(); });
  $$('[data-conf]').forEach((b) => b.onclick = async () => { await api('/admin/orders/'+b.dataset.conf, { method:'PATCH', body:{ payment_status:'paid' }}); loadAdmin(); });
  $$('[data-noconf]').forEach((b) => b.onclick = async () => { await api('/admin/orders/'+b.dataset.noconf, { method:'PATCH', body:{ payment_status:'no_confirm' }}); loadAdmin(); });
  $$('[data-prep]').forEach((b) => b.onclick = async () => { await api('/admin/orders/'+b.dataset.prep, { method:'PATCH', body:{ status:'preparing' }}); loadAdmin(); });
  $$('[data-ready]').forEach((b) => b.onclick = async () => { await api('/admin/orders/'+b.dataset.ready, { method:'PATCH', body:{ status:'ready' }}); loadAdmin(); });
  $$('[data-drv]').forEach((b) => b.onclick = async () => { await api('/admin/orders/'+b.dataset.drv, { method:'PATCH', body:{ driver_ok:true, status:'on_the_way' }}); loadAdmin(); });
  $$('[data-shift]').forEach((f) => f.onsubmit = async (e) => {
    e.preventDefault();
    await api('/admin/shifts', { method:'POST', body:{ waiterId: Number(f.dataset.shift), tableFrom: Number(f.from.value), tableTo: Number(f.to.value) }});
    loadAdmin();
  });
  $('#newW').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api('/admin/waiters', { method:'POST', body: Object.fromEntries(fd.entries()) });
    loadAdmin();
  };
  drawDays(d.byDay || []);
  drawPay(d.payMix || []);
  drawHour(d.byHour || []);
  drawCat(d.byCat || []);
}

function svgWrap(html) { return `<svg viewBox="0 0 400 170" preserveAspectRatio="none">${html}</svg>`; }
function drawDays(rows) {
  const box = $('#chartDays'); if (!box) return;
  const max = Math.max(1, ...rows.map((r) => Number(r.t) || 0));
  const n = Math.max(rows.length, 1);
  const bars = rows.map((r, i) => {
    const h = (Number(r.t) / max) * 120;
    const x = 20 + i * (360 / n);
    const w = Math.max(8, 360 / n - 8);
    return `<rect x="${x}" y="${140 - h}" width="${w}" height="${h}" rx="4" fill="#00A8FF"/><text x="${x + w / 2}" y="158" text-anchor="middle" fill="#9ec9e8" font-size="9">${String(r.d || '').slice(5)}</text>`;
  }).join('');
  box.innerHTML = svgWrap(`<text x="8" y="16" fill="#9ec9e8" font-size="11">MT</text>${bars}`);
}
function drawPay(rows) {
  const box = $('#chartPay'); if (!box) return;
  const total = Math.max(1, rows.reduce((s, r) => s + Number(r.t || r.c || 0), 0));
  const colors = { paid: '#3ddc97', unpaid: '#ffb703', declared: '#00A8FF', rejected: '#ff6b6b' };
  let a = 0;
  const cx = 130, cy = 85, R = 58, r = 34;
  const arcs = rows.map((row) => {
    const v = Number(row.t || row.c || 0) / total;
    const b = a + v * Math.PI * 2;
    const large = v > 0.5 ? 1 : 0;
    const p = (ang, rad) => [cx + Math.cos(ang - Math.PI / 2) * rad, cy + Math.sin(ang - Math.PI / 2) * rad];
    const [x1, y1] = p(a, R), [x2, y2] = p(b, R), [x3, y3] = p(b, r), [x4, y4] = p(a, r);
    const d = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`;
    a = b;
    return `<path d="${d}" fill="${colors[row.k] || '#7ec8e3'}"/>`;
  }).join('');
  const legend = rows.map((row, i) => `<text x="230" y="${40 + i * 22}" fill="#d7ecff" font-size="12">${payLab(row.k)} · ${money(row.t)}</text>`).join('');
  box.innerHTML = svgWrap(`${arcs}${legend}`);
}
function drawHour(rows) {
  const box = $('#chartHour'); if (!box) return;
  const max = Math.max(1, ...rows.map((r) => Number(r.c) || 0), 1);
  const pts = Array.from({ length: 24 }, (_, h) => {
    const row = rows.find((r) => Number(r.h) === h);
    const v = row ? Number(row.c) : 0;
    return [20 + h * (360 / 23), 140 - (v / max) * 110];
  });
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
  const area = `${line} L ${pts[pts.length - 1][0]} 150 L 20 150 Z`;
  box.innerHTML = svgWrap(`<path d="${area}" fill="rgba(0,168,255,.25)"/><path d="${line}" fill="none" stroke="#00A8FF" stroke-width="2"/>`);
}
function drawCat(rows) {
  const box = $('#chartCat'); if (!box) return;
  const max = Math.max(1, ...rows.map((r) => Number(r.qty) || 0));
  box.innerHTML = `<div>${rows.slice(0, 8).map((r) => `<div class="row"><span>${r.name}</span><b>${r.qty}</b></div>
    <div style="height:8px;background:#E6F6FF;border-radius:99px;margin:.15rem 0 .55rem"><i style="display:block;height:8px;width:${(Number(r.qty)/max)*100}%;background:#00A8FF;border-radius:99px"></i></div>`).join('') || '—'}</div>`;
}

function connectSocket() {
  if (!window.io) return;
  state.socket = window.io({ transports: ['websocket', 'polling'] });
  state.socket.emit('join', 'ops');
  state.socket.on('order:new', () => { if (state.view==='admin') loadAdmin(); if (state.view==='staff' && state.staff) loadStaff(); });
  state.socket.on('order:updated', () => { if (state.view==='admin') loadAdmin(); if (state.view==='staff' && state.staff) loadStaff(); if (state.view==='conta') loadMine(); });
  state.socket.on('call:new', (c) => { toast(`${tr('callWaiter')} ${tr('table')} ${c.table_number}`); if (state.view==='admin') loadAdmin(); if (state.view==='staff') loadStaff(); });
  state.socket.on('call:updated', () => { if (state.view==='admin') loadAdmin(); if (state.view==='staff' && state.staff) loadStaff(); });
  state.socket.on('table:updated', () => { refreshTables(); if (state.view==='admin') loadAdmin(); });
  state.socket.on('alert:new', (a) => toast(a.type + ' · 30'));
  state.socket.on('waiter:notify', (n) => {
    if (state.staff?.waiter?.id === n.waiterId) toast(`${tr('table')} ${n.tableNumber} · ${n.type}`);
  });
}

async function refreshTables() {
  const r = await api('/tables');
  state.tables = r.tables;
  state.shifts = r.shifts;
  if (state.table) {
    const w = await api('/waiter-for-table/' + state.table);
    state.waiter = w.waiter;
  }
}

async function boot() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : state.lang;
  state.view = (location.hash.replace('#/', '') || 'menu');
  state.catalog = await api('/catalog');
  await refreshTables();
  try { state.user = (await api('/auth/me')).user; } catch {}
  connectSocket();
  render();
}

window.addEventListener('hashchange', () => { state.view = location.hash.replace('#/', '') || 'menu'; render(); });
boot();
