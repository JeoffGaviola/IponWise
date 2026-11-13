-- IponWise Supabase Auth profile integration and social-login capture.
-- Apply this in the Supabase SQL Editor after iponwise_complete_schema.sql.
-- Supabase Auth (auth.users) is the source of truth. The trigger creates/refreshes
-- one user_profiles row after email/password or OAuth (Google/Facebook) sign-up.
-- This SQL does NOT enable external OAuth providers; configure their credentials
-- in Supabase Dashboard > Authentication > Sign In / Providers.

begin;

alter table public.user_profiles
  add column if not exists email_address text,
  add column if not exists auth_provider text not null default 'email',
  add column if not exists provider_avatar_url text,
  add column if not exists last_sign_in_at timestamptz;

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

commit;
