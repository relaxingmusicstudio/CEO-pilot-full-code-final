-- Execution spine core tables
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamptz default now()
);

create table if not exists public.users (
  id uuid primary key,
  email text,
  created_at timestamptz default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  org_id uuid references public.orgs(id),
  role text check (role in ('owner','ceo','cro','viewer')),
  created_at timestamptz default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs(id),
  objective text,
  content jsonb,
  status text default 'draft',
  created_at timestamptz default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs(id),
  plan_id uuid references public.plans(id),
  title text,
  payload jsonb,
  status text default 'proposed',
  requires_approval boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id),
  approved_by uuid references public.users(id),
  approved_at timestamptz default now()
);

create table if not exists public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id),
  status text,
  input jsonb,
  output jsonb,
  created_at timestamptz default now()
);

create table if not exists public.telemetry (
  id uuid primary key default gen_random_uuid(),
  event text,
  payload jsonb,
  created_at timestamptz default now()
);

alter table public.orgs enable row level security;
alter table public.users enable row level security;
alter table public.memberships enable row level security;
alter table public.plans enable row level security;
alter table public.tasks enable row level security;
alter table public.approvals enable row level security;
alter table public.execution_logs enable row level security;
alter table public.telemetry enable row level security;
