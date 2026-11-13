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
