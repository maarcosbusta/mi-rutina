-- Sesiones que el entrenador ya ha revisado en Actividad ("Ya lo vi").
-- Pégalo una vez en Supabase > SQL Editor > Run.
create table if not exists public.session_seen (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.session_seen enable row level security;
-- Solo el entrenador puede leer y escribir
create policy "visto: solo el entrenador" on public.session_seen
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.session_seen to authenticated;
