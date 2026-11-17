-- AP Members search page (/ap-members), two kinds of results:
--   1. In the family census: asenso.ap_members_list (already exists)
--   2. On the AP lists: public.existing_members + public.members (Misamis
--      Occidental) + asenso.voters (is_ap), one row per person per barangay,
--      flagged when the person is also in the census.
--
-- Everything is additive: helper functions, a new saved list, search indexes
-- and the page functions. Nothing in the census or the AP lists is changed.
--
-- RUN IN TWO STEPS (the SQL editor gives up after ~2 minutes):
--   STEP 1: from "STEP 1" down to "notify pgrst" (a few seconds).
--           One transaction: if it fails, nothing is created.
--   STEP 2: the fill block below it (~1 minute). If it times out, run it again.
--
-- REFRESH BY HAND later (SQL editor), census list first:
--   refresh materialized view concurrently asenso.ap_members_list;
--   refresh materialized view concurrently asenso.ap_list_members;
--
-- Rollback at the bottom.

-- ============================================================ STEP 1
begin;

-- ------------------------------------------------------------ helpers
-- Town key in the AP matcher's format (scripts/ap-match: townKey), for
-- asenso.barangay_aliases: 'City of Ozamiz' = 'ozamiz'.
-- All helpers are single expressions (no FROM), immutable and parallel safe,
-- so Postgres inlines them into the query instead of calling them per row.
create or replace function asenso.ap_town_key(raw text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(
           lower(coalesce(raw, '')), '[^a-z0-9ñ]+', ' ', 'g'),
           '\m(city|of)\M', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- Municipality name as spelled in households.address ('Ozamiz', 'City of
-- Ozamiz', 'TANGUB CITY', 'Pana-on' ...). Null outside the 17 towns.
create or replace function asenso.ap_town_name(raw text)
returns text
language sql
immutable
parallel safe
as $$
  select case asenso.ap_town_key(raw)
    when 'ozamiz' then 'OZAMIZ CITY'
    when 'ozamis' then 'OZAMIZ CITY'
    when 'oroquieta' then 'CITY OF OROQUIETA'
    when 'tangub' then 'CITY OF TANGUB'
    when 'pana on' then 'PANAON'
    when 'don victoriano' then 'DON VICTORIANO CHIONGBIAN'
    when 'aloran' then 'ALORAN'
    when 'baliangao' then 'BALIANGAO'
    when 'bonifacio' then 'BONIFACIO'
    when 'calamba' then 'CALAMBA'
    when 'clarin' then 'CLARIN'
    when 'concepcion' then 'CONCEPCION'
    when 'don victoriano chiongbian' then 'DON VICTORIANO CHIONGBIAN'
    when 'jimenez' then 'JIMENEZ'
    when 'lopez jaena' then 'LOPEZ JAENA'
    when 'panaon' then 'PANAON'
    when 'plaridel' then 'PLARIDEL'
    when 'sapang dalaga' then 'SAPANG DALAGA'
    when 'sinacaban' then 'SINACABAN'
    when 'tudela' then 'TUDELA'
  end;
$$;

-- Barangay key (scripts/ap-match: barangayKey): 'Sta. Cruz (Pob.)' = 'SANTACRUZ'.
create or replace function asenso.ap_brgy_key(raw text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(regexp_replace(
           translate(upper(coalesce(raw, '')), 'ÑÁÉÍÓÚÀÈÌÒÙ', 'NAEIOUAEIOU'),
           '\(.*?\)', ' ', 'g'),
           '\mSTA\M\.?', 'SANTA', 'g'),
           '\mSTO\M\.?', 'SANTO', 'g'),
           '\mPROPER\M', 'P', 'g'),
           '\mCENTRAL\M', 'C', 'g'),
           '[^A-Z0-9]', '', 'g');
$$;

-- Name key: letters only ('DELA CRUZ, JUAN' = 'DELACRUZJUAN').
create or replace function asenso.ap_name_key(raw text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(
           translate(upper(coalesce(raw, '')), 'ÑÁÉÍÓÚÀÈÌÒÙ', 'NAEIOUAEIOU'),
           '[^A-Z]', '', 'g');
$$;

-- ------------------------------------------------------------ AP lists
-- Created empty here; STEP 2 fills it.
create materialized view asenso.ap_list_members as
with raw as (
  select 'AP list'::text as src, e.id as src_id,
         case when e.lastname is not null or e.firstname is not null
              then upper(btrim(coalesce(e.lastname, ''))) || ', ' ||
                   upper(btrim(concat_ws(' ', e.firstname, e.middlename)))
              else upper(btrim(e.fullname)) end as fullname,
         e.barangay, e.municipality, 'existing_members'::text as alias_source,
         nullif(btrim(e.member_type), '') as detail
  from public.existing_members e
  where not coalesce(e.ap_revoked, false)
  union all
  select 'AP registration', m.id,
         upper(btrim(coalesce(m.lastname, ''))) || ', ' ||
         upper(btrim(concat_ws(' ', m.firstname, m.middlename, m.suffix))),
         m.barangay, m.municipality, 'existing_members',
         nullif(btrim(m.status), '')
  from public.members m
  where not coalesce(m.ap_revoked, false)
    and m.province ilike '%misamis occ%'
  union all
  select 'Voters list (AP)', v.id, upper(btrim(v.fullname)),
         v.barangay, v.address, 'existing_members', null
  from asenso.voters v
  where v.is_ap is true and not coalesce(v.ap_revoked, false) and v.deleted_at is null
),
t as (
  select raw.*,
         asenso.ap_town_name(raw.municipality) as town,
         asenso.ap_town_key(raw.municipality) as tkey,
         asenso.ap_brgy_key(raw.barangay) as bkey_raw,
         asenso.ap_name_key(raw.fullname) as nkey
  from raw
  where nullif(btrim(raw.fullname), ',') is not null
),
loc as (
  select address, name, asenso.ap_brgy_key(name) as lkey from asenso.locations
),
b as (
  -- Official barangay name: same key as a location of that town, or an alias.
  select t.*,
         coalesce(l.name, a.official_barangay, upper(btrim(t.barangay))) as brgy
  from t
  left join loc l on l.address = t.town and l.lkey = t.bkey_raw
  left join asenso.barangay_aliases a
    on l.name is null and a.source = t.alias_source
   and a.town_key = t.tkey and a.barangay_key = t.bkey_raw
  where t.town is not null and t.nkey <> ''
),
census_voter as (
  -- voter id -> household, for voters encoded in the census
  select f.husband_id as voter_id, f.household_id from asenso.families f where f.husband_id is not null
  union all select f.wife_id, f.household_id from asenso.families f where f.wife_id is not null
  union all select m.voter_id, f.household_id
  from asenso.family_members m join asenso.families f on f.id = m.family_id
  where m.voter_id is not null
),
census_em as (
  -- AP-list id -> household, from the AP matcher (auto, or accepted on review)
  select r.existing_member_id as em_id, min(f.household_id) as household_id
  from asenso.ap_match_results r
  left join asenso.family_members m on r.person_type = 'member' and m.id = r.person_id
  join asenso.families f on f.id = case when r.person_type = 'member' then m.family_id else r.person_id end
  where r.existing_member_id is not null
    and (r.em_match_status = 'auto' or (r.em_match_status = 'review' and r.review_decision = 'accept'))
  group by r.existing_member_id
),
census_name as (
  -- same name in the same barangay among the census AP people
  select municipality, asenso.ap_brgy_key(barangay) as bkey,
         asenso.ap_name_key(fullname) as nkey, min(household_id) as household_id
  from asenso.ap_members_list
  group by 1, 2, 3
),
linked as (
  select b.*,
         coalesce(cv.household_id, ce.household_id, cn.household_id) as household_id
  from b
  left join (select voter_id, min(household_id) as household_id
             from census_voter group by voter_id) cv
    on b.src = 'Voters list (AP)' and cv.voter_id = b.src_id
  left join census_em ce
    on b.src = 'AP list' and ce.em_id = b.src_id
  left join census_name cn
    on cn.municipality = b.town and cn.bkey = asenso.ap_brgy_key(b.brgy) and cn.nkey = b.nkey
)
select
  town as municipality,
  asenso.ap_brgy_key(brgy) as bkey,
  nkey,
  min(fullname) as fullname,
  min(brgy) as barangay,
  array_agg(distinct src order by src) as sources,
  array_remove(array_agg(distinct detail order by detail), null) as details,
  min(household_id) as household_id,
  now() as refreshed_at
from linked
group by town, asenso.ap_brgy_key(brgy), nkey
with no data;

create unique index ap_list_members_key_idx
  on asenso.ap_list_members (municipality, bkey, nkey);
create index ap_list_members_town_name_idx
  on asenso.ap_list_members (municipality, fullname);
create index ap_list_members_brgy_name_idx
  on asenso.ap_list_members (municipality, barangay, fullname);
create index ap_list_members_name_trgm_idx
  on asenso.ap_list_members using gin (fullname gin_trgm_ops);

revoke all on asenso.ap_list_members from public, anon, authenticated;
grant select on asenso.ap_list_members to service_role;

-- Name search on the census list too.
create index if not exists ap_members_list_name_trgm_idx
  on asenso.ap_members_list using gin (fullname gin_trgm_ops);

-- ------------------------------------------------------------ page functions
-- Search: every word must appear in the name (any order). The longest word
-- goes through the trigram index; the rest are checked on the rows it finds.
-- Two branches (with / without a search) so each gets its own good plan.
-- p_town null = all municipalities (owner only; enforced in the API).

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
as $$
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
    order by l.fullname, l.person_type, l.person_id
    limit v_lim offset v_off;
  end if;
end;
$$;

create or replace function asenso.ap_list_members_page(
  p_town           text,
  p_barangay       text    default null,
  p_q              text    default null,
  p_not_in_census  boolean default false,
  p_limit          int     default 25,
  p_offset         int     default 0
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
as $$
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

  if cardinality(v_words) = 0 then
    return query
    select l.fullname, l.barangay, l.municipality, l.sources, l.details,
           l.household_id, l.refreshed_at, count(*) over ()
    from asenso.ap_list_members l
    where (p_town is null or l.municipality = p_town)
      and (v_brgy is null or l.barangay = v_brgy)
      and (not v_only or l.household_id is null)
    order by l.fullname, l.municipality, l.bkey
    limit v_lim offset v_off;
  else
    return query
    select l.fullname, l.barangay, l.municipality, l.sources, l.details,
           l.household_id, l.refreshed_at, count(*) over ()
    from asenso.ap_list_members l
    where l.fullname ilike '%' || v_words[1] || '%'
      and (p_town is null or l.municipality = p_town)
      and (v_brgy is null or l.barangay = v_brgy)
      and (not v_only or l.household_id is null)
      and not exists (select 1 from unnest(v_words) x
                      where position(x in upper(l.fullname)) = 0)
    order by l.fullname, l.municipality, l.bkey
    limit v_lim offset v_off;
  end if;
end;
$$;

revoke all on function asenso.ap_members_page(text, text, text, int, int) from public, anon, authenticated;
grant execute on function asenso.ap_members_page(text, text, text, int, int) to service_role;
revoke all on function asenso.ap_list_members_page(text, text, text, boolean, int, int) from public, anon, authenticated;
grant execute on function asenso.ap_list_members_page(text, text, text, boolean, int, int) to service_role;

commit; -- end of STEP 1

notify pgrst, 'reload schema';

-- ============================================================ STEP 2
-- Fill the saved list (~1 minute). Run this block on its own.
begin;
set local work_mem = '128MB';
refresh materialized view asenso.ap_list_members;
commit;
analyze asenso.ap_list_members;

-- Check: AP-list people per municipality, and how many are also in the census.
select municipality, count(*) as people,
       count(*) filter (where household_id is not null) as also_in_census
from asenso.ap_list_members group by 1 order by 1;

-- ROLLBACK
-- begin;
-- drop function asenso.ap_list_members_page(text, text, text, boolean, int, int);
-- drop materialized view asenso.ap_list_members;
-- drop index if exists asenso.ap_members_list_name_trgm_idx;
-- drop function asenso.ap_name_key(text);
-- drop function asenso.ap_brgy_key(text);
-- drop function asenso.ap_town_key(text);
-- drop function asenso.ap_town_name(text);
-- commit;
-- then run supabase/ap_members_list.sql's function section again to restore
-- the previous ap_members_page (town required, no index search).
