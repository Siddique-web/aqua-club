// Testa schema.sql + v2 + v3 num PostgreSQL real (PGlite), simulando os papéis do Supabase.
// Uso:  cd tests && npm install && npm run test:sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'sistema', 'supabase');
const read = (f) => readFileSync(join(dir, f), 'utf8').replace(/create extension if not exists pgcrypto;/g, '');

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FALHOU:', m); } };
const throws = async (fn, m, like) => {
  try { await fn(); fail++; console.log('  ✗ FALHOU (devia dar erro):', m); }
  catch (e) { const good = !like || String(e.message).toLowerCase().includes(like.toLowerCase());
    if (good) { pass++; console.log('  ✓', m, '→', e.message.slice(0, 70)); } else { fail++; console.log('  ✗ erro errado em', m, '→', e.message); } }
};
const as = async (role, uid) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false);` +
    `select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid, email: uid + '@x.t' }) : ''}', false);` +
    (role ? `set role ${role};` : ''));
};
const q = async (sql, params) => (await db.query(sql, params)).rows;

// ---- ambiente tipo Supabase
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create publication supabase_realtime;
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);

console.log('\n[1] Instalação (schema → v2 → v3) e repetição');
// um utilizador que já existia ANTES do v3 (ex.: quem usava o painel.html)
await db.exec(read('schema.sql')); await db.exec(read('schema_v2_pedidos.sql'));
await db.exec("grant all on all tables in schema public to anon, authenticated");
const OLD = (await q("insert into auth.users (email, raw_user_meta_data) values ('dono@aqua.t', '{\"name\":\"Dono\"}') returning id"))[0].id;
await db.exec(read('schema_v3_garcons.sql'));
await db.exec("grant all on all tables in schema public to anon, authenticated");
await db.exec(read('schema_v3_garcons.sql'));  // idempotente
ok(true, 'v3 corre duas vezes sem erro');
// ATENÇÃO: o v2 volta a criar a política larga dos pedidos e a função de pagamento antiga.
// Se alguém o correr outra vez, tem de correr o v3 a seguir. Simulamos isso:
await db.exec(read('schema_v2_pedidos.sql')); await db.exec(read('schema_v3_garcons.sql'));
ok(true, 'v2 repetido + v3 a seguir recompõe tudo');
let st = (await q('select role, active from staff where user_id = $1', [OLD]))[0];
ok(st && st.role === 'admin' && st.active, 'conta antiga passa a admin ativo (backfill)');

console.log('\n[2] Anónimo (chave pública) — o que já NÃO pode fazer');
await as('anon');
ok((await q('select * from tables')).length === 6, 'anónimo lê as mesas');
await db.exec("delete from tables"); ok((await q('select * from tables')).length === 6, 'anónimo NÃO consegue apagar mesas');
await throws(() => db.exec("insert into tables (code, zone) values ('Mesa-99','piscina')"), 'anónimo não cria mesas', 'row-level');
await db.exec("update menu_items set price_mzn = 1"); 
await as(null); ok((await q('select count(*)::int c from menu_items where price_mzn = 1'))[0].c === 0, 'anónimo NÃO altera preços do menu');
await as('anon');
ok((await q('select * from staff')).length === 0, 'anónimo não vê a equipa');
ok((await q('select * from waiter_calls')).length === 0, 'anónimo não lê chamados diretamente');
ok((await q('select * from orders')).length === 0, 'anónimo não lê pedidos');
await throws(() => db.exec("insert into waiter_calls (table_id, table_code, zone, reason) values (gen_random_uuid(),'x','rooftop','new_order')"), 'anónimo não insere chamados à mão', 'row-level');

console.log('\n[3] Chamados do cliente (RPC)');
const call = async (t, r, n, d) => (await q('select create_call($1,$2,$3,$4) id', [t, r, n, d]))[0].id;
const C1 = await call('Mesa-04-Rooftop', 'request_bill', 'Dividir a conta', 'dev-A');
ok(/^[0-9a-f-]{36}$/.test(C1), 'create_call devolve um id');
ok(await call('Mesa-04-Rooftop', 'request_bill', null, 'dev-A') === C1, 'pedido repetido (mesma mesa+motivo) devolve o mesmo chamado');
const C2 = await call('Mesa-04-Rooftop', 'new_order', null, 'dev-A');
ok(C2 !== C1, 'motivo diferente cria outro chamado');
await throws(() => call('Mesa-XX', 'new_order'), 'mesa inexistente é recusada', 'não existe');
await throws(() => call('Mesa-04-Rooftop', 'hackeado'), 'motivo inválido é recusado', 'inválido');
let s = (await q('select * from call_status($1)', [C1]))[0];
ok(s.status === 'pending' && s.accepted_by_name === null, 'call_status: pendente, sem garçom');
ok((await q('select cancel_call($1) r', [C2]))[0].r === true, 'cancelar chamado pendente funciona');
ok((await q('select cancel_call($1) r', [C2]))[0].r === false, 'cancelar duas vezes não faz nada');
for (const [t, r] of [['Mesa-01-Rooftop','request_bill'],['Mesa-01-Rooftop','new_order'],['Mesa-08-Piscina','request_bill'],['Mesa-08-Piscina','new_order']]) await call(t, r, null, 'dev-A');
await throws(() => call('Mesa-12-Piscina', 'request_bill', null, 'dev-A'), 'limite de 6 chamados/10 min por dispositivo', 'demasiados');

console.log('\n[4] Garçons: registo, aprovação e permissões');
await as(null);
const W1 = (await q("insert into auth.users (email, raw_user_meta_data) values ('ana@aqua.t', '{\"name\":\"Ana\",\"phone\":\"841112222\"}') returning id"))[0].id;
const W2 = (await q("insert into auth.users (email, raw_user_meta_data) values ('beto@aqua.t', '{\"name\":\"Beto\"}') returning id"))[0].id;
const p = (await q('select name, role, active, phone from staff where user_id = $1', [W1]))[0];
ok(p.name === 'Ana' && p.role === 'waiter' && p.active === false && p.phone === '841112222', 'novo registo fica PENDENTE (não ativo) como garçom');
await as('authenticated', W1);
ok((await q('select * from orders')).length === 0 && (await q('select * from waiter_calls')).length === 0, 'conta pendente NÃO vê pedidos nem chamados');
await throws(() => q('select accept_call($1)', [C1]), 'conta pendente não aceita chamados', 'permiss');
ok((await q('select * from staff')).length === 1, 'cada um só vê o seu próprio perfil');
await throws(() => q("select admin_set_staff($1, true, 'admin')", [W1]), 'conta pendente não se auto-aprova', 'permiss');
await db.exec("update staff set active = true, role = 'admin' where user_id = '" + W1 + "'");
await as(null); st = (await q('select role, active from staff where user_id = $1', [W1]))[0];
ok(st.role === 'waiter' && st.active === false, 'nem por UPDATE direto (RLS ignora a escrita)');


await as('authenticated', OLD);
const rows = await q('select id, name, active from staff where user_id is not null order by created_at');
ok(rows.length === 3, 'admin vê a equipa toda');
const w1id = rows.find((r) => r.name === 'Ana').id, w2id = rows.find((r) => r.name === 'Beto').id;
ok((await q("select admin_set_staff($1, true, 'waiter') r", [w1id]))[0].r, 'admin aprova a Ana');
ok((await q("select admin_set_staff($1, true, 'waiter') r", [w2id]))[0].r, 'admin aprova o Beto');
await throws(() => q("select admin_set_staff($1, false, 'admin')", [rows.find((r) => r.name === 'Dono').id]), 'admin não pode retirar o próprio acesso', 'próprio');
await throws(() => q("select admin_set_staff($1, true, 'dono')", [w1id]), 'papel inválido recusado', 'inválido');

console.log('\n[5] Ciclo completo do chamado');
await as('authenticated', W1);
ok((await q('select * from waiter_calls')).length >= 5, 'Ana (ativa) vê os chamados');
ok((await q('select accept_call($1) r', [C1]))[0].r === true, 'Ana aceita o chamado');
await as('authenticated', W2);
ok((await q('select accept_call($1) r', [C1]))[0].r === false, 'Beto não consegue aceitar o mesmo (corrida resolvida)');
ok((await q('select complete_call($1) r', [C1]))[0].r === false, 'Beto não conclui o chamado da Ana');
await as('anon');
s = (await q('select * from call_status($1)', [C1]))[0];
ok(s.status === 'accepted' && s.accepted_by_name === 'Ana' && s.accepted_at, 'cliente vê: aceite pela Ana');
await as('authenticated', W1);
ok((await q('select release_call($1) r', [C1]))[0].r === true, 'Ana devolve o chamado');
await as('anon'); s = (await q('select * from call_status($1)', [C1]))[0];
ok(s.status === 'pending' && s.accepted_by_name === null, 'cliente vê: de novo pendente');
await as('authenticated', W2);
ok((await q('select accept_call($1) r', [C1]))[0].r === true, 'Beto aceita');
ok((await q('select complete_call($1) r', [C1]))[0].r === true, 'Beto conclui');
await as('anon'); s = (await q('select * from call_status($1)', [C1]))[0];
ok(s.status === 'completed' && s.completed_at, 'cliente vê: concluído');
ok((await q('select rate_call($1, 5, $2) r', [C1, 'Excelente'])) [0].r === true, 'cliente avalia com 5 estrelas');
ok((await q('select rate_call($1, 1, null) r', [C1]))[0].r === false, 'não se pode avaliar duas vezes');
await throws(() => q('select rate_call($1, 9, null)', [C1]), 'nota fora de 1–5 recusada', 'inválida');
await as('authenticated', W2);
await q("select update_my_profile('Beto Silva', '849990000')");
ok((await q('select name, phone from staff where user_id = $1', [W2]))[0].name === 'Beto Silva', 'garçom edita o próprio perfil');
ok((await q("select accepted_by_name from waiter_calls where id = $1", [C1]))[0].accepted_by_name === 'Beto', 'histórico mantém o nome da altura');

console.log('\n[6] Pedidos e pagamento (correções de segurança)');
await as('anon');
await db.exec(`insert into orders (id, table_id, table_code, lines, total_mzn, code, customer_name, customer_phone, accepted_terms)
  values (gen_random_uuid(), gen_random_uuid(), 'Mesa-04-Rooftop', '[]', 100, 'AQ-TEST-0001', 'Cliente', '258841234567', true)`);
await throws(() => q("select set_payment('AQ-TEST-0001','paid_declared', '<img src=x onerror=alert(1)>', null)"), 'XSS: método de pagamento arbitrário é recusado', 'método');
ok((await q("select set_payment('AQ-TEST-0001','pay_requested','mpesa','ABC123') r"))[0].r === true, 'método legítimo (mpesa) aceite');
await as('authenticated', W1); ok((await q('select * from orders')).length === 1, 'garçom ativo vê pedidos');
await as('authenticated', (await q("select gen_random_uuid() id"))[0].id); ok((await q('select * from orders')).length === 0, 'utilizador autenticado qualquer (sem perfil de equipa) NÃO vê pedidos');
await as('authenticated', W1); await db.exec("delete from orders");
await as(null); ok((await q('select count(*)::int c from orders'))[0].c === 1, 'garçom não apaga pedidos (só admin): o pedido continua lá');

console.log(`\nResultado: ${pass} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
