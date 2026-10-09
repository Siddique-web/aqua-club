-- Aqua Club — correr no Supabase: SQL Editor → New query → Run
create extension if not exists pgcrypto;

create table if not exists tables (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  zone text not null check (zone in ('rooftop','piscina','sala-principal')),
  seats int not null default 4,
  status text not null default 'free' check (status in ('free','occupied','reserved')),
  map_x numeric default 0, map_y numeric default 0
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('sushi','marisco','cocktails','principais','sobremesas')),
  name text not null,
  sensory_description text not null,
  ingredients text[] default '{}', allergens text[] default '{}',
  wine_pairing text, price_mzn numeric not null, photo_url text default '', available boolean not null default true
);

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null, role text not null default 'waiter', active boolean not null default true
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null, table_code text not null,
  lines jsonb not null, total_mzn numeric not null,
  status text not null default 'received' check (status in ('received','preparing','on_the_way','delivered','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists waiter_calls (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null, table_code text not null,
  zone text not null check (zone in ('rooftop','piscina','sala-principal')),
  reason text not null check (reason in ('request_bill','menu_question','new_order','urgent_other')),
  note text,
  status text not null default 'pending' check (status in ('pending','accepted','completed','cancelled')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz, completed_at timestamptz,
  accepted_by_id uuid, accepted_by_name text
);
create index if not exists waiter_calls_status_idx on waiter_calls (status, created_at);

-- Tempo real
alter publication supabase_realtime add table waiter_calls;
alter publication supabase_realtime add table orders;

-- ⚠️ SEGURANÇA — APENAS PARA DESENVOLVIMENTO: acesso aberto à chave anon.
-- Antes de produção: Supabase Auth para staff/admin e políticas por papel (ver README).
alter table tables enable row level security;
alter table menu_items enable row level security;
alter table staff enable row level security;
alter table orders enable row level security;
alter table waiter_calls enable row level security;
do $$ declare t text; begin
  foreach t in array array['tables','menu_items','staff','orders','waiter_calls'] loop
    execute format('drop policy if exists dev_all on %I', t);
    execute format('create policy dev_all on %I for all to anon using (true) with check (true)', t);
  end loop;
end $$;

-- Dados de exemplo
insert into tables (code, zone, seats, map_x, map_y) values
 ('Mesa-01-Rooftop','rooftop',4,20,15), ('Mesa-04-Rooftop','rooftop',4,60,15),
 ('Mesa-08-Piscina','piscina',6,25,55), ('Mesa-12-Piscina','piscina',4,70,60),
 ('Mesa-15-Sala','sala-principal',2,30,85), ('Mesa-16-Sala','sala-principal',8,75,85)
on conflict (code) do nothing;

insert into staff (name) values ('Amélia'), ('Joaquim'), ('Nádia') on conflict do nothing;

insert into menu_items (category,name,sensory_description,ingredients,allergens,wine_pairing,price_mzn) values
 ('sushi','Nigiri de Atum Rabil','Atum rosado e sedoso sobre arroz morno, com um sopro de wasabi fresco.','{atum,arroz de sushi,wasabi}','{peixe,soja}','Sake Junmai gelado',950),
 ('sushi','Uramaki Aqua','Camarão tempura, abacate e manga, finalizado com maçarico e molho de ervas.','{camarão,abacate,manga,sésamo}','{crustáceos,glúten,sésamo}','Vinho verde',1200),
 ('marisco','Lagostim do Índico grelhado','Lagostim na brasa, manteiga de limão e piripiri suave, servido à beira-mar.','{lagostim,manteiga,limão,piripiri}','{crustáceos,lactose}','Chardonnay não estagiado',2400),
 ('marisco','Ostras frescas (6 un.)','Salinidade limpa do mar com gotas de limão e pepino em vinagre.','{ostra,limão,pepino}','{moluscos}','Champanhe brut',1800),
 ('cocktails','Aqua Blue','Rum branco, curaçau azul, coco e lima — fresco como a maré da tarde.','{rum,curaçau,coco,lima}','{}',null,650),
 ('cocktails','Sunset Lychee','Vodka, lichia, hibisco e espuma de gengibre ao pôr do sol.','{vodka,lichia,hibisco,gengibre}','{}',null,700),
 ('principais','Peixe do dia com caril de coco','Posta de peixe fresco em caril de coco aromático, arroz jasmim e coentros.','{peixe,coco,caril,arroz jasmim}','{peixe}','Riesling seco',1650),
 ('sobremesas','Mochi de manga e coco','Massa macia e fria, recheio cremoso de manga madura e coco tostado.','{arroz glutinoso,manga,coco}','{}',null,550)
on conflict do nothing;
