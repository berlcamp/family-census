-- AP Members page (/ap-members): for OZAMIZ CITY, AP status comes from
-- asenso.voters (is_ap, not revoked), not from existing_members.
--
--   In the census:  Ozamiz people who are AP only through an existing_members
--                   match (their voter is not AP) are left out. 684 people
--                   on 2026-11-18. They are kept in a small saved list,
--                   asenso.ap_members_ozamiz_not_voter_ap (checking each
--                   person live took ~4 s per page).
--   On the AP lists: Ozamiz rows only when they come from the voters list
--                   (82,513 of 156,836 on 2026-11-18); the AP-list /
--                   registration sources and details are not shown for them.
--
-- Other municipalities are unchanged. /reports, the dashboard and the AP
-- badges are not changed by this file.
--
-- Additive: one new small materialized view; the two page functions are
-- replaced with the same signature (old definitions in ROLLBACK).
-- Run the whole file once in the SQL editor (a few seconds).
--
-- REFRESH BY HAND, now three, in this order:
--   refresh materialized view concurrently asenso.ap_members_list;
--   refresh materialized view concurrently asenso.ap_members_ozamiz_not_voter_ap;
--   refresh materialized view concurrently asenso.ap_list_members;

begin;

create materialized view if not exists asenso.ap_members_ozamiz_not_voter_ap as
select l.person_type, l.person_id
from asenso.ap_members_list l
join asenso.ap_match_results r
  on r.person_type = l.person_type and r.person_id = l.person_id
left join asenso.voters v
  on v.id = coalesce(r.matched_voter_id, r.linked_voter_id)
where l.municipality = 'OZAMIZ CITY'
  and not (coalesce(v.is_ap, false) and not coalesce(v.ap_revoked, false));

create unique index if not exists ap_members_ozamiz_not_voter_ap_idx
  on asenso.ap_members_ozamiz_not_voter_ap (person_type, person_id);

revoke all on asenso.ap_members_ozamiz_not_voter_ap from public, anon, authenticated;
grant select on asenso.ap_members_ozamiz_not_voter_ap to service_role;

-- ------------------------------------------------------------ census
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
  refreshed_at timestamptz,
  total_count  bigint
)
language plpgsql
stable
as $function$
declare
  v_words text[];
  v_brgy  text := nullif(btrim(p_barangay), '');
  v_lim   int  := greatest(least(p_limit, 100), 1);
  v_off   int  := greatest(p_offset, 0);
begin
  select coalesce(array_agg(x order by length(x) desc), '{}') into v_words
  from regexp_split_to_table(upper(btrim(coalesce(p_q, ''))), '\s+') x
  where x <> '';

  if cardinality(v_words) = 0 then
    return query
    select l.person_type, l.person_id, l.fullname, l.barangay, l.municipality,
           l.household_id, l.refreshed_at, count(*) over ()
    from asenso.ap_members_list l
    where (p_town is null or l.municipality = p_town)
      and (v_brgy is null or l.barangay = v_brgy)
      -- Ozamiz: the voter's is_ap decides
      and not exists (select 1 from asenso.ap_members_ozamiz_not_voter_ap x
                      where x.person_type = l.person_type and x.person_id = l.person_id)
    order by l.fullname, l.person_type, l.person_id
    limit v_lim offset v_off;
  else
    return query
    select l.person_type, l.person_id, l.fullname, l.barangay, l.municipality,
           l.household_id, l.refreshed_at, count(*) over ()
    from asenso.ap_members_list l
    where l.fullname ilike '%' || v_words[1] || '%'
      and (p_town is null or l.municipality = p_town)
      and (v_brgy is null or l.barangay = v_brgy)
      and not exists (select 1 from unnest(v_words) x
                      where position(x in upper(l.fullname)) = 0)
      and not exists (select 1 from asenso.ap_members_ozamiz_not_voter_ap x
                      where x.person_type = l.person_type and x.person_id = l.person_id)
    order by l.fullname, l.person_type, l.person_id
    limit v_lim offset v_off;
  end if;
end;
$function$;

-- ------------------------------------------------------------ AP lists
create or replace function asenso.ap_list_members_page(
  p_town          text,
  p_barangay      text    default null,
  p_q             text    default null,
  p_not_in_census boolean default false,
  p_limit         int     default 25,
  p_offset        int     default 0
)
returns table(
  fullname     text,
  barangay     text,
  municipality text,
  sources      text[],
  details      text[],
  household_id bigint,
  refreshed_at timestamptz,
  total_count  bigint
)
language plpgsql
stable
as $function$
declare
  v_words text[];
  v_brgy  text    := nullif(btrim(p_barangay), '');
  v_only  boolean := coalesce(p_not_in_census, false);
  v_lim   int     := greatest(least(p_limit, 100), 1);
  v_off   int     := greatest(p_offset, 0);
begin
  select coalesce(array_agg(x order by length(x) desc), '{}') into v_words
  from regexp_split_to_table(upper(btrim(coalesce(p_q, ''))), '\s+') x
  where x <> '';

  -- Ozamiz: voters list only (sources/details from the other lists hidden).
  if cardinality(v_words) = 0 then
    return query
    select l.fullname, l.barangay, l.municipality,
           case when l.municipality = 'OZAMIZ CITY'
                then array['Voters list (AP)'] else l.sources end,
           case when l.municipality = 'OZAMIZ CITY'
                then '{}'::text[] else l.details end,
           l.household_id, l.refreshed_at, count(*) over ()
    from asenso.ap_list_members l
    where (p_town is null or l.municipality = p_town)
      and (v_brgy is null or l.barangay = v_brgy)
      and (not v_only or l.household_id is null)
      and (l.municipality <> 'OZAMIZ CITY' or 'Voters list (AP)' = any (l.sources))
    order by l.fullname, l.municipality, l.bkey
    limit v_lim offset v_off;
  else
    return query
    select l.fullname, l.barangay, l.municipality,
           case when l.municipality = 'OZAMIZ CITY'
                then array['Voters list (AP)'] else l.sources end,
           case when l.municipality = 'OZAMIZ CITY'
                then '{}'::text[] else l.details end,
           l.household_id, l.refreshed_at, count(*) over ()
    from asenso.ap_list_members l
    where l.fullname ilike '%' || v_words[1] || '%'
      and (p_town is null or l.municipality = p_town)
      and (v_brgy is null or l.barangay = v_brgy)
      and (not v_only or l.household_id is null)
      and (l.municipality <> 'OZAMIZ CITY' or 'Voters list (AP)' = any (l.sources))
      and not exists (select 1 from unnest(v_words) x
                      where position(x in upper(l.fullname)) = 0)
    order by l.fullname, l.municipality, l.bkey
    limit v_lim offset v_off;
  end if;
end;
$function$;

-- Same privileges as before (create or replace keeps them; restated for safety).
revoke all on function asenso.ap_members_page(text, text, text, int, int) from public, anon, authenticated;
grant execute on function asenso.ap_members_page(text, text, text, int, int) to service_role;
revoke all on function asenso.ap_list_members_page(text, text, text, boolean, int, int) from public, anon, authenticated;
grant execute on function asenso.ap_list_members_page(text, text, text, boolean, int, int) to service_role;

-- Check: the left-out list is about the expected size (684 on 2026-11-18).
do $$
declare n bigint;
begin
  select count(*) into n from asenso.ap_members_ozamiz_not_voter_ap;
  if n > 5000 then
    raise exception 'unexpected: % Ozamiz census AP people without an AP voter', n;
  end if;
  raise notice 'Ozamiz census AP people left out: %', n;
end $$;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- ROLLBACK: back to the previous page functions, then drop the saved list.
--
-- begin;
-- create or replace function asenso.ap_members_page(p_town text, p_barangay text default null, p_q text default null, p_limit int default 25, p_offset int default 0)
-- returns table(person_type text, person_id bigint, fullname text, barangay text, municipality text, household_id bigint, refreshed_at timestamptz, total_count bigint)
-- language plpgsql stable as $function$
-- declare
--   v_words text[];
--   v_brgy  text := nullif(btrim(p_barangay), '');
--   v_lim   int  := greatest(least(p_limit, 100), 1);
--   v_off   int  := greatest(p_offset, 0);
-- begin
--   select coalesce(array_agg(x order by length(x) desc), '{}') into v_words
--   from regexp_split_to_table(upper(btrim(coalesce(p_q, ''))), '\s+') x where x <> '';
--   if cardinality(v_words) = 0 then
--     return query
--     select l.person_type, l.person_id, l.fullname, l.barangay, l.municipality,
--            l.household_id, l.refreshed_at, count(*) over ()
--     from asenso.ap_members_list l
--     where (p_town is null or l.municipality = p_town)
--       and (v_brgy is null or l.barangay = v_brgy)
--     order by l.fullname, l.person_type, l.person_id
--     limit v_lim offset v_off;
--   else
--     return query
--     select l.person_type, l.person_id, l.fullname, l.barangay, l.municipality,
--            l.household_id, l.refreshed_at, count(*) over ()
--     from asenso.ap_members_list l
--     where l.fullname ilike '%' || v_words[1] || '%'
--       and (p_town is null or l.municipality = p_town)
--       and (v_brgy is null or l.barangay = v_brgy)
--       and not exists (select 1 from unnest(v_words) x where position(x in upper(l.fullname)) = 0)
--     order by l.fullname, l.person_type, l.person_id
--     limit v_lim offset v_off;
--   end if;
-- end;
-- $function$;
--
-- create or replace function asenso.ap_list_members_page(p_town text, p_barangay text default null, p_q text default null, p_not_in_census boolean default false, p_limit int default 25, p_offset int default 0)
-- returns table(fullname text, barangay text, municipality text, sources text[], details text[], household_id bigint, refreshed_at timestamptz, total_count bigint)
-- language plpgsql stable as $function$
-- declare
--   v_words text[];
--   v_brgy  text    := nullif(btrim(p_barangay), '');
--   v_only  boolean := coalesce(p_not_in_census, false);
--   v_lim   int     := greatest(least(p_limit, 100), 1);
--   v_off   int     := greatest(p_offset, 0);
-- begin
--   select coalesce(array_agg(x order by length(x) desc), '{}') into v_words
--   from regexp_split_to_table(upper(btrim(coalesce(p_q, ''))), '\s+') x where x <> '';
--   if cardinality(v_words) = 0 then
--     return query
--     select l.fullname, l.barangay, l.municipality, l.sources, l.details,
--            l.household_id, l.refreshed_at, count(*) over ()
--     from asenso.ap_list_members l
--     where (p_town is null or l.municipality = p_town)
--       and (v_brgy is null or l.barangay = v_brgy)
--       and (not v_only or l.household_id is null)
--     order by l.fullname, l.municipality, l.bkey
--     limit v_lim offset v_off;
--   else
--     return query
--     select l.fullname, l.barangay, l.municipality, l.sources, l.details,
--            l.household_id, l.refreshed_at, count(*) over ()
--     from asenso.ap_list_members l
--     where l.fullname ilike '%' || v_words[1] || '%'
--       and (p_town is null or l.municipality = p_town)
--       and (v_brgy is null or l.barangay = v_brgy)
--       and (not v_only or l.household_id is null)
--       and not exists (select 1 from unnest(v_words) x where position(x in upper(l.fullname)) = 0)
--     order by l.fullname, l.municipality, l.bkey
--     limit v_lim offset v_off;
--   end if;
-- end;
-- $function$;
--
-- drop materialized view asenso.ap_members_ozamiz_not_voter_ap;
-- commit;
