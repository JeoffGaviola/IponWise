-- ============================================================================
-- IponWise — FULL DATABASE SETUP (run this ONE file in Supabase → SQL Editor)
-- ----------------------------------------------------------------------------
-- Fresh project?  Run this whole file once. It is idempotent, so re-running it is safe.
-- It is the concatenation of, in order:
--   iponwise_complete_schema.sql   profiles, goals, transactions, reminders, RLS, auth→profile trigger
--   002_profile_avatars.sql        private profile-picture bucket
--   003_user_wallets.sql           tracked accounts (e-wallets, banks, ATM cards)
--   004_goal_planning.sql          goal priority / description / contribution schedule
--   006_wallet_tracking_and_onboarding.sql   QR + card metadata (last 4 only), balance history, guide flag
--   007_superadmin_roles.sql                 persisted user roles and first-account bootstrap
-- (005_supabase_social_auth_profiles.sql is already contained in the complete schema.)
-- ============================================================================


-- ---------------------------------------------------------------------------
-- >>> iponwise_complete_schema.sql
-- ---------------------------------------------------------------------------
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists theme text not null default 'light',
  add column if not exists email_address text,
  add column if not exists auth_provider text not null default 'email',
  add column if not exists provider_avatar_url text,
  add column if not exists last_sign_in_at timestamptz;

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

-- ---------------------------------------------------------------------------
-- >>> 002_profile_avatars.sql
-- ---------------------------------------------------------------------------
-- IponWise profile picture support.
-- Run after iponwise_complete_schema.sql.

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'profile-avatars',
    'profile-avatars',
    FALSE,
    5242880,
    ARRAY['image/webp']::TEXT[]
)
ON CONFLICT (id)
DO UPDATE SET
    public = FALSE,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/webp']::TEXT[];

-- The bucket remains private.
-- FastAPI accesses it using the server-side service-role key.
-- Do not expose that key in React or browser requests.

-- storage.objects is Supabase-managed and its ownership/RLS must not be changed
-- from an application migration. The bucket is private, and the backend uses
-- the service-role API for avatar upload, signing, and deletion.
-- ---------------------------------------------------------------------------
-- >>> 003_user_wallets.sql
-- ---------------------------------------------------------------------------
-- Apply in Supabase SQL Editor after the existing IponWise schema.
-- Balances are user-entered snapshots; this table does not connect to banks or e-wallet providers.
CREATE TABLE IF NOT EXISTS public.user_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  provider VARCHAR(80) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('ewallet','bank','atm','cash','investment')),
  balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'PHP',
  note VARCHAR(250) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_updated ON public.user_wallets(user_id, updated_at DESC);
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_wallets_select_own ON public.user_wallets;
CREATE POLICY user_wallets_select_own ON public.user_wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS user_wallets_insert_own ON public.user_wallets;
CREATE POLICY user_wallets_insert_own ON public.user_wallets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS user_wallets_update_own ON public.user_wallets;
CREATE POLICY user_wallets_update_own ON public.user_wallets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS user_wallets_delete_own ON public.user_wallets;
CREATE POLICY user_wallets_delete_own ON public.user_wallets FOR DELETE TO authenticated USING (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_wallets TO authenticated;

-- ---------------------------------------------------------------------------
-- >>> 004_goal_planning.sql
-- ---------------------------------------------------------------------------
-- Apply in Supabase SQL Editor after the complete schema. Idempotent and non-destructive:
-- it only ADDS columns with safe defaults, so existing goals keep working unchanged.
alter table public.savings_goals
  add column if not exists priority text not null default 'normal',
  add column if not exists description text not null default '',
  add column if not exists contribution_frequency text not null default 'monthly';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'savings_goals_priority_check'
                 and conrelid = 'public.savings_goals'::regclass) then
    alter table public.savings_goals
      add constraint savings_goals_priority_check check (priority in ('essential', 'high', 'normal', 'optional'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'savings_goals_frequency_check'
                 and conrelid = 'public.savings_goals'::regclass) then
    alter table public.savings_goals
      add constraint savings_goals_frequency_check check (contribution_frequency in ('daily', 'weekly', 'monthly'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'savings_goals_description_len_check'
                 and conrelid = 'public.savings_goals'::regclass) then
    alter table public.savings_goals
      add constraint savings_goals_description_len_check check (length(description) <= 500);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- >>> 006_wallet_tracking_and_onboarding.sql
-- ---------------------------------------------------------------------------
-- IponWise 006: read-only account tracking upgrades + first-run guide.
-- Apply in the Supabase SQL Editor after the complete schema and 003_user_wallets.sql.
-- Idempotent and non-destructive: it only ADDS columns/tables with safe defaults.
--
-- PRIVACY BY DESIGN: IponWise never stores a full card number, expiry date, CVV, PIN or OTP.
-- For ATM/debit cards only the LAST FOUR digits and the card network are kept, so the app can
-- show "VISA •••• 1234" without being able to use the card.

-- 1) How an account was added + privacy-safe identifiers --------------------------------------
alter table public.user_wallets
  add column if not exists source          varchar(10) not null default 'manual',
  add column if not exists card_last4      varchar(4),
  add column if not exists card_network    varchar(12),
  add column if not exists account_tail    varchar(4),
  add column if not exists last_checked_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_wallets_source_check'
                 and conrelid = 'public.user_wallets'::regclass) then
    alter table public.user_wallets
      add constraint user_wallets_source_check check (source in ('manual', 'qr', 'card'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_wallets_card_last4_check'
                 and conrelid = 'public.user_wallets'::regclass) then
    alter table public.user_wallets
      add constraint user_wallets_card_last4_check check (card_last4 is null or card_last4 ~ '^[0-9]{4}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_wallets_card_network_check'
                 and conrelid = 'public.user_wallets'::regclass) then
    alter table public.user_wallets
      add constraint user_wallets_card_network_check
      check (card_network is null or card_network in ('visa', 'mastercard', 'amex', 'jcb', 'unionpay', 'discover', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_wallets_account_tail_check'
                 and conrelid = 'public.user_wallets'::regclass) then
    alter table public.user_wallets
      add constraint user_wallets_account_tail_check check (account_tail is null or account_tail ~ '^[0-9A-Za-z]{1,4}$');
  end if;
end $$;

-- 2) Balance history: every snapshot the user records, for trends and "time to re-check" nudges --
create table if not exists public.wallet_balance_history (
  id          uuid primary key default gen_random_uuid(),
  wallet_id   uuid not null references public.user_wallets(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  balance     numeric(14,2) not null check (balance >= 0),
  reason      varchar(12) not null default 'update' check (reason in ('created', 'update', 'check-in')),
  recorded_at timestamptz not null default now()
);
create index if not exists idx_wallet_history_wallet_time on public.wallet_balance_history(wallet_id, recorded_at desc);
create index if not exists idx_wallet_history_user on public.wallet_balance_history(user_id);

alter table public.wallet_balance_history enable row level security;
drop policy if exists wallet_history_select_own on public.wallet_balance_history;
create policy wallet_history_select_own on public.wallet_balance_history
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists wallet_history_insert_own on public.wallet_balance_history;
create policy wallet_history_insert_own on public.wallet_balance_history
  for insert to authenticated with check (auth.uid() = user_id);
grant select, insert on public.wallet_balance_history to authenticated;

-- Give every pre-existing account a first history point so trend lines start somewhere.
insert into public.wallet_balance_history (wallet_id, user_id, balance, reason, recorded_at)
select w.id, w.user_id, w.balance, 'created', w.updated_at
from public.user_wallets w
where not exists (select 1 from public.wallet_balance_history h where h.wallet_id = w.id);

-- 3) First-run "Get started" guide can be hidden for good, across devices ---------------------
alter table public.user_profiles
  add column if not exists onboarding_dismissed boolean not null default false;

-- ---------------------------------------------------------------------------
-- >>> 007_superadmin_roles.sql
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists role text not null default 'user',
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_role_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_role_check
      check (role in ('user', 'superadmin'));
  end if;
end $$;

insert into public.user_profiles (id, email_address, role)
select u.id, u.email, 'superadmin'
from auth.users u
where u.created_at = (select min(created_at) from auth.users)
on conflict (id) do update
set role = 'superadmin';

-- 4) Privacy-safe wallet identifiers are unique per user/provider.
-- Existing duplicates are reported and left untouched for owner review.
DO $$
DECLARE
    duplicate_count integer;
BEGIN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT user_id, lower(provider), card_last4
        FROM public.user_wallets
        WHERE card_last4 IS NOT NULL
        GROUP BY user_id, lower(provider), card_last4
        HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Skipping card identifier index: % duplicate groups require review.', duplicate_count;
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uq_user_wallet_card_identifier
            ON public.user_wallets (user_id, lower(provider), card_last4)
            WHERE card_last4 IS NOT NULL;
    END IF;

    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT user_id, lower(provider), account_tail
        FROM public.user_wallets
        WHERE account_tail IS NOT NULL
        GROUP BY user_id, lower(provider), account_tail
        HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Skipping account identifier index: % duplicate groups require review.', duplicate_count;
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uq_user_wallet_account_identifier
            ON public.user_wallets (user_id, lower(provider), account_tail)
            WHERE account_tail IS NOT NULL;
    END IF;
END $$;
-- IponWise 008: monthly budgets and deterministic recurring cash flow.

create table if not exists public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_month date not null,
  category text not null check (length(trim(category)) between 1 and 80),
  limit_amount numeric(14,2) not null check (limit_amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, budget_month, category)
);

create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  transaction_type text not null check (transaction_type in ('deposit', 'withdrawal')),
  category text not null check (length(trim(category)) between 1 and 80),
  amount numeric(14,2) not null check (amount > 0),
  description text not null default '',
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'yearly')),
  start_date date not null,
  end_date date,
  goal_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_rules_dates_check check (end_date is null or end_date >= start_date),
  constraint recurring_rules_goal_owner_fk foreign key (goal_id, user_id)
    references public.savings_goals(id, user_id) on delete set null (goal_id)
);

create table if not exists public.recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recurring_rule_id uuid not null references public.recurring_rules(id) on delete cascade,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'posted', 'skipped')),
  actual_amount numeric(14,2),
  transaction_id uuid references public.savings_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recurring_rule_id, due_date)
);

create index if not exists monthly_budgets_user_month_idx on public.monthly_budgets(user_id, budget_month);
create index if not exists recurring_rules_user_active_idx on public.recurring_rules(user_id, is_active);
create index if not exists recurring_occurrences_user_due_idx on public.recurring_occurrences(user_id, due_date);

alter table public.monthly_budgets enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.recurring_occurrences enable row level security;

drop policy if exists "Budgets are private to their owner" on public.monthly_budgets;
create policy "Budgets are private to their owner" on public.monthly_budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Recurring rules are private to their owner" on public.recurring_rules;
create policy "Recurring rules are private to their owner" on public.recurring_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Recurring occurrences are private to their owner" on public.recurring_occurrences;
create policy "Recurring occurrences are private to their owner" on public.recurring_occurrences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

