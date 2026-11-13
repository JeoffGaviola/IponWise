-- IponWise complete schema for Supabase PostgreSQL.
-- Run this in Supabase SQL Editor only after reviewing the schema.
-- Supabase Auth owns authentication; application tables reference auth.users.

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email_address text,
  auth_provider text not null default 'email',
  provider_avatar_url text,
  last_sign_in_at timestamptz,
  currency_code char(3) not null default 'PHP' check (currency_code in ('PHP', 'USD', 'SGD', 'AUD', 'EUR', 'GBP')),
  theme text not null default 'light' check (theme in ('light', 'dark', 'system')),
  email_summaries_enabled boolean not null default true,
  savings_reminders_enabled boolean not null default true,
  role text not null default 'user' check (role in ('user', 'superadmin')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists theme text not null default 'light',
  add column if not exists email_address text,
  add column if not exists auth_provider text not null default 'email',
  add column if not exists provider_avatar_url text,
  add column if not exists last_sign_in_at timestamptz,
  add column if not exists role text not null default 'user',
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_profiles_theme_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_theme_check check (theme in ('light', 'dark', 'system'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_profiles_role_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_role_check check (role in ('user', 'superadmin'));
  end if;
end $$;

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 100),
  category text not null default 'Personal',
  target_amount numeric(14,2) not null check (target_amount > 0),
  saved_amount numeric(14,2) not null default 0 check (saved_amount >= 0),
  deadline date,
  color text not null default 'mint' check (color in ('mint', 'blue', 'peach', 'lavender')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.savings_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references public.savings_goals(id) on delete set null,
  transaction_type text not null check (transaction_type in ('deposit', 'withdrawal')),
  category text not null,
  note text not null default '',
  amount numeric(14,2) not null check (amount > 0),
  transaction_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_transactions_goal_owner_fk
    foreign key (goal_id, user_id) references public.savings_goals(id, user_id)
    on delete set null (goal_id)
);

create table if not exists public.savings_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 120),
  detail text not null default '',
  schedule_label text not null,
  reminder_type text not null default 'deposit' check (reminder_type in ('deposit', 'review', 'goal')),
  is_active boolean not null default true,
  due_date date,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists savings_goals_user_created_idx on public.savings_goals(user_id, created_at desc);
create index if not exists savings_transactions_user_date_idx on public.savings_transactions(user_id, transaction_date desc, created_at desc);
create index if not exists savings_transactions_goal_idx on public.savings_transactions(goal_id) where goal_id is not null;
create index if not exists savings_reminders_user_active_idx on public.savings_reminders(user_id, is_active);
create index if not exists savings_reminders_user_due_idx
  on public.savings_reminders(user_id, due_date)
  where is_active = true and completed = false;

-- Row Level Security: users can only access their own rows.
alter table public.user_profiles enable row level security;
alter table public.savings_goals enable row level security;
alter table public.savings_transactions enable row level security;
alter table public.savings_reminders enable row level security;

drop policy if exists "Profiles are private to their owner" on public.user_profiles;
create policy "Profiles are private to their owner"
  on public.user_profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Goals are private to their owner" on public.savings_goals;
create policy "Goals are private to their owner"
  on public.savings_goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Transactions are private to their owner" on public.savings_transactions;
create policy "Transactions are private to their owner"
  on public.savings_transactions for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      goal_id is null
      or exists (
        select 1 from public.savings_goals g
        where g.id = goal_id and g.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Reminders are private to their owner" on public.savings_reminders;
create policy "Reminders are private to their owner"
  on public.savings_reminders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep an application profile for email/password and OAuth users (Google/Facebook).
-- Supabase Auth remains the source of truth for authentication and identity.
create or replace function public.handle_iponwise_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_provider text;
  v_avatar text;
begin
  v_name := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'user_name',
    nullif(concat_ws(' ', new.raw_user_meta_data ->> 'given_name', new.raw_user_meta_data ->> 'family_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    ''
  )), '');

  v_provider := coalesce(
    nullif(new.raw_app_meta_data ->> 'provider', ''),
    nullif(new.raw_user_meta_data ->> 'provider', ''),
    case
      when jsonb_typeof(new.raw_app_meta_data -> 'providers') = 'array'
        then new.raw_app_meta_data -> 'providers' ->> 0
      else null
    end,
    'email'
  );

  v_avatar := nullif(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  ), '');

  insert into public.user_profiles (
    id, display_name, email_address, auth_provider, provider_avatar_url, last_sign_in_at
  ) values (
    new.id, coalesce(v_name, ''), new.email, v_provider, v_avatar, new.last_sign_in_at
  )
  on conflict (id) do update set
    email_address = coalesce(excluded.email_address, public.user_profiles.email_address),
    display_name = case
      when coalesce(public.user_profiles.display_name, '') = ''
        then coalesce(excluded.display_name, public.user_profiles.display_name, '')
      else public.user_profiles.display_name
    end,
    auth_provider = coalesce(excluded.auth_provider, public.user_profiles.auth_provider),
    provider_avatar_url = coalesce(excluded.provider_avatar_url, public.user_profiles.provider_avatar_url),
    last_sign_in_at = coalesce(excluded.last_sign_in_at, public.user_profiles.last_sign_in_at),
    updated_at = now();

-- Bootstrap the earliest existing account as the first superadmin.
update public.user_profiles
set role = 'superadmin',
      updated_at = now()
where id = (
    select id
    from auth.users
    order by created_at asc, id asc
    limit 1
);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_iponwise on auth.users;
drop function if exists public.handle_new_iponwise_user();
drop trigger if exists on_auth_user_synced_iponwise on auth.users;
create trigger on_auth_user_synced_iponwise
after insert or update on auth.users
for each row execute procedure public.handle_iponwise_auth_user();

-- Backfill users that already existed before this migration was installed.
insert into public.user_profiles (
  id, display_name, email_address, auth_provider, provider_avatar_url, last_sign_in_at
)
select
  u.id,
  coalesce(
    nullif(btrim(coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'user_name',
      nullif(concat_ws(' ', u.raw_user_meta_data ->> 'given_name', u.raw_user_meta_data ->> 'family_name'), ''),
      split_part(coalesce(u.email, ''), '@', 1),
      ''
    )), ''),
    split_part(coalesce(u.email, ''), '@', 1),
    ''
  ),
  u.email,
  coalesce(
    nullif(u.raw_app_meta_data ->> 'provider', ''),
    nullif(u.raw_user_meta_data ->> 'provider', ''),
    case
      when jsonb_typeof(u.raw_app_meta_data -> 'providers') = 'array'
        then u.raw_app_meta_data -> 'providers' ->> 0
      else null
    end,
    'email'
  ),
  nullif(coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'), ''),
  u.last_sign_in_at
from auth.users as u
on conflict (id) do update set
  email_address = coalesce(excluded.email_address, public.user_profiles.email_address),
  display_name = case
    when coalesce(public.user_profiles.display_name, '') = ''
      then coalesce(excluded.display_name, public.user_profiles.display_name, '')
    else public.user_profiles.display_name
  end,
  auth_provider = coalesce(excluded.auth_provider, public.user_profiles.auth_provider),
  provider_avatar_url = coalesce(excluded.provider_avatar_url, public.user_profiles.provider_avatar_url),
  last_sign_in_at = coalesce(excluded.last_sign_in_at, public.user_profiles.last_sign_in_at),
  updated_at = now();
