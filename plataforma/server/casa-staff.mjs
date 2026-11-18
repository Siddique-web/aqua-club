import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const STAFF_FILE = path.join(here, '../data/staff.json');

/** Código inicial: só via ambiente, nunca no código do site. */
export const STAFF_BOOTSTRAP_CODE = String(process.env.AQUA_STAFF_BOOTSTRAP_CODE || '').trim();

function loadCasaStaff() {
  try {
    if (!fs.existsSync(STAFF_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export const CASA_STAFF = loadCasaStaff();

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
