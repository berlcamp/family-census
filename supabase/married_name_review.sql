-- Married-name review for NR people (owner page /married-review)
--
-- Many married women are NR in the census because asenso.voters still has
-- their maiden name. In the census the maiden surname is usually the middle
-- name:  census  CRUZ, MARIA SANTOS   (married)
--        voter   SANTOS, MARIA REYES  (maiden, not yet updated)
-- Rule: same town, same first name(s), census middle name = voter last name,
-- different last names. Only NR people, only voters not yet linked to anyone
-- in the census. About 1,008 people on 2026-11-20 (Ozamiz City 487).
--
-- STEP 1 creates asenso.married_name_candidates and fills it. No census data
--        is changed. Safe to run again later: it only adds new candidates.
-- STEP 2 creates asenso.married_review_decide(id, decision, by), which the
--        page calls (service role only). Confirm does what
--        link_new_identified_registered*.sql did, for one person:
--          member       -> family_members.voter_id = voter, is_registered = true
--          husband/wife -> families.husband_id / wife_id = voter
--          family       -> families.all_nr = false
--          match row    -> ap_match_results.linked_voter_id = voter, voter-match
--                          fields cleared (as an ap-match re-run would)
--          Ozamiz only  -> is_ap / ap_source from the voter (voters.is_ap, not
--                          revoked), person AP flag and families.has_ap_member
--        The old values are saved on the candidate row (column "old");
--        decision 'undo' puts them back.
--
-- Run STEP 1, look at the counts, then STEP 2. ROLLBACK is at the bottom.

-- ============================================================ STEP 1
begin;

create table if not exists asenso.married_name_candidates (
  id             bigint generated always as identity primary key,
  match_id       bigint not null,            -- asenso.ap_match_results.id
  person_type    text   not null check (person_type in ('husband', 'wife', 'member')),
  person_id      bigint not null,            -- family id (husband/wife) or family_members.id
  family_id      bigint not null,
  household_id   bigint,
  town           text   not null,            -- upper-case, as voters.address
  barangay       text,
  census_name    text   not null,
  voter_id       bigint not null,
  voter_name     text   not null,
  voter_barangay text,
  voter_is_ap    boolean not null,           -- voters.is_ap and not revoked
  n_candidates   int    not null,            -- candidates for this person
  status         text   not null default 'pending'
                 check (status in ('pending', 'confirmed', 'rejected', 'superseded')),
  superseded_by  bigint,                     -- the confirmed candidate that took its person/voter
  reviewed_by    text,
  reviewed_at    timestamptz,
  old            jsonb,                      -- values before confirm (for undo)
  created_at     timestamptz not null default now(),
  unique (match_id, voter_id)
);
create index if not exists married_name_candidates_town_idx
  on asenso.married_name_candidates (town, status);
create index if not exists married_name_candidates_voter_idx
  on asenso.married_name_candidates (voter_id);

-- Server-only: the page reads and writes it through the API (service role).
alter table asenso.married_name_candidates enable row level security;
revoke all on asenso.married_name_candidates from anon, authenticated;
grant all on asenso.married_name_candidates to service_role;

insert into asenso.married_name_candidates (
  match_id, person_type, person_id, family_id, household_id, town, barangay,
  census_name, voter_id, voter_name, voter_barangay, voter_is_ap, n_candidates
)
with nr as (
  select r.id as match_id, r.person_type, r.person_id, upper(btrim(r.town)) as town,
         r.barangay, r.fullname,
         upper(btrim(split_part(r.fullname, ',', 1))) as ln,
         regexp_replace(upper(btrim(split_part(r.fullname, ',', 2))), '\s+', ' ', 'g') as rest
  from asenso.ap_match_results r
  where r.linked_voter_id is null
    and r.is_ap is not true
    and r.fullname like '%,%'
),
nrp as (
  select nr.*, regexp_replace(rest, ' \S+$', '') as fn, substring(rest from '(\S+)$') as mn
  from nr where rest like '% %'
),
vp as (
  select v.id, v.fullname, v.barangay, upper(btrim(v.address)) as town,
         upper(btrim(split_part(v.fullname, ',', 1))) as ln,
         regexp_replace(regexp_replace(upper(btrim(split_part(v.fullname, ',', 2))), '\s+', ' ', 'g'),
                        ' \S+$', '') as fn,
         coalesce(v.is_ap, false) and not coalesce(v.ap_revoked, false) as is_ap
  from asenso.voters v
  where v.deleted_at is null and v.fullname like '%,%'
),
pairs as (
  select p.*, v.id as voter_id, v.fullname as voter_name, v.barangay as voter_barangay,
         v.is_ap as voter_is_ap
  from nrp p
  join vp v on v.town = p.town and v.fn = p.fn and v.ln = p.mn and v.ln <> p.ln
  -- voter not linked to anyone in the census
  where not exists (select 1 from asenso.family_members x where x.voter_id = v.id)
    and not exists (select 1 from asenso.families x where x.husband_id = v.id or x.wife_id = v.id)
)
select s.match_id, s.person_type, s.person_id, f.id, f.household_id, s.town, s.barangay,
       s.fullname, s.voter_id, s.voter_name, s.voter_barangay, s.voter_is_ap,
       count(*) over (partition by s.match_id)
from pairs s
left join asenso.family_members m on s.person_type = 'member' and m.id = s.person_id
join asenso.families f
  on f.id = case when s.person_type = 'member' then m.family_id else s.person_id end
where
  -- still NR in the census
  case s.person_type
    when 'member'  then m.voter_id is null and m.is_registered is not true
    when 'husband' then f.husband_id is null
    when 'wife'    then f.wife_id is null
    else false
  end
  -- no approved Voter's Certificate (/nr-proofs) for this person
  and not exists (
    select 1 from asenso.nr_proofs np
    where np.status = 'approved' and np.person_type = s.person_type
      and np.family_id = f.id
      and (s.person_type <> 'member' or np.member_id = s.person_id)
  )
on conflict (match_id, voter_id) do nothing;

commit;

-- Expect about 1,008 people / 1,020 rows on the first run (Ozamiz 487 / 490, 386 with an AP voter).
select town, count(distinct match_id) as people, count(*) as rows,
       count(distinct match_id) filter (where voter_is_ap) as with_ap_voter
from asenso.married_name_candidates
group by town order by people desc;

-- ============================================================ STEP 2
create or replace function asenso.married_review_decide(
  p_id bigint, p_decision text, p_by text
) returns jsonb
language plpgsql
set search_path = asenso, public
as $$
declare
  c        asenso.married_name_candidates%rowtype;
  m        asenso.family_members%rowtype;
  f        asenso.families%rowtype;
  r        asenso.ap_match_results%rowtype;
  o        jsonb;
  ozamiz   boolean;
  new_ap   boolean;
begin
  select * into c from asenso.married_name_candidates where id = p_id for update;
  if not found then
    raise exception 'Candidate % not found', p_id;
  end if;
  ozamiz := c.town = 'OZAMIZ CITY';

  -- ---------------------------------------------------------- reject
  if p_decision = 'reject' then
    if c.status <> 'pending' then
      raise exception 'Only pending candidates can be rejected (this one is %)', c.status;
    end if;
    update asenso.married_name_candidates
      set status = 'rejected', reviewed_by = p_by, reviewed_at = now()
      where id = p_id returning * into c;
    return to_jsonb(c);
  end if;

  -- ---------------------------------------------------------- confirm
  if p_decision = 'confirm' then
    if c.status <> 'pending' then
      raise exception 'Only pending candidates can be confirmed (this one is %)', c.status;
    end if;

    select * into f from asenso.families where id = c.family_id for update;
    if not found then
      raise exception 'Family % no longer exists', c.family_id;
    end if;
    if c.person_type = 'member' then
      select * into m from asenso.family_members where id = c.person_id for update;
      if not found then
        raise exception 'Family member % no longer exists', c.person_id;
      end if;
      if m.voter_id is not null or m.is_registered is true then
        raise exception 'This person is already registered in the census';
      end if;
    elsif (c.person_type = 'husband' and f.husband_id is not null)
       or (c.person_type = 'wife' and f.wife_id is not null) then
      raise exception 'This person is already linked to a voter';
    end if;

    if exists (select 1 from asenso.family_members x where x.voter_id = c.voter_id)
       or exists (select 1 from asenso.families x
                  where x.husband_id = c.voter_id or x.wife_id = c.voter_id) then
      raise exception 'This voter is already linked to another person in the census';
    end if;

    select coalesce(v.is_ap, false) and not coalesce(v.ap_revoked, false)
      into new_ap
      from asenso.voters v where v.id = c.voter_id and v.deleted_at is null;
    if not found then
      raise exception 'Voter % was deleted', c.voter_id;
    end if;

    select * into r from asenso.ap_match_results where id = c.match_id for update;
    if not found then
      raise exception 'Match row % no longer exists (AP matching was re-run?)', c.match_id;
    end if;

    o := jsonb_build_object(
      'member_voter_id',           m.voter_id,
      'member_is_registered',      m.is_registered,
      'member_is_ap_member',       m.is_ap_member,
      'husband_id',                f.husband_id,
      'wife_id',                   f.wife_id,
      'is_husband_ap_member',      f.is_husband_ap_member,
      'is_wife_ap_member',         f.is_wife_ap_member,
      'all_nr',                    f.all_nr,
      'has_ap_member',             f.has_ap_member,
      'linked_voter_id',           r.linked_voter_id,
      'matched_voter_id',          r.matched_voter_id,
      'voter_match_status',        r.voter_match_status,
      'voter_match_reason',        r.voter_match_reason,
      'voter_in_census_elsewhere', r.voter_in_census_elsewhere,
      'new_identified_registered', r.new_identified_registered,
      'possible_duplicate',        r.possible_duplicate,
      'is_ap',                     r.is_ap,
      'ap_source',                 r.ap_source
    );

    if c.person_type = 'member' then
      update asenso.family_members
        set voter_id = c.voter_id, is_registered = true,
            is_ap_member = case when ozamiz then new_ap else is_ap_member end
        where id = c.person_id;
    elsif c.person_type = 'husband' then
      update asenso.families
        set husband_id = c.voter_id,
            is_husband_ap_member = case when ozamiz then new_ap else is_husband_ap_member end
        where id = c.family_id;
    else
      update asenso.families
        set wife_id = c.voter_id,
            is_wife_ap_member = case when ozamiz then new_ap else is_wife_ap_member end
        where id = c.family_id;
    end if;

    update asenso.families set all_nr = false
      where id = c.family_id and all_nr is not false;

    update asenso.ap_match_results
      set linked_voter_id           = c.voter_id,
          matched_voter_id          = null,
          voter_match_status        = null,
          voter_match_reason        = null,
          voter_in_census_elsewhere = null,
          new_identified_registered = null,
          possible_duplicate        = null,
          is_ap     = case when ozamiz then new_ap else is_ap end,
          ap_source = case when ozamiz then (case when new_ap then 'voter_is_ap' end)
                           else ap_source end
      where id = c.match_id;

    -- Ozamiz dashboard flag: same rule as /reports (any AP person in the family).
    if ozamiz then
      update asenso.families fam
        set has_ap_member = x.rep_ap
        from (select coalesce(bool_or(p.ap), false) as rep_ap
              from asenso.ap_person_status p where p.family_id = c.family_id) x
        where fam.id = c.family_id and fam.has_ap_member is distinct from x.rep_ap;
    end if;

    update asenso.married_name_candidates
      set status = 'confirmed', reviewed_by = p_by, reviewed_at = now(), old = o
      where id = p_id returning * into c;

    -- Other candidates for the same person, or for the same voter, are done.
    update asenso.married_name_candidates
      set status = 'superseded', superseded_by = p_id
      where status = 'pending' and id <> p_id
        and (match_id = c.match_id or voter_id = c.voter_id);

    return to_jsonb(c);
  end if;

  -- ---------------------------------------------------------- undo
  if p_decision = 'undo' then
    if c.status = 'rejected' then
      update asenso.married_name_candidates
        set status = 'pending', reviewed_by = null, reviewed_at = null
        where id = p_id returning * into c;
      return to_jsonb(c);
    end if;
    if c.status <> 'confirmed' then
      raise exception 'Only confirmed or rejected candidates can be undone (this one is %)', c.status;
    end if;
    o := c.old;

    -- Only fields that still hold what confirm wrote are put back.
    if c.person_type = 'member' then
      update asenso.family_members
        set voter_id      = (o->>'member_voter_id')::bigint,
            is_registered = (o->>'member_is_registered')::boolean,
            is_ap_member  = (o->>'member_is_ap_member')::boolean
        where id = c.person_id and voter_id = c.voter_id;
    elsif c.person_type = 'husband' then
      update asenso.families
        set husband_id           = (o->>'husband_id')::bigint,
            is_husband_ap_member = (o->>'is_husband_ap_member')::boolean
        where id = c.family_id and husband_id = c.voter_id;
    else
      update asenso.families
        set wife_id           = (o->>'wife_id')::bigint,
            is_wife_ap_member = (o->>'is_wife_ap_member')::boolean
        where id = c.family_id and wife_id = c.voter_id;
    end if;

    -- all_nr goes back only if no other confirmed candidate is in this family.
    update asenso.families
      set all_nr = (o->>'all_nr')::boolean
      where id = c.family_id
        and not exists (select 1 from asenso.married_name_candidates x
                        where x.family_id = c.family_id and x.status = 'confirmed' and x.id <> p_id);

    update asenso.ap_match_results
      set linked_voter_id           = (o->>'linked_voter_id')::bigint,
          matched_voter_id          = (o->>'matched_voter_id')::bigint,
          voter_match_status        = o->>'voter_match_status',
          voter_match_reason        = o->>'voter_match_reason',
          voter_in_census_elsewhere = (o->>'voter_in_census_elsewhere')::boolean,
          new_identified_registered = (o->>'new_identified_registered')::boolean,
          possible_duplicate        = (o->>'possible_duplicate')::boolean,
          is_ap                     = (o->>'is_ap')::boolean,
          ap_source                 = o->>'ap_source'
      where id = c.match_id and linked_voter_id = c.voter_id;

    if ozamiz then
      update asenso.families fam
        set has_ap_member = x.rep_ap
        from (select coalesce(bool_or(p.ap), false) as rep_ap
              from asenso.ap_person_status p where p.family_id = c.family_id) x
        where fam.id = c.family_id and fam.has_ap_member is distinct from x.rep_ap;
    end if;

    update asenso.married_name_candidates
      set status = 'pending', reviewed_by = null, reviewed_at = null, old = null
      where id = p_id returning * into c;

    update asenso.married_name_candidates
      set status = 'pending', superseded_by = null
      where superseded_by = p_id and status = 'superseded';

    return to_jsonb(c);
  end if;

  raise exception 'Unknown decision %', p_decision;
end;
$$;

revoke all on function asenso.married_review_decide(bigint, text, text) from public, anon, authenticated;
grant execute on function asenso.married_review_decide(bigint, text, text) to service_role;

-- Check: the function exists and only the service role can run it.
select p.proname,
       has_function_privilege('service_role', p.oid, 'execute') as service_role,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'asenso' and p.proname = 'married_review_decide';
-- expect: service_role = true, authenticated = false

-- ============================================================ ROLLBACK
-- 1) Undo every confirmed candidate first (puts the census back), either on
--    the page or here:
-- select asenso.married_review_decide(id, 'undo', 'rollback')
--   from asenso.married_name_candidates where status = 'confirmed';
-- 2) Then remove the function and the table:
-- drop function if exists asenso.married_review_decide(bigint, text, text);
-- drop table if exists asenso.married_name_candidates;
