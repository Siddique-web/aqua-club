/**
 * Cria as 7 contas da casa no Supabase Auth + tabela staff.
 *
 * Uso (na pasta plataforma):
 *   set SUPABASE_URL=https://xxxx.supabase.co
 *   set SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   node scripts/seed-supabase-equipa.mjs
 *
 * No dashboard: Authentication → Sign In / Providers → Email
 * Minimum password length = 6 (o código inicial é 123456).
 */
import { CASA_STAFF, STAFF_BOOTSTRAP_CODE, mzDigits, staffEmail } from '../server/casa-staff.mjs';

const URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const CODE = STAFF_BOOTSTRAP_CODE;

if (!URL || !KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

async function api(path, method, body) {
  const res = await fetch(URL + path, {
    method,
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error((data && data.message) || text || res.statusText);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function findUserId(email) {
  const q = new URLSearchParams({ page: '1', per_page: '200' });
  const data = await api('/auth/v1/admin/users?' + q, 'GET');
  const users = data.users || data || [];
  const row = users.find((u) => String(u.email || '').toLowerCase() === email.toLowerCase());
  return row ? row.id : null;
}

const COLORS = ['#00A8FF', '#FFB400', '#16A34A', '#E11D48', '#7C3AED', '#0891B2', '#0A0A0A'];

for (const [i, s] of CASA_STAFF.entries()) {
  const phone = mzDigits(s.phone);
  const email = staffEmail(phone);
  const meta = { name: s.name, phone, job: s.job, title: s.title };
  let userId = await findUserId(email);
  if (!userId) {
    try {
      const created = await api('/auth/v1/admin/users', 'POST', {
        email,
        password: CODE,
        email_confirm: true,
        user_metadata: meta
      });
      userId = created.id;
      console.log('Auth criado:', s.name, email);
    } catch (e) {
      console.error('Falhou Auth para', s.name, e.message);
      if (/password/i.test(e.message)) {
        console.error('No dashboard: Authentication → Settings → Password min length = 5');
      }
      process.exit(1);
    }
  } else {
    await api('/auth/v1/admin/users/' + userId, 'PUT', {
      password: CODE,
      email_confirm: true,
      user_metadata: meta
    });
    console.log('Auth actualizado:', s.name, email);
  }

  const profile = {
    user_id: userId,
    name: s.name,
    email,
    phone: '258' + phone,
    role: s.role,
    job: s.job,
    title: s.title,
    active: true,
    can_change_passwords: !!s.can_change_passwords,
    perms: s.perms,
    color: COLORS[i % COLORS.length]
  };

  const existing = await api('/rest/v1/staff?user_id=eq.' + userId + '&select=id', 'GET');
  if (Array.isArray(existing) && existing[0]) {
    await api('/rest/v1/staff?id=eq.' + existing[0].id, 'PATCH', profile);
    console.log('Perfil actualizado:', s.name);
  } else {
    await api('/rest/v1/staff', 'POST', profile);
    console.log('Perfil criado:', s.name);
  }
}

console.log('\nPronto. Entrada: telemóvel + código ' + CODE);
console.log('Só Siddique Faizy Rego (845961528) pode alterar códigos.');
