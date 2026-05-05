-- Cross-device "Reset all data" (cloud + local business data).
-- Deletes all events for a farm, then inserts a single reset marker event so other devices clear local data too.
-- Keeps: farms, farm_members, farm_cloud_logins (so username/password login still works).

create or replace function public.reset_farm_data(p_farm_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean := false;
  v_event_id uuid := gen_random_uuid();
begin
  if p_farm_id is null then
    raise exception 'invalid farm id';
  end if;

  -- Allow farm creator or any farm member.
  v_allowed := public.is_farm_member(p_farm_id) or exists (
    select 1 from public.farms f where f.id = p_farm_id and f.created_by = auth.uid()
  );
  if not v_allowed then
    raise exception 'not allowed';
  end if;

  -- Delete cloud business history.
  delete from public.events e where e.farm_id = p_farm_id;

  -- Broadcast marker event (so other devices clear local data on pull/realtime).
  insert into public.events (id, farm_id, device_id, created_at, entity_type, entity_id, op, payload)
  values (
    v_event_id,
    p_farm_id,
    'server',
    now(),
    'farm.reset',
    p_farm_id::text,
    'create',
    jsonb_build_object('farmId', p_farm_id::text, 'resetAt', now())
  );
end;
$$;

grant execute on function public.reset_farm_data(uuid) to authenticated;

