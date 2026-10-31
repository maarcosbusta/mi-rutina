-- Avisos de fin de descanso en el móvil bloqueado (notificaciones push).
-- Ya aplicado en Supabase. Si hubiera que rehacerlo: Supabase > SQL Editor > Run.
-- Cómo funciona: al empezar un descanso, la app guarda una alarma en rest_alarms.
-- Cada 3 s, pg_cron mira si hay alguna vencida y, si la hay, llama a la función
-- aviso-descanso (supabase/functions/aviso-descanso), que manda la notificación.

-- Móviles donde cada usuario aceptó los avisos (una fila por móvil/navegador)
create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
create policy "push_subs: lo suyo" on public.push_subs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.push_subs to authenticated;

-- Alarma de descanso en marcha (como mucho una por usuario: la nueva sustituye a la anterior)
create table if not exists public.rest_alarms (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  fire_at timestamptz not null,
  title text not null default 'Descanso terminado',
  body text not null default ''
);
alter table public.rest_alarms enable row level security;
create policy "rest_alarms: lo suyo" on public.rest_alarms
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.rest_alarms to authenticated;
create index if not exists rest_alarms_fire on public.rest_alarms(fire_at);

-- Claves de los avisos y contraseña interna del cron. RLS sin políticas:
-- nadie desde la app puede leerla; solo el servidor (service_role) y pg_cron.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  vapid jsonb,              -- claves (pública y privada); las crea la función la primera vez
  vapid_public text,        -- clave pública, la que necesita el móvil
  cron_secret text not null default encode(extensions.gen_random_bytes(24), 'hex')
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (id) values (1) on conflict do nothing;

-- La app pide la clave pública con esta función (solo la pública)
create or replace function public.vapid_public() returns text
language sql stable security definer set search_path = public
as $$ select vapid_public from public.push_config where id = 1 $$;
revoke all on function public.vapid_public() from public, anon;
grant execute on function public.vapid_public() to authenticated;

-- Cada 3 s: si hay alguna alarma vencida, llama a la función que envía los avisos
create extension if not exists pg_cron;
select cron.schedule('aviso-descanso', '3 seconds', $$
  select net.http_post(
    url := 'https://zfrzmmfbljcscjntzokx.supabase.co/functions/v1/aviso-descanso',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron', (select cron_secret from public.push_config where id = 1)),
    body := '{}'::jsonb)
  where exists (select 1 from public.rest_alarms where fire_at <= now());
$$);
-- Limpieza diaria del historial del cron (si no, crece mucho)
select cron.schedule('limpiar-cron', '17 4 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '1 day' $$);
