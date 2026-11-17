-- Summaries and reports count only households that have at least one family
-- (same rule as the households page, which hides empty households).
-- All read-only. barangay_stats / dashboard_counts_per_barangay /
-- barangay_overview_stats (older, possibly used elsewhere) are unchanged.

-- Dashboard, per barangay.
create or replace function asenso.barangay_stats_fast(address_param text)
returns table(
  barangay text, households bigint, families bigint, sps bigint,
  total_registered bigint, total_non_registered bigint, all_c bigint,
  all_c_ap bigint, total_ap_membership_true bigint,
  total_ap_membership_false bigint)
language sql
stable
as $$
  with loc as (
    select id, name from asenso.locations
    where address ilike '%' || address_param || '%'
  ),
  hh as (
    select h.id, h.sp_id, l.name as brgy
    from asenso.households h
    join loc l on h.location_id = l.id and h.barangay = l.name
    where exists (select 1 from asenso.families f where f.household_id = h.id)
  ),
  fam as (
    select f.id, f.husband_id, f.wife_id, f.all_nr, f.all_c,
           f.has_ap_member, hh.brgy
    from asenso.families f
    join hh on f.household_id = hh.id
    where f.husband_name is not null
       or f.wife_name is not null
       or exists (select 1 from asenso.family_members m where m.family_id = f.id)
  ),
  h_agg as (
    select brgy, count(distinct id) as households, count(distinct sp_id) as sps
    from hh group by brgy
  ),
  f_agg as (
    select brgy,
      count(*) as families,
      count(distinct husband_id) as husbands,
      count(distinct wife_id) as wives,
      count(*) filter (where all_nr = true) as all_nr,
      count(*) filter (where all_c = true) as all_c,
      count(*) filter (where has_ap_member = true and all_c = true) as all_c_ap,
      count(*) filter (where has_ap_member = true) as ap_true,
      count(*) filter (where has_ap_member is not true) as ap_false
    from fam group by brgy
  ),
  m_agg as (
    select fam.brgy, count(distinct m.voter_id) as member_voters
    from asenso.family_members m
    join fam on m.family_id = fam.id
    group by fam.brgy
  )
  select
    n.name,
    coalesce(h.households, 0),
    coalesce(f.families, 0),
    coalesce(h.sps, 0),
    coalesce(f.husbands, 0) + coalesce(f.wives, 0) + coalesce(m.member_voters, 0),
    coalesce(f.all_nr, 0),
    coalesce(f.all_c, 0),
    coalesce(f.all_c_ap, 0),
    coalesce(f.ap_true, 0),
    coalesce(f.ap_false, 0)
  from (select distinct name from loc) n
  left join h_agg h on h.brgy = n.name
  left join f_agg f on f.brgy = n.name
  left join m_agg m on m.brgy = n.name
  order by n.name;
$$;

-- Dashboard, per municipality.
create or replace function asenso.dashboard_counts_fast()
returns table(
  address text, total_households bigint, total_families bigint,
  total_all_nr_families bigint, total_no_ap_families bigint,
  total_with_ap_families bigint, total_households_all_nr bigint)
language sql
stable
as $$
  with f as (
    select household_id,
      count(*) as families,
      count(*) filter (where all_nr = true) as all_nr,
      count(*) filter (where has_ap_member is not true) as no_ap,
      count(*) filter (where has_ap_member = true) as with_ap,
      bool_and(all_nr = true) as every_family_nr
    from asenso.families
    group by household_id
  )
  select
    h.address,
    count(*)::bigint,
    sum(f.families)::bigint,
    sum(f.all_nr)::bigint,
    sum(f.no_ap)::bigint,
    sum(f.with_ap)::bigint,
    count(*) filter (where f.every_family_nr)::bigint
  from asenso.households h
  join f on f.household_id = h.id          -- households with a family only
  where h.address in (
    'SAPANG DALAGA','LOPEZ JAENA','BONIFACIO','ALORAN','CALAMBA','PLARIDEL',
    'JIMENEZ','CLARIN','PANAON','DON VICTORIANO CHIONGBIAN','TUDELA',
    'BALIANGAO','SINACABAN','CITY OF OROQUIETA','OZAMIZ CITY',
    'CONCEPCION','CITY OF TANGUB'
  )
  group by h.address
  order by h.address;
$$;

-- Barangay Overview tab graph (new; barangay_overview_stats is unchanged).
create or replace function asenso.barangay_overview_stats_fast(location_id_param bigint)
returns table(
  barangay text, total_households bigint, total_families bigint,
  total_voters bigint, total_non_registered bigint)
language sql
stable
as $$
  with hh as (
    select h.id from asenso.households h
    where h.location_id = location_id_param
      and exists (select 1 from asenso.families f where f.household_id = h.id)
  ),
  fam as (
    select f.id, f.husband_id, f.wife_id, f.all_nr
    from asenso.families f
    join hh on f.household_id = hh.id
    where f.husband_name is not null
       or f.wife_name is not null
       or exists (select 1 from asenso.family_members m where m.family_id = f.id)
  )
  select
    l.name,
    (select count(*) from hh),
    (select count(*) from fam),
    (select count(distinct husband_id) from fam)
      + (select count(distinct wife_id) from fam)
      + (select count(distinct m.voter_id) from asenso.family_members m join fam on fam.id = m.family_id),
    (select count(*) from fam where all_nr = true)
  from asenso.locations l
  where l.id = location_id_param;
$$;

-- Reports: AP family summary.
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
  where exists (select 1 from asenso.families f where f.household_id = h.id)
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

revoke all on asenso.ap_family_summary from anon, authenticated;
revoke all on function asenso.barangay_overview_stats_fast(bigint) from anon;
