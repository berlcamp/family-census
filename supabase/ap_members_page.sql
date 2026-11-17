-- AP Members page (/ap-members): one page of AP people in the census for a
-- municipality, optionally narrowed to a barangay and a name search.
--
-- "AP" is the same rule as asenso.ap_person_status (/reports): the CASE below
-- is copied from that view so the town index on ap_match_results can be used
-- (~0.4s for all of Ozamiz instead of ~3.5s through the view). Keep both in sync.
--
-- Names and addresses come from the live census tables, so renamed people show
-- their current name and deleted households drop out.
-- Read-only. Server only (called from app/api/ap-members with the service role).

create or replace function asenso.ap_members_page(
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
  total_count  bigint
)
language sql
stable
set work_mem = '64MB'
as $$
  with r as (
    select r.person_type, r.person_id
    from asenso.ap_match_results r
    where r.town = p_town
      and case
        when r.is_ap is not null then r.is_ap
        when r.review_decision = 'reject' then false
        when r.review_decision = 'accept' and r.em_match_status = 'review' then true
        when r.review_decision = 'accept' and r.voter_match_status = 'review' then
          (select coalesce(v.is_ap, false) and not coalesce(v.ap_revoked, false)
           from asenso.voters v where v.id = r.matched_voter_id)
      end
  ),
  x as (
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
      h.id as household_id
    from r
    left join asenso.family_members m
      on r.person_type = 'member' and m.id = r.person_id
    join asenso.families f
      on f.id = case when r.person_type = 'member' then m.family_id else r.person_id end
    join asenso.households h on h.id = f.household_id
    where h.address = p_town
      and (nullif(btrim(p_barangay), '') is null or h.barangay = p_barangay)
  )
  select x.person_type, x.person_id, x.fullname, x.barangay, x.municipality,
         x.household_id, count(*) over () as total_count
  from x
  where x.fullname is not null and x.fullname <> ''
    -- every typed word must appear in the name (any order)
    and not exists (
      select 1
      from regexp_split_to_table(upper(btrim(coalesce(p_q, ''))), '\s+') w
      where w <> '' and position(w in upper(x.fullname)) = 0
    )
  order by x.fullname, x.person_type, x.person_id
  limit greatest(least(p_limit, 100), 1)
  offset greatest(p_offset, 0);
$$;

revoke all on function asenso.ap_members_page(text, text, text, int, int) from public, anon, authenticated;
grant execute on function asenso.ap_members_page(text, text, text, int, int) to service_role;

notify pgrst, 'reload schema';

-- Rollback:
-- drop function asenso.ap_members_page(text, text, text, int, int);
