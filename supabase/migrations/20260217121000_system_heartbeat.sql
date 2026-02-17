-- System heartbeat table for DB smoke tests
create table if not exists public.system_heartbeat (
  id text primary key,
  ts timestamptz not null default now(),
  service text not null,
  version text null,
  status text not null,
  detail jsonb not null default '{}'::jsonb
);

alter table public.system_heartbeat enable row level security;

drop policy if exists "system_heartbeat_service_role_rw" on public.system_heartbeat;
create policy "system_heartbeat_service_role_rw"
  on public.system_heartbeat
  for all
  to service_role
  using (true)
  with check (true);

-- Optional: allow anon smoke checks only (use if service_role is unavailable)
-- drop policy if exists "system_heartbeat_anon_smoke" on public.system_heartbeat;
-- create policy "system_heartbeat_anon_smoke"
--   on public.system_heartbeat
--   for select, insert
--   to anon
--   using (service = 'smoke' and id = 'smoke')
--   with check (service = 'smoke' and id = 'smoke');
