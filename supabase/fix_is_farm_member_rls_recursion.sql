-- Fix: "stack depth limit exceeded" (54001) when selecting farms or farm_members.
--
-- Cause: public.is_farm_member() was SECURITY INVOKER. Evaluating farms_select /
-- farm_members_select calls is_farm_member → reads farm_members → same policies
-- call is_farm_member again → infinite recursion.
--
-- Run in Supabase SQL Editor once (after tenancy_rls.sql / join_farm.sql).
-- Replaces the helper so the membership lookup runs as the function owner and
-- does not re-enter RLS on farm_members.

create or replace function public.is_farm_member(farm uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.farm_members m
    where m.farm_id = farm and m.user_id = auth.uid()
  );
$$;

comment on function public.is_farm_member(uuid) is
  'RLS-safe membership check; SECURITY DEFINER avoids recursive policy evaluation on farm_members.';

grant execute on function public.is_farm_member(uuid) to authenticated;
