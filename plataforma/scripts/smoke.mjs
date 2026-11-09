/** Teste automático da API: auth, mesa, pedido, pagamento, código, chamado, admin. */
const BASE = process.env.BASE || 'http://127.0.0.1:5173';

async function req(path, { method = 'GET', body, cookie, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.getSetCookie?.() || [];
  const ck = set.map((s) => s.split(';')[0]).join('; ') || cookie;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, cookie: ck };
}

function assert(cond, msg) {
  if (!cond) throw new Error('FALHOU: ' + msg);
  console.log('  ok  ' + msg);
}

const phone = '84' + String(1000000 + Math.floor(Math.random() * 8000000)).slice(0, 7);

const h = await req('/api/health');
assert(h.status === 200 && h.data.ok, 'servidor vivo');

const cat = await req('/api/catalog');
assert(cat.data.menu.length > 80, 'menu da carta (' + cat.data.menu.length + ' itens)');
assert(cat.data.club.payments.mpesa.digits === '879501491', 'número M-Pesa oficial');
assert(cat.data.doneness.length === 6, 'escala de ponto da carne');

const tables = await req('/api/tables');
assert(tables.data.tables.length === 40, '40 mesas');
assert(tables.data.shifts.length === 10, '10 garçons escalados hoje');

const w = await req('/api/waiter-for-table/3');
assert(w.data.waiter?.name, 'garçom da mesa 3: ' + w.data.waiter.name);

const reg = await req('/api/auth/register', {
  method: 'POST',
  body: {
    name: 'Ana Teste', email: `ana${Date.now()}@aqua.test`, phone,
    password: 'Senha1234', confirm: 'Senha1234', waGroupOpt: true, remember: true
  }
});
assert(reg.status === 200 && reg.data.demoCode, 'registo + código de e-mail ' + reg.data.demoCode);
assert(reg.data.waGroup, 'convite do grupo WhatsApp');

const ver = await req('/api/auth/verify', { method: 'POST', body: { code: reg.data.demoCode }, cookie: reg.cookie });
assert(ver.status === 200 && ver.data.user.emailVerified, 'e-mail confirmado');

const badFx = await req('/api/orders', {
  method: 'POST', cookie: reg.cookie,
  body: { fulfillment: 'dine_in', tableNumber: 3, currency: 'USD', lines: [{ itemId: 'mojito', qty: 1 }] }
});
assert(badFx.status === 400 && badFx.data.error === 'currency', 'rejeita câmbio / USD');

const order = await req('/api/orders', {
  method: 'POST', cookie: reg.cookie,
  body: {
    fulfillment: 'dine_in', tableNumber: 3, currency: 'MT',
    lines: [{ itemId: 'bife-pt', qty: 1, doneness: 70, extras: ['ovo'] }]
  }
});
assert(order.status === 200 && /^AQ-\d{4}$/.test(order.data.order.code), 'pedido ' + order.data.order.code);
assert(order.data.order.waiter?.name, 'pedido associado ao garçom');

const wrongPay = await req('/api/orders/' + order.data.order.id + '/pay', {
  method: 'POST', cookie: reg.cookie,
  body: { method: 'mpesa', currency: 'MT', payTo: '840000000' }
});
assert(wrongPay.status === 400 && wrongPay.data.error === 'pay_to', 'rejeita número que não está no site');

const pay = await req('/api/orders/' + order.data.order.id + '/pay', {
  method: 'POST', cookie: reg.cookie,
  body: { method: 'mpesa', currency: 'MT', payTo: '879501491' }
});
assert(pay.status === 200 && pay.data.order.payment_status === 'declared', 'declaração M-Pesa');

const adminEmail = process.env.AQUA_ADMIN_EMAIL;
const adminPass = process.env.AQUA_ADMIN_PASSWORD;
if (!adminEmail || !adminPass) {
  console.log('Smoke: defina AQUA_ADMIN_EMAIL e AQUA_ADMIN_PASSWORD no ambiente para testar o login da administração.');
  process.exit(0);
}
const admin = await req('/api/auth/login', {
  method: 'POST', body: { email: adminEmail, password: adminPass, remember: true }
});
assert(admin.status === 200 && admin.data.user.role === 'admin', 'login admin');

const conf = await req('/api/admin/orders/' + order.data.order.id, {
  method: 'PATCH', cookie: admin.cookie, body: { payment_status: 'paid' }
});
assert(conf.data.order.payment_status === 'paid', 'admin confirmou pagamento');
assert(/^AQ-PAY-/.test(conf.data.order.code), 'código actualizado para ' + conf.data.order.code);

const resv = await req('/api/admin/tables/12', { method: 'PATCH', cookie: admin.cookie, body: { status: 'reserved' } });
assert(resv.data.table.status === 'reserved', 'mesa 12 reservada');

const call = await req('/api/calls', {
  method: 'POST', cookie: reg.cookie,
  body: { tableNumber: 3, reason: 'conta', note: 'conta por favor' }
});
assert(call.status === 200 && call.data.call.table_number === 3, 'chamado mesa 3');
assert(call.data.waiter?.name, 'garçom avisado: ' + call.data.waiter.name);

const staffPin = process.env.AQUA_STAFF_PIN;
if (!staffPin) {
  console.log('Smoke: defina AQUA_STAFF_PIN no ambiente para testar o terminal do garçom.');
  process.exit(0);
}
const staff = await req('/api/staff/open', { method: 'POST', body: { waiterId: call.data.waiter.id, pin: String(staffPin) } });
assert(staff.status === 200 && staff.data.token, 'terminal do garçom com PIN');

const board = await req('/api/staff/board', { token: staff.data.token });
assert(board.data.calls.some((c) => c.id === call.data.call.id), 'chamado visível no terminal');

const ov = await req('/api/admin/overview', { cookie: admin.cookie });
assert(ov.data.kpis.orders >= 1, 'overview admin com pedidos');

console.log('\nTodos os testes passaram.');
