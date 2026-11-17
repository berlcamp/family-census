-- Households page "AP households only" toggle: the ids of the households in a
-- location (barangay) that have at least one AP person (husband, wife or
-- member), using asenso.ap_person_status (same AP rule as /reports and the
-- AP badges). ~40ms for the largest barangay (2,340 households).
-- Returns one array (not a set of rows) so the API's 1,000-row cap never cuts it.
-- Read-only. Server only (called from app/api/ap-households with the service role).

create or replace function asenso.ap_household_ids(p_location_id bigint)
returns bigint[]
language sql
stable
as $$
  select coalesce(array_agg(h.id order by h.id desc), '{}')
  from asenso.households h
  where h.location_id = p_location_id
    and exists (
      select 1 from asenso.families f
      where f.household_id = h.id
        and (
          exists (select 1 from asenso.ap_person_status s
                  where s.person_type in ('husband', 'wife')
                    and s.person_id = f.id and s.ap)
          or exists (select 1 from asenso.family_members m
                     join asenso.ap_person_status s
                       on s.person_type = 'member' and s.person_id = m.id
                     where m.family_id = f.id and s.ap)
        )
    );
$$;

revoke all on function asenso.ap_household_ids(bigint) from public, anon, authenticated;
grant execute on function asenso.ap_household_ids(bigint) to service_role;

notify pgrst, 'reload schema';

-- Rollback:
-- drop function asenso.ap_household_ids(bigint);
