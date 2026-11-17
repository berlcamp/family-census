-- Faster dashboard counts.
--
-- Same columns and results as asenso.barangay_stats(address_param) and
-- asenso.dashboard_counts_per_barangay(), which are left unchanged (other
-- code may call them). The originals join households x families x members
-- into one big row set and then COUNT(DISTINCT ...) it; these count each
-- table separately and join the small per-barangay totals.
-- Read-only (stable, security invoker).

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
  ),
  -- Families with at least one person encoded (as in barangay_stats).
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
    coalesce(sum(f.families), 0)::bigint,
    coalesce(sum(f.all_nr), 0)::bigint,
    coalesce(sum(f.no_ap), 0)::bigint,
    coalesce(sum(f.with_ap), 0)::bigint,
    count(*) filter (where f.every_family_nr)::bigint
  from asenso.households h
  left join f on f.household_id = h.id
  where h.address in (
    'SAPANG DALAGA','LOPEZ JAENA','BONIFACIO','ALORAN','CALAMBA','PLARIDEL',
    'JIMENEZ','CLARIN','PANAON','DON VICTORIANO CHIONGBIAN','TUDELA',
    'BALIANGAO','SINACABAN','CITY OF OROQUIETA','OZAMIZ CITY',
    'CONCEPCION','CITY OF TANGUB'
  )
  group by h.address
  order by h.address;
$$;
