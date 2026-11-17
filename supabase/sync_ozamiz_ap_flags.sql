-- Ozamiz City: bring the saved AP flags (dashboard, printables) in line with
-- the AP matching results that /reports uses (asenso.ap_person_status;
-- Ozamiz rule: the voter's is_ap decides).
--
-- Nothing keeps these flags up to date: the app never sets them and
-- revoke_voter_ap only changes asenso.voters. Expected changes (2026-11-17):
--   person flags -> AP:      677 husbands, 907 wives, 1,439 members
--   person flags -> not AP:  61 husbands, 6 wives, 36 members (voter no longer AP)
--   families.has_ap_member:  dashboard Ozamiz AP families 37,935 -> 38,881 (= /reports)
-- People pending review (ap is null) and people with no match row are left as they are.
-- Other towns are not touched (the dashboard shows AP only for Ozamiz).
--
-- Run the whole file at once. ROLLBACK is at the bottom.

begin;

-- Backup of the current flags for every Ozamiz family and member.
create table asenso.ozamiz_ap_flags_backup_2026_11_17 as
select 'family' as kind, f.id, f.has_ap_member, f.is_husband_ap_member,
       f.is_wife_ap_member, null::boolean as is_ap_member
from asenso.families f
join asenso.households h on h.id = f.household_id
where upper(btrim(h.address)) = 'OZAMIZ CITY'
union all
select 'member', m.id, null, null, null, m.is_ap_member
from asenso.family_members m
join asenso.families f on f.id = m.family_id
join asenso.households h on h.id = f.household_id
where upper(btrim(h.address)) = 'OZAMIZ CITY';
alter table asenso.ozamiz_ap_flags_backup_2026_11_17 enable row level security;
revoke all on asenso.ozamiz_ap_flags_backup_2026_11_17 from anon, authenticated;

-- Person flags (only where the matching gave a yes/no).
update asenso.families f
set is_husband_ap_member = p.ap
from asenso.ap_person_status p, asenso.ozamiz_ap_flags_backup_2026_11_17 b
where b.kind = 'family' and b.id = f.id
  and p.person_type = 'husband' and p.person_id = f.id
  and p.ap is not null
  and f.is_husband_ap_member is distinct from p.ap;

update asenso.families f
set is_wife_ap_member = p.ap
from asenso.ap_person_status p, asenso.ozamiz_ap_flags_backup_2026_11_17 b
where b.kind = 'family' and b.id = f.id
  and p.person_type = 'wife' and p.person_id = f.id
  and p.ap is not null
  and f.is_wife_ap_member is distinct from p.ap;

update asenso.family_members m
set is_ap_member = p.ap
from asenso.ap_person_status p, asenso.ozamiz_ap_flags_backup_2026_11_17 b
where b.kind = 'member' and b.id = m.id
  and p.person_type = 'member' and p.person_id = m.id
  and p.ap is not null
  and m.is_ap_member is distinct from p.ap;

-- Family flag: same rule as /reports (any AP person in the family).
update asenso.families f
set has_ap_member = x.rep_ap
from (
  select p.family_id, coalesce(bool_or(p.ap), false) as rep_ap
  from asenso.ap_person_status p
  join asenso.ozamiz_ap_flags_backup_2026_11_17 b on b.kind = 'family' and b.id = p.family_id
  group by p.family_id
) x
where f.id = x.family_id
  and f.has_ap_member is distinct from x.rep_ap;

-- Check: every Ozamiz family with match rows now agrees with /reports.
do $$
declare n int;
begin
  select count(*) into n
  from (
    select f.id, f.has_ap_member, coalesce(bool_or(p.ap), false) as rep_ap
    from asenso.families f
    join asenso.ozamiz_ap_flags_backup_2026_11_17 b on b.kind = 'family' and b.id = f.id
    join asenso.ap_person_status p on p.family_id = f.id
    group by f.id, f.has_ap_member
  ) t
  where t.has_ap_member is distinct from t.rep_ap;
  if n > 0 then
    raise exception '% families still differ from /reports; nothing was changed', n;
  end if;
end $$;

commit;

-- Should show about 38,881 AP families for Ozamiz.
select total_families, total_with_ap_families, total_no_ap_families
from asenso.dashboard_counts_fast() where address = 'OZAMIZ CITY';

-- ROLLBACK
-- begin;
-- update asenso.families f
--   set has_ap_member = b.has_ap_member, is_husband_ap_member = b.is_husband_ap_member,
--       is_wife_ap_member = b.is_wife_ap_member
--   from asenso.ozamiz_ap_flags_backup_2026_11_17 b where b.kind = 'family' and b.id = f.id;
-- update asenso.family_members m set is_ap_member = b.is_ap_member
--   from asenso.ozamiz_ap_flags_backup_2026_11_17 b where b.kind = 'member' and b.id = m.id;
-- commit;
