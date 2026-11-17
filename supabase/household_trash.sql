-- Household trash: deleting a household moves it (with its families, members
-- and Kadiwa claims) into asenso.household_trash instead of erasing it, and
-- it can be restored with the same ids.
--
-- Why a trash table and not a deleted_at flag: households is read by ~20
-- files here, ~17 database functions/views and the Kadiwa app. A flag would
-- need every one of them to filter it; moving the rows out needs none.
--
-- trash_household / restore_household each run as one transaction: either
-- everything moves, or nothing does.

create table if not exists asenso.household_trash (
  id                 bigint generated always as identity primary key,
  household_id       bigint not null,
  location_id        bigint,
  address            text,
  barangay           text,
  name               text,
  purok              text,
  family_count       integer not null default 0,
  member_count       integer not null default 0,
  -- { household, families[], members[], kadiwa_claims[], kadiwa_links[] }
  data               jsonb not null,
  deleted_by         text,
  deleted_by_user_id bigint,
  deleted_at         timestamptz not null default now()
);

create index if not exists household_trash_location_idx
  on asenso.household_trash (location_id, deleted_at desc);

-- Same access as households (any signed-in app user), never anonymous.
alter table asenso.household_trash enable row level security;
drop policy if exists "all (auth)" on asenso.household_trash;
create policy "all (auth)" on asenso.household_trash
  for all to authenticated using (true) with check (true);
revoke all on asenso.household_trash from anon;


create or replace function asenso.trash_household(
  p_household_id bigint,
  p_deleted_by text default null,
  p_deleted_by_user_id bigint default null
) returns bigint
language plpgsql
as $$
declare
  h        asenso.households;
  v_fams   jsonb;
  v_mems   jsonb;
  v_claims jsonb;
  v_links  jsonb;
  v_id     bigint;
begin
  select * into h from asenso.households where id = p_household_id for update;
  if not found then
    raise exception 'Household % not found', p_household_id;
  end if;

  select coalesce(jsonb_agg(to_jsonb(f) order by f.id), '[]'::jsonb) into v_fams
  from asenso.families f where f.household_id = h.id;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb) into v_mems
  from asenso.family_members m
  join asenso.families f on f.id = m.family_id
  where f.household_id = h.id;

  -- Kadiwa claims of this household (deleted by the cascade).
  select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb) into v_claims
  from asenso.kadiwa_claims c where c.household_id = h.id;

  -- Claims of other households that point at these families/members: they
  -- only lose that link (ON DELETE SET NULL); remember it to put it back.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'family_id', c.family_id,
           'family_member_id', c.family_member_id)), '[]'::jsonb) into v_links
  from asenso.kadiwa_claims c
  where c.household_id is distinct from h.id
    and (c.family_id in (select f.id from asenso.families f where f.household_id = h.id)
      or c.family_member_id in (
           select m.id from asenso.family_members m
           join asenso.families f on f.id = m.family_id
           where f.household_id = h.id));

  insert into asenso.household_trash (
    household_id, location_id, address, barangay, name, purok,
    family_count, member_count, data, deleted_by, deleted_by_user_id)
  values (
    h.id, h.location_id, h.address, h.barangay, h.name, h.purok,
    jsonb_array_length(v_fams), jsonb_array_length(v_mems),
    jsonb_build_object(
      'household', to_jsonb(h),
      'families', v_fams,
      'members', v_mems,
      'kadiwa_claims', v_claims,
      'kadiwa_links', v_links),
    p_deleted_by, p_deleted_by_user_id)
  returning id into v_id;

  delete from asenso.households where id = h.id;  -- cascades as before
  return v_id;
end;
$$;


create or replace function asenso.restore_household(p_trash_id bigint)
returns bigint
language plpgsql
as $$
declare
  t        asenso.household_trash;
  v_series integer;
begin
  select * into t from asenso.household_trash where id = p_trash_id for update;
  if not found then
    raise exception 'Trash item % not found', p_trash_id;
  end if;
  if exists (select 1 from asenso.households where id = t.household_id) then
    raise exception 'Household % already exists', t.household_id;
  end if;

  insert into asenso.households
  select * from jsonb_populate_record(null::asenso.households, t.data->'household');

  -- The insert trigger hands out a new household number; put the original
  -- back when nobody in the barangay has taken it meanwhile.
  v_series := (t.data->'household'->>'series_number')::integer;
  if v_series is not null and not exists (
    select 1 from asenso.households
    where address = t.data->'household'->>'address'
      and barangay = t.data->'household'->>'barangay'
      and series_number = v_series
      and id <> t.household_id
  ) then
    update asenso.households set series_number = v_series where id = t.household_id;
  end if;

  insert into asenso.families
  select * from jsonb_populate_recordset(null::asenso.families, t.data->'families');

  insert into asenso.family_members
  select * from jsonb_populate_recordset(null::asenso.family_members, t.data->'members');

  insert into asenso.kadiwa_claims overriding system value
  select * from jsonb_populate_recordset(null::asenso.kadiwa_claims, t.data->'kadiwa_claims');

  update asenso.kadiwa_claims c
  set family_id = coalesce(c.family_id, (l->>'family_id')::bigint),
      family_member_id = coalesce(c.family_member_id, (l->>'family_member_id')::bigint)
  from jsonb_array_elements(t.data->'kadiwa_links') l
  where c.id = (l->>'id')::bigint;

  delete from asenso.household_trash where id = p_trash_id;
  return t.household_id;
end;
$$;

revoke all on function asenso.trash_household(bigint, text, bigint) from public, anon;
revoke all on function asenso.restore_household(bigint) from public, anon;
grant execute on function asenso.trash_household(bigint, text, bigint) to authenticated;
grant execute on function asenso.restore_household(bigint) to authenticated;
