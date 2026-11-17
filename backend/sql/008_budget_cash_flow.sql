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
