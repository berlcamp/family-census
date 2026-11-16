-- AP family summary per municipality / barangay.
--
-- Built on asenso.ap_match_results (see scripts/ap-match). Reflects review
-- decisions as they are made, so numbers move from "pending" to "with AP" /
-- "without AP" as admins clear reviews.
--
-- A family has an AP member when its husband, wife or any family member is AP.
-- It has no AP member when every encoded person is confirmed not AP (a family
-- with nobody encoded counts here too). Otherwise it is pending review.

create or replace view asenso.ap_person_status
with (security_invoker = true)
as
select
  r.person_type,
  r.person_id,
  case when r.person_type = 'member' then fm.family_id else r.person_id end as family_id,
  r.linked_voter_id,
  r.ap_source,
  r.new_identified_registered,
  r.possible_duplicate,
  case
    when r.is_ap is not null then r.is_ap
    when r.review_decision = 'reject' then false
    when r.review_decision = 'accept' and r.em_match_status = 'review' then true
    -- Ozamiz: an accepted voter match takes that voter's is_ap.
    when r.review_decision = 'accept' and r.voter_match_status = 'review' then
      (select coalesce(v.is_ap, false) and not coalesce(v.ap_revoked, false)
       from asenso.voters v where v.id = r.matched_voter_id)
    else null
  end as ap
from asenso.ap_match_results r
left join asenso.family_members fm
  on r.person_type = 'member' and fm.id = r.person_id;

create or replace view asenso.ap_family_summary
with (security_invoker = true)
as
with fam as (
  select
    f.id,
    f.household_id,
    coalesce(bool_or(p.ap), false)                             as has_ap,
    coalesce(bool_and(p.ap is not null), true)                 as all_decided,
    count(p.*) filter (where p.ap)                             as ap_people,
    count(p.*) filter (where p.ap and p.linked_voter_id is null
                         and p.ap_source = 'non_registered_ap') as ap_non_registered,
    count(p.*) filter (where p.new_identified_registered)      as new_registered,
    count(p.*) filter (where p.possible_duplicate)             as possible_duplicates
  from asenso.families f
  left join asenso.ap_person_status p on p.family_id = f.id
  group by f.id, f.household_id
),
hh as (
  select
    h.id,
    upper(btrim(coalesce(h.address, '')))  as municipality,
    upper(btrim(coalesce(h.barangay, ''))) as barangay
  from asenso.households h
)
select
  hh.municipality,
  hh.barangay,
  count(distinct hh.id)                                        as households,
  count(fam.id)                                                as families,
  count(fam.id) filter (where fam.has_ap)                      as families_with_ap,
  count(fam.id) filter (where not fam.has_ap and fam.all_decided)     as families_without_ap,
  count(fam.id) filter (where not fam.has_ap and not fam.all_decided) as families_pending_review,
  count(distinct fam.household_id) filter (where fam.has_ap)   as households_with_ap,
  coalesce(sum(fam.ap_people), 0)                              as ap_people,
  coalesce(sum(fam.ap_non_registered), 0)                      as ap_non_registered,
  coalesce(sum(fam.new_registered), 0)                         as new_identified_registered,
  coalesce(sum(fam.possible_duplicates), 0)                    as possible_duplicates
from hh
left join fam on fam.household_id = hh.id
group by hh.municipality, hh.barangay;

-- Server-side only, like the tables underneath.
revoke all on asenso.ap_person_status  from anon, authenticated;
revoke all on asenso.ap_family_summary from anon, authenticated;
