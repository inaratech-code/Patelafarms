-- Password-based device linking (same username + password on a new browser).
-- Run after join_farm.sql (or fix_farms_rls_v2.sql). Requires public.is_farm_member (SECURITY DEFINER patch applied).

create table if not exists public.farm_cloud_logins (
  username_norm text primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create index if not exists farm_cloud_logins_farm_id_idx on public.farm_cloud_logins (farm_id);

alter table public.farm_cloud_logins enable row level security;
-- No SELECT/INSERT policies: clients use RPCs only (avoids exposing rows).

-- Link current auth.uid() to the farm for this username + password hash (matches app sha256 base64).
create or replace function public.link_farm_with_credentials(p_username text, p_password_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  n text := lower(trim(p_username));
  fid uuid;
  h text;
begin
  if n = '' or p_password_hash is null or length(trim(p_password_hash)) < 8 then
    return null;
  end if;
  select c.farm_id, c.password_hash
    into fid, h
  from public.farm_cloud_logins c
  where c.username_norm = n;
  if fid is null or h is null or h <> trim(p_password_hash) then
    return null;
  end if;
  insert into public.farm_members (farm_id, user_id, role)
  values (fid, auth.uid(), 'member')
  on conflict (farm_id, user_id) do nothing;
  return fid;
end;
$$;

-- Farm members (or farm creator) register/update cloud login for password-based linking.
create or replace function public.upsert_farm_cloud_login(p_farm_id uuid, p_username text, p_password_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n text := lower(trim(p_username));
begin
  if p_farm_id is null or n = '' or p_password_hash is null or length(trim(p_password_hash)) < 8 then
    raise exception 'invalid arguments';
  end if;
  if not public.is_farm_member(p_farm_id) and not exists (
    select 1 from public.farms f where f.id = p_farm_id and f.created_by = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;
  if exists (
    select 1 from public.farm_cloud_logins c
    where c.username_norm = n and c.farm_id is distinct from p_farm_id
  ) then
    raise exception 'username already registered to another farm';
  end if;
  insert into public.farm_cloud_logins (username_norm, farm_id, password_hash, updated_at)
  values (n, p_farm_id, trim(p_password_hash), now())
  on conflict (username_norm) do update set
    farm_id = excluded.farm_id,
    password_hash = excluded.password_hash,
    updated_at = now()
  where farm_cloud_logins.farm_id = excluded.farm_id;
end;
$$;

create or replace function public.delete_farm_cloud_login(p_farm_id uuid, p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n text := lower(trim(p_username));
begin
  if p_farm_id is null or n = '' then
    return;
  end if;
  if not public.is_farm_member(p_farm_id) and not exists (
    select 1 from public.farms f where f.id = p_farm_id and f.created_by = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;
  delete from public.farm_cloud_logins c
  where c.username_norm = n and c.farm_id = p_farm_id;
end;
$$;

grant execute on function public.link_farm_with_credentials(text, text) to authenticated;
grant execute on function public.upsert_farm_cloud_login(uuid, text, text) to authenticated;
grant execute on function public.delete_farm_cloud_login(uuid, text) to authenticated;
