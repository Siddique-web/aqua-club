import fs from 'node:fs';

function findCalls(src, fn) {
  const out = [];
  let i = 0;
  while (true) {
    const k = src.indexOf(fn + '(', i);
    if (k < 0) break;
    if (k > 0 && /[A-Za-z0-9_]/.test(src[k - 1])) { i = k + 1; continue; }
    let p = k + fn.length + 1, depth = 1, q = null;
    for (; p < src.length && depth; p++) {
      const c = src[p];
      if (q) { if (c === '\\') { p++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    out.push({ inner: src.slice(k + fn.length + 1, p - 1) });
    i = p;
  }
  return out;
}

function splitArgs(s) {
  const args = [];
  let cur = '', d = 0, q = null;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (q) { cur += c; if (c === '\\') { cur += s[++j] || ''; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if (c === '(') d++;
    if (c === ')') d--;
    if (c === ',' && d === 0) { args.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function unquote(s) {
  const m = s.match(/^(['"])([\s\S]*)\1$/);
  return m ? m[2] : null;
}

for (const [file, fn] of [['site/i18n.js', 'P'], ['plataforma/server/catalog.mjs', 'T']]) {
  const src = fs.readFileSync(file, 'utf8');
  const badLen = [];
  const same = [];
  for (const call of findCalls(src, fn)) {
    const args = splitArgs(call.inner);
    if (args.length !== 5) badLen.push(args.length + ' ' + call.inner.slice(0, 90).replace(/\s+/g, ' '));
    else {
      const en = unquote(args[1]);
      const zh = unquote(args[4]);
      if (en && zh === en && en.length > 16) same.push(en);
    }
  }
  console.log(file, 'wrong-arity', badLen.length, 'en==zh-long', same.length);
  badLen.slice(0, 8).forEach((x) => console.log(' arity', x));
  same.slice(0, 12).forEach((x) => console.log(' same', x));
}
