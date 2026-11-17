-- AP Members page: a saved, indexed list of AP people in the census, so the
-- page never has to scan the census tables. The live version
-- (ap_members_page.sql) timed out when the shared database had to read
-- families / family_members from disk (~1ms per block).
--
-- REFRESH BY HAND (SQL editor, ~15-30s) whenever you want it updated, e.g.
-- after the AP matching runs or after a lot of encoding:
--
--   refresh materialized view concurrently asenso.ap_members_list;
--
-- The page shows when the list was last refreshed. The "View family" modal
-- always reads live data.
--
-- Same AP rule as asenso.ap_person_status (/reports). Server only.
-- Run the whole file once. Rollback at the bottom.

create materialized view asenso.ap_members_list as
select
  r.person_type,
  r.person_id,
  btrim(case r.person_type
    when 'husband' then f.husband_name
    when 'wife'    then f.wife_name
    else m.fullname
  end) as fullname,
  h.barangay,
  h.address as municipality,
  h.id as household_id,
  now() as refreshed_at
from asenso.ap_match_results r
left join asenso.family_members m
  on r.person_type = 'member' and m.id = r.person_id
join asenso.families f
  on f.id = case when r.person_type = 'member' then m.family_id else r.person_id end
join asenso.households h on h.id = f.household_id
where case
    when r.is_ap is not null then r.is_ap
    when r.review_decision = 'reject' then false
    when r.review_decision = 'accept' and r.em_match_status = 'review' then true
    when r.review_decision = 'accept' and r.voter_match_status = 'review' then
      (select coalesce(v.is_ap, false) and not coalesce(v.ap_revoked, false)
       from asenso.voters v where v.id = r.matched_voter_id)
  end
  and nullif(btrim(case r.person_type
    when 'husband' then f.husband_name
    when 'wife'    then f.wife_name
    else m.fullname
  end), '') is not null;

-- Needed for "refresh ... concurrently" (the page keeps working during a refresh).
create unique index ap_members_list_person_idx
  on asenso.ap_members_list (person_type, person_id);
-- One page of a municipality / barangay, in name order.
create index ap_members_list_town_name_idx
  on asenso.ap_members_list (municipality, fullname, person_type, person_id);
create index ap_members_list_brgy_name_idx
  on asenso.ap_members_list (municipality, barangay, fullname, person_type, person_id);

analyze asenso.ap_members_list;

-- Materialized views ignore RLS: keep it away from the public API.
revoke all on asenso.ap_members_list from public, anon, authenticated;
grant select on asenso.ap_members_list to service_role;

-- The page function now reads the saved list (adds refreshed_at).
drop function if exists asenso.ap_members_page(text, text, text, int, int);
create function asenso.ap_members_page(
  p_town     text,
  p_barangay text default null,
  p_q        text default null,
  p_limit    int  default 25,
  p_offset   int  default 0
)
returns table(
  person_type  text,
  person_id    bigint,
  fullname     text,
  barangay     text,
  municipality text,
  household_id bigint,
  refreshed_at timestamptz,
  total_count  bigint
)
language sql
stable
as $$
  select l.person_type, l.person_id, l.fullname, l.barangay, l.municipality,
         l.household_id, l.refreshed_at, count(*) over () as total_count
  from asenso.ap_members_list l
  where l.municipality = p_town
    and (nullif(btrim(p_barangay), '') is null or l.barangay = p_barangay)
    -- every typed word must appear in the name (any order)
    and not exists (
      select 1
      from regexp_split_to_table(upper(btrim(coalesce(p_q, ''))), '\s+') w
      where w <> '' and position(w in upper(l.fullname)) = 0
    )
  order by l.fullname, l.person_type, l.person_id
  limit greatest(least(p_limit, 100), 1)
  offset greatest(p_offset, 0);
$$;

revoke all on function asenso.ap_members_page(text, text, text, int, int) from public, anon, authenticated;
grant execute on function asenso.ap_members_page(text, text, text, int, int) to service_role;

notify pgrst, 'reload schema';

-- Check: AP people per municipality in the saved list.
select municipality, count(*) as ap_people, max(refreshed_at) as refreshed_at
from asenso.ap_members_list group by 1 order by 1;

-- ROLLBACK (back to the live version): run supabase/ap_members_page.sql again
-- after the drop below, which recreates the old function.
-- drop function asenso.ap_members_page(text, text, text, int, int);
-- drop materialized view asenso.ap_members_list;
