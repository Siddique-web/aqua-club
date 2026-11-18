/** Equipa oficial Aqua Club — 7 contas (telefone + código). */
export const STAFF_BOOTSTRAP_CODE = String(process.env.AQUA_STAFF_BOOTSTRAP_CODE || '123456');

export const CASA_STAFF = [
  {
    name: 'Ana',
    phone: '852329121',
    job: 'cashier',
    role: 'waiter',
    title: 'Caixa',
    bio: 'Gestão de mesas, pedidos, contas e fecho de caixa.',
    perms: ['tables', 'orders', 'bills', 'cash_close'],
    can_change_passwords: false
  },
  {
    name: 'Joana',
    phone: '878613887',
    job: 'cashier',
    role: 'waiter',
    title: 'Caixa',
    bio: 'Gestão de mesas, pedidos, contas e fecho de caixa.',
    perms: ['tables', 'orders', 'bills', 'cash_close'],
    can_change_passwords: false
  },
  {
    name: 'Otília',
    phone: '870369844',
    job: 'cashier',
    role: 'waiter',
    title: 'Caixa',
    bio: 'Gestão de mesas, pedidos, contas e fecho de caixa.',
    perms: ['tables', 'orders', 'bills', 'cash_close'],
    can_change_passwords: false
  },
  {
    name: 'Margarida',
    phone: '872961130',
    job: 'cashier',
    role: 'waiter',
    title: 'Caixa',
    bio: 'Gestão de mesas, pedidos, contas e fecho de caixa.',
    perms: ['tables', 'orders', 'bills', 'cash_close'],
    can_change_passwords: false
  },
  {
    name: 'Raquel Diogo',
    phone: '879501491',
    job: 'manager',
    role: 'admin',
    title: 'Gerente',
    bio: 'Gere todo o restaurante: mesas, pedidos, contas, caixa e equipa.',
    perms: ['tables', 'orders', 'bills', 'cash_close', 'restaurant', 'team'],
    can_change_passwords: false
  },
  {
    name: 'João',
    phone: '863586932',
    job: 'manager',
    role: 'admin',
    title: 'Gerente',
    bio: 'Gere todo o restaurante: mesas, pedidos, contas, caixa e equipa.',
    perms: ['tables', 'orders', 'bills', 'cash_close', 'restaurant', 'team'],
    can_change_passwords: false
  },
  {
    name: 'Siddique Faizy Rego',
    phone: '845961528',
    job: 'it',
    role: 'admin',
    title: 'IT',
    bio: 'Informática da casa. Único perfil que pode alterar códigos de acesso.',
    perms: ['tables', 'orders', 'bills', 'cash_close', 'restaurant', 'team', 'passwords'],
    can_change_passwords: true
  }
];

export function mzDigits(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('258')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

export function staffEmail(phone) {
  return mzDigits(phone) + '@staff.aquaclub.mz';
}

export function phonesMatch(a, b) {
  const x = mzDigits(a), y = mzDigits(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}
