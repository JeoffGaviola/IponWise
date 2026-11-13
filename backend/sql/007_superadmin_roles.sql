-- IponWise 007: persisted system roles.
-- Idempotent. The earliest existing account is bootstrapped as the first superadmin;
-- all later accounts remain regular users unless changed by a trusted database operator.

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
