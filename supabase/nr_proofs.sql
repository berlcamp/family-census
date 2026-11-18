-- NR proof of registration (Voter's Certificate)
--
-- A not-registered (NR) person on a household card can get a photo of their
-- Voter's Certificate uploaded. The owner, province admins and super admins
-- review it on /nr-proofs; once approved the card shows them as registered,
-- flagged "from NR" (badge R*).
--
-- Adds one table and one private storage bucket, and replaces two dashboard
-- functions (barangay_stats_fast, barangay_overview_stats_fast) so approved
-- people count as registered. Their old definitions are in the ROLLBACK
-- section. No data is changed by this script. No foreign keys, so the
-- household trash (delete + re-insert) is not affected.
--
-- Approving a proof (in the app) clears families.all_nr for that family and,
-- for a family member, sets family_members.is_registered = true — the fields
-- the printables, search and dashboard all-NR counts already read.
--
-- Writes happen only through the app's API routes (service role). Logged-in
-- users may read the table (for the badges); nobody else can write to it.
-- The photos are private: the API hands out short-lived signed URLs.
--
-- Run in the Supabase SQL Editor. Safe to run twice.

begin;

create table if not exists asenso.nr_proofs (
  id            bigint generated always as identity primary key,
  person_type   text   not null check (person_type in ('husband', 'wife', 'member')),
  family_id     bigint not null,
  member_id     bigint,                      -- family_members.id when person_type = 'member'
  fullname      text   not null,             -- name on the card when submitted
  household_id  bigint,
  location_id   bigint,
  municipality  text   not null,             -- locations.address
  barangay      text,                        -- locations.name
  file_path     text   not null,             -- object in bucket nr-proofs
  file_size     integer,
  status        text   not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'replaced')),
  submitted_by  text   not null,             -- email
  submitted_at  timestamptz not null default now(),
  reviewed_by   text,
  reviewed_at   timestamptz,
  review_note   text,
  constraint nr_proofs_member_id_check
    check ((person_type = 'member') = (member_id is not null))
);

comment on table asenso.nr_proofs is
  'Voter''s Certificate photos for NR people on the household cards; reviewed on /nr-proofs (family-census app).';

-- Badges on the households page: proofs of the families on screen.
create index if not exists nr_proofs_family_idx on asenso.nr_proofs (family_id);
-- Review page: by municipality / status, newest first.
create index if not exists nr_proofs_review_idx
  on asenso.nr_proofs (municipality, status, submitted_at desc);
-- At most one open (pending or approved) proof per person.
create unique index if not exists nr_proofs_one_open_idx
  on asenso.nr_proofs (family_id, person_type, coalesce(member_id, 0))
  where status in ('pending', 'approved');

alter table asenso.nr_proofs enable row level security;

drop policy if exists "nr_proofs read (auth)" on asenso.nr_proofs;
create policy "nr_proofs read (auth)" on asenso.nr_proofs
  for select to authenticated using (true);

grant select on asenso.nr_proofs to authenticated;
grant all on asenso.nr_proofs to service_role;

-- Private bucket, small images only (the app shrinks photos to ~100 KB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nr-proofs', 'nr-proofs', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Dashboard: people registered from NR count as registered.
-- Same functions as before plus one term: approved proofs whose person is
-- still on the card and still has no voter record. (all_nr is cleared by the
-- app when a proof is approved, so the all-NR counts need no change.)

create or replace function asenso.barangay_stats_fast(address_param text)
 returns table(barangay text, households bigint, families bigint, sps bigint, total_registered bigint, total_non_registered bigint, all_c bigint, all_c_ap bigint, total_ap_membership_true bigint, total_ap_membership_false bigint)
 language sql
 stable
as $function$
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
  ),
  nr_agg as (
    select fam.brgy, count(*) as from_nr
    from asenso.nr_proofs p
    join fam on fam.id = p.family_id
    join asenso.families f on f.id = p.family_id
    where p.status = 'approved'
      and (
        (p.person_type = 'husband' and f.husband_id is null
          and regexp_replace(upper(btrim(f.husband_name)), '\s+', ' ', 'g')
            = regexp_replace(upper(btrim(p.fullname)), '\s+', ' ', 'g'))
        or (p.person_type = 'wife' and f.wife_id is null
          and regexp_replace(upper(btrim(f.wife_name)), '\s+', ' ', 'g')
            = regexp_replace(upper(btrim(p.fullname)), '\s+', ' ', 'g'))
        or (p.person_type = 'member' and exists (
          select 1 from asenso.family_members m
          where m.id = p.member_id and m.family_id = p.family_id and m.voter_id is null))
      )
    group by fam.brgy
  )
  select
    n.name,
    coalesce(h.households, 0),
    coalesce(f.families, 0),
    coalesce(h.sps, 0),
    coalesce(f.husbands, 0) + coalesce(f.wives, 0) + coalesce(m.member_voters, 0)
      + coalesce(r.from_nr, 0),
    coalesce(f.all_nr, 0),
    coalesce(f.all_c, 0),
    coalesce(f.all_c_ap, 0),
    coalesce(f.ap_true, 0),
    coalesce(f.ap_false, 0)
  from (select distinct name from loc) n
  left join h_agg h on h.brgy = n.name
  left join f_agg f on f.brgy = n.name
  left join m_agg m on m.brgy = n.name
  left join nr_agg r on r.brgy = n.name
  order by n.name;
$function$;

create or replace function asenso.barangay_overview_stats_fast(location_id_param bigint)
 returns table(barangay text, total_households bigint, total_families bigint, total_voters bigint, total_non_registered bigint)
 language sql
 stable
as $function$
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
      + (select count(distinct m.voter_id) from asenso.family_members m join fam on fam.id = m.family_id)
      + (select count(*) from asenso.nr_proofs p
           join fam on fam.id = p.family_id
           join asenso.families f on f.id = p.family_id
          where p.status = 'approved'
      and (
        (p.person_type = 'husband' and f.husband_id is null
          and regexp_replace(upper(btrim(f.husband_name)), '\s+', ' ', 'g')
            = regexp_replace(upper(btrim(p.fullname)), '\s+', ' ', 'g'))
        or (p.person_type = 'wife' and f.wife_id is null
          and regexp_replace(upper(btrim(f.wife_name)), '\s+', ' ', 'g')
            = regexp_replace(upper(btrim(p.fullname)), '\s+', ' ', 'g'))
        or (p.person_type = 'member' and exists (
          select 1 from asenso.family_members m
          where m.id = p.member_id and m.family_id = p.family_id and m.voter_id is null))
      )),
    (select count(*) from fam where all_nr = true)
  from asenso.locations l
  where l.id = location_id_param;
$function$;

-- Check: everything is there, the bucket is private.
do $$
begin
  if to_regclass('asenso.nr_proofs') is null then
    raise exception 'asenso.nr_proofs missing';
  end if;
  if not exists (select 1 from storage.buckets where id = 'nr-proofs' and public = false) then
    raise exception 'bucket nr-proofs missing or public';
  end if;
end $$;

commit;

-- Nothing is approved yet, so the dashboard numbers do not change today.
--
-- After running: expose nothing else. PostgREST picks up the new table on its
-- own; if the API says "relation not found", run:  notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- ROLLBACK
--
-- 1) Dashboard functions back to how they were (safe any time):
--
-- create or replace function asenso.barangay_stats_fast(address_param text)
--  returns table(barangay text, households bigint, families bigint, sps bigint, total_registered bigint, total_non_registered bigint, all_c bigint, all_c_ap bigint, total_ap_membership_true bigint, total_ap_membership_false bigint)
--  language sql stable
-- as $function$
--   with loc as (
--     select id, name from asenso.locations
--     where address ilike '%' || address_param || '%'
--   ),
--   hh as (
--     select h.id, h.sp_id, l.name as brgy
--     from asenso.households h
--     join loc l on h.location_id = l.id and h.barangay = l.name
--     where exists (select 1 from asenso.families f where f.household_id = h.id)
--   ),
--   fam as (
--     select f.id, f.husband_id, f.wife_id, f.all_nr, f.all_c,
--            f.has_ap_member, hh.brgy
--     from asenso.families f
--     join hh on f.household_id = hh.id
--     where f.husband_name is not null
--        or f.wife_name is not null
--        or exists (select 1 from asenso.family_members m where m.family_id = f.id)
--   ),
--   h_agg as (
--     select brgy, count(distinct id) as households, count(distinct sp_id) as sps
--     from hh group by brgy
--   ),
--   f_agg as (
--     select brgy,
--       count(*) as families,
--       count(distinct husband_id) as husbands,
--       count(distinct wife_id) as wives,
--       count(*) filter (where all_nr = true) as all_nr,
--       count(*) filter (where all_c = true) as all_c,
--       count(*) filter (where has_ap_member = true and all_c = true) as all_c_ap,
--       count(*) filter (where has_ap_member = true) as ap_true,
--       count(*) filter (where has_ap_member is not true) as ap_false
--     from fam group by brgy
--   ),
--   m_agg as (
--     select fam.brgy, count(distinct m.voter_id) as member_voters
--     from asenso.family_members m
--     join fam on m.family_id = fam.id
--     group by fam.brgy
--   )
--   select
--     n.name,
--     coalesce(h.households, 0),
--     coalesce(f.families, 0),
--     coalesce(h.sps, 0),
--     coalesce(f.husbands, 0) + coalesce(f.wives, 0) + coalesce(m.member_voters, 0),
--     coalesce(f.all_nr, 0),
--     coalesce(f.all_c, 0),
--     coalesce(f.all_c_ap, 0),
--     coalesce(f.ap_true, 0),
--     coalesce(f.ap_false, 0)
--   from (select distinct name from loc) n
--   left join h_agg h on h.brgy = n.name
--   left join f_agg f on f.brgy = n.name
--   left join m_agg m on m.brgy = n.name
--   order by n.name;
-- $function$;
--
-- create or replace function asenso.barangay_overview_stats_fast(location_id_param bigint)
--  returns table(barangay text, total_households bigint, total_families bigint, total_voters bigint, total_non_registered bigint)
--  language sql stable
-- as $function$
--   with hh as (
--     select h.id from asenso.households h
--     where h.location_id = location_id_param
--       and exists (select 1 from asenso.families f where f.household_id = h.id)
--   ),
--   fam as (
--     select f.id, f.husband_id, f.wife_id, f.all_nr
--     from asenso.families f
--     join hh on f.household_id = hh.id
--     where f.husband_name is not null
--        or f.wife_name is not null
--        or exists (select 1 from asenso.family_members m where m.family_id = f.id)
--   )
--   select
--     l.name,
--     (select count(*) from hh),
--     (select count(*) from fam),
--     (select count(distinct husband_id) from fam)
--       + (select count(distinct wife_id) from fam)
--       + (select count(distinct m.voter_id) from asenso.family_members m join fam on fam.id = m.family_id),
--     (select count(*) from fam where all_nr = true)
--   from asenso.locations l
--   where l.id = location_id_param;
-- $function$;
--
-- 2) Remove the feature's data (only if you really want it gone; run 1 first):
--
-- Approvals also cleared families.all_nr and set family_members.is_registered
-- for the approved people. To put those back first:
--   update asenso.family_members m set is_registered = false
--     from asenso.nr_proofs p
--    where p.status = 'approved' and p.person_type = 'member'
--      and m.id = p.member_id and m.voter_id is null;
--   (then re-save the affected families, or recompute all_nr for them)
--
-- begin;
--   drop table if exists asenso.nr_proofs;
--   -- empty the nr-proofs bucket in the Storage UI, then delete it there.
-- commit;
