-- Link "new identified registered" people to their matched voter, so they
-- stop showing as NR. Only the safe matches (~6,157 of 7,924):
--   * auto voter match from asenso.ap_match_results (new_identified_registered)
--   * the voter is matched to exactly one census person
--   * the voter is not already linked anywhere in the census
--   * the person is still NR in the census
--   * same barangay (allowing spelling differences, e.g. KAUSAWAGAN/KAUSWAGAN)
--   * first names close (typos only; TERRY/PERRY, RODOLFO/ADOLFO are left out)
--   * Jr/Sr/II/III present in both names or neither
-- Left for manual review: voters matched to 2+ people, very different first names.
--
-- What changes:
--   members         -> voter_id = matched voter, is_registered = true
--   husband / wife  -> families.husband_id / wife_id = matched voter
--   families.all_nr -> false for the families touched (someone is now registered)
-- Names are not changed. asenso.ap_match_results is not changed.
--
-- Run STEP 1, look at the counts, then STEP 2. ROLLBACK is at the bottom.

-- ============================================================ STEP 1
-- Snapshot of exactly what will be linked, with the old values (also the backup).
create table asenso.nr_link_2026_11_17 as
with cand as (
  select
    r.id as match_id, r.person_type, r.person_id, r.matched_voter_id as voter_id,
    r.fullname as census_name, v.fullname as voter_name,
    r.town, r.barangay as census_barangay, v.barangay as voter_barangay,
    btrim(regexp_replace(upper(regexp_replace(r.fullname, '[^A-Za-zÑñ ]', ' ', 'g')), '\s+', ' ', 'g')) as cn,
    btrim(regexp_replace(upper(regexp_replace(v.fullname, '[^A-Za-zÑñ ]', ' ', 'g')), '\s+', ' ', 'g')) as vn,
    count(*) over (partition by r.matched_voter_id) as voter_uses
  from asenso.ap_match_results r
  join asenso.voters v on v.id = r.matched_voter_id and v.deleted_at is null
  where r.new_identified_registered
    and r.voter_match_status = 'auto'
),
safe as (
  select * from cand
  where voter_uses = 1
    and public.similarity(replace(upper(census_barangay), ' ', ''),
                          replace(upper(voter_barangay), ' ', '')) >= 0.6
    and (split_part(cn, ' ', 2) = split_part(vn, ' ', 2)
         or public.similarity(split_part(cn, ' ', 2), split_part(vn, ' ', 2)) >= 0.4)
    and (cn ~ '\m(JR|SR|II|III|IV)\M') = (vn ~ '\m(JR|SR|II|III|IV)\M')
)
select
  s.match_id, s.person_type, s.person_id, s.voter_id,
  s.census_name, s.voter_name, s.town, s.census_barangay, s.voter_barangay,
  case when s.person_type = 'member' then m.family_id else s.person_id end as family_id,
  m.voter_id      as old_member_voter_id,
  m.is_registered as old_member_is_registered,
  f.husband_id    as old_husband_id,
  f.wife_id       as old_wife_id,
  f.all_nr        as old_all_nr
from safe s
left join asenso.family_members m
  on s.person_type = 'member' and m.id = s.person_id
join asenso.families f
  on f.id = case when s.person_type = 'member' then m.family_id else s.person_id end
where
  -- still NR in the census
  case s.person_type
    when 'member'  then m.is_registered is not true and m.voter_id is null
    when 'husband' then f.husband_id is null and f.husband_name is not null
    when 'wife'    then f.wife_id is null and f.wife_name is not null
    else false
  end
  -- voter not linked to anyone in the census
  and not exists (select 1 from asenso.families x where x.husband_id = s.voter_id or x.wife_id = s.voter_id)
  and not exists (select 1 from asenso.family_members x where x.voter_id = s.voter_id);

-- The snapshot is a backup table: keep it away from the API.
alter table asenso.nr_link_2026_11_17 enable row level security;
revoke all on asenso.nr_link_2026_11_17 from anon, authenticated;

-- Expect about 6,157 rows in total, each family_id filled in.
select person_type, count(*) as rows, count(family_id) as with_family
from asenso.nr_link_2026_11_17 group by 1 order by 1;

-- ============================================================ STEP 2
begin;

update asenso.family_members m
set voter_id = s.voter_id, is_registered = true
from asenso.nr_link_2026_11_17 s
where s.person_type = 'member' and m.id = s.person_id
  and m.voter_id is null;

update asenso.families f
set husband_id = s.voter_id
from asenso.nr_link_2026_11_17 s
where s.person_type = 'husband' and f.id = s.person_id
  and f.husband_id is null;

update asenso.families f
set wife_id = s.voter_id
from asenso.nr_link_2026_11_17 s
where s.person_type = 'wife' and f.id = s.person_id
  and f.wife_id is null;

update asenso.families f
set all_nr = false
where f.id in (select family_id from asenso.nr_link_2026_11_17)
  and f.all_nr is not false;

-- Check: every row must now be linked, else the whole step is undone.
do $$
declare n int;
begin
  select count(*) into n
  from asenso.nr_link_2026_11_17 s
  left join asenso.family_members m on s.person_type = 'member' and m.id = s.person_id
  join asenso.families f on f.id = s.family_id
  where case s.person_type
      when 'member'  then m.voter_id is distinct from s.voter_id or m.is_registered is not true
      when 'husband' then f.husband_id is distinct from s.voter_id
      when 'wife'    then f.wife_id is distinct from s.voter_id
    end;
  if n > 0 then
    raise exception '% rows did not link; nothing was changed', n;
  end if;
end $$;

commit;

-- ============================================================ ROLLBACK
-- Puts back the old values for the rows this script linked.
-- begin;
-- update asenso.family_members m
--   set voter_id = s.old_member_voter_id, is_registered = s.old_member_is_registered
--   from asenso.nr_link_2026_11_17 s
--   where s.person_type = 'member' and m.id = s.person_id and m.voter_id = s.voter_id;
-- update asenso.families f set husband_id = s.old_husband_id
--   from asenso.nr_link_2026_11_17 s
--   where s.person_type = 'husband' and f.id = s.person_id and f.husband_id = s.voter_id;
-- update asenso.families f set wife_id = s.old_wife_id
--   from asenso.nr_link_2026_11_17 s
--   where s.person_type = 'wife' and f.id = s.person_id and f.wife_id = s.voter_id;
-- update asenso.families f set all_nr = s.old_all_nr
--   from (select distinct family_id, old_all_nr from asenso.nr_link_2026_11_17) s
--   where f.id = s.family_id;
-- commit;
