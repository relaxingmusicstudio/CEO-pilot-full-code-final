-- Integrations storage for per-user API keys (encrypted at rest)
-- DO NOT STORE PLAINTEXT KEYS

create table if not exists public.user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai','gemini')),
  api_key_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- keep updated_at fresh
create or replace function public.update_user_integrations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_integrations_updated_at on public.user_integrations;
create trigger trg_user_integrations_updated_at
before update on public.user_integrations
for each row execute function public.update_user_integrations_updated_at();

alter table public.user_integrations enable row level security;

-- RLS: user can CRUD only their own rows
create policy "user_integrations_select_own"
  on public.user_integrations
  for select using (auth.uid() = user_id);

create policy "user_integrations_insert_own"
  on public.user_integrations
  for insert with check (auth.uid() = user_id);

create policy "user_integrations_update_own"
  on public.user_integrations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_integrations_delete_own"
  on public.user_integrations
  for delete using (auth.uid() = user_id);
