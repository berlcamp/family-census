-- After link_new_identified_registered.sql: update asenso.ap_match_results for
-- the 6,157 people just linked, the same way a full ap-match re-run would
-- (scripts/ap-match/run.mjs: a linked person is not re-checked against voters,
-- so new_identified_registered / possible_duplicate / voter match fields are null).
-- is_ap and ap_source are unchanged: the re-run would use the same voter.
-- Effect on /reports: "New identified registered" drops by 6,157. AP counts stay the same.

begin;

-- Backup of the rows' current match fields.
create table asenso.nr_link_2026_11_17_match_backup as
select r.id, r.linked_voter_id, r.matched_voter_id, r.voter_match_status,
       r.voter_match_reason, r.voter_in_census_elsewhere,
       r.new_identified_registered, r.possible_duplicate
from asenso.ap_match_results r
where r.id in (select match_id from asenso.nr_link_2026_11_17);
alter table asenso.nr_link_2026_11_17_match_backup enable row level security;
revoke all on asenso.nr_link_2026_11_17_match_backup from anon, authenticated;

update asenso.ap_match_results r
set linked_voter_id           = s.voter_id,
    matched_voter_id          = null,
    voter_match_status        = null,
    voter_match_reason        = null,
    voter_in_census_elsewhere = null,
    new_identified_registered = null,
    possible_duplicate        = null
from asenso.nr_link_2026_11_17 s
where r.id = s.match_id
  and r.linked_voter_id is null
  and r.matched_voter_id = s.voter_id;

do $$
declare n int;
begin
  select count(*) into n
  from asenso.nr_link_2026_11_17 s
  join asenso.ap_match_results r on r.id = s.match_id
  where r.linked_voter_id = s.voter_id;
  if n <> (select count(*) from asenso.nr_link_2026_11_17) then
    raise exception 'only % of % rows updated; nothing was changed', n,
      (select count(*) from asenso.nr_link_2026_11_17);
  end if;
end $$;

commit;

-- Should now be ~1,767.
select count(*) as new_identified_registered_left
from asenso.ap_match_results where new_identified_registered;

-- ROLLBACK (restores the match fields from the backup)
-- update asenso.ap_match_results r
-- set linked_voter_id = b.linked_voter_id, matched_voter_id = b.matched_voter_id,
--     voter_match_status = b.voter_match_status, voter_match_reason = b.voter_match_reason,
--     voter_in_census_elsewhere = b.voter_in_census_elsewhere,
--     new_identified_registered = b.new_identified_registered, possible_duplicate = b.possible_duplicate
-- from asenso.nr_link_2026_11_17_match_backup b where r.id = b.id;
