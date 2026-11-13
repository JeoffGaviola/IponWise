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
