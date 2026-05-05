-- Multi-device: join an existing farm with a short join code (run after fix_farms_rls_v2.sql).
-- The farm owner’s device generates/stores `join_code`; other devices call `join_farm` before sync.

alter table public.farms add column if not exists join_code text;

drop policy if exists farms_update_creator on public.farms;
create policy farms_update_creator on public.farms
as permissive
for update to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create or replace function public.join_farm(p_farm_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_farm_id is null or p_code is null or length(trim(p_code)) < 4 then
    return false;
  end if;
  if not exists (
    select 1
    from public.farms f
    where f.id = p_farm_id
      and f.join_code is not null
      and lower(trim(f.join_code)) = lower(trim(p_code))
  ) then
    return false;
  end if;
  insert into public.farm_members (farm_id, user_id, role)
  values (p_farm_id, auth.uid(), 'member')
  on conflict (farm_id, user_id) do nothing;
  return true;
end;
$$;

grant execute on function public.join_farm(uuid, text) to authenticated;
