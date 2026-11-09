-- Fuzzy ("similar spelling") name search for the /search page.
--   "shiela mae sevilla"  ->  SEVILLA, SHELLA MAE NORCA
--   "jhon dela cruz"      ->  DELA CRUZ, JOHN ...
--
-- 1. Candidates come from the existing gin_trgm indexes using the word-similarity
--    operator (<%) at a loose threshold, ANDed across the longer words.
-- 2. Each candidate is verified word by word: every searched word must be close
--    to some word in the name (prefix, Levenshtein, or same Double Metaphone).
--
-- SECURITY INVOKER: runs with the caller's permissions, so table RLS applies.
-- Additive only. To undo:
--   drop function asenso.search_households_fuzzy(text, text, int);
--   drop function asenso.name_token_score(text, text);

-- Best score (0..1) of one search word against any word in a name.
create or replace function asenso.name_token_score(p_token text, p_name text)
returns real
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(max(
    case
      when left(w, length(p_token)) = p_token then 1.0
      else greatest(
        1 - levenshtein(p_token, w)::real / greatest(length(p_token), length(w)),
        case
          when left(p_token, 1) = left(w, 1)
           and dmetaphone(p_token) = dmetaphone(w) then 0.7
          else 0
        end
      )
    end), 0)::real
  from unnest(regexp_split_to_array(lower(coalesce(p_name, '')), '[^[:alpha:]]+')) w
  where w <> ''
$$;

create or replace function asenso.search_households_fuzzy(
  p_query text,
  p_address text default null,
  p_limit int default 40
)
returns table (household_id bigint, matched_name text, score real)
language plpgsql
stable
set search_path = asenso, public
as $$
declare
  tokens text[];
  gen text[];
  addr text := '';
begin
  -- Loose threshold for the <% index probe (results are verified below).
  -- Set here rather than in the function header: on Supabase, a header
  -- "set pg_trgm..." needs superuser. Calling a pg_trgm function first makes
  -- sure the extension is loaded so the setting is recognised. Local = this
  -- request's transaction only.
  perform public.similarity('a', 'a');
  perform set_config('pg_trgm.word_similarity_threshold', '0.3', true);

  tokens := array(
    select t
    from unnest(regexp_split_to_array(lower(coalesce(p_query, '')), '[^[:alpha:]]+')) t
    where length(t) >= 2
    limit 5
  );
  if coalesce(cardinality(tokens), 0) = 0 then
    return;
  end if;

  -- Short words ("mae", "jr") make poor index probes; use them only to verify.
  gen := array(select t from unnest(tokens) t where length(t) >= 4);
  if coalesce(cardinality(gen), 0) = 0 then
    gen := tokens;
  end if;

  if p_address is not null then
    addr := format(
      ' and exists (select 1 from households h where h.id = f.household_id and h.address = %L)',
      p_address
    );
  end if;

  return query execute format($q$
    with cand as (
      (select f.household_id, f.husband_name as name
         from families f where %1$s %4$s limit 1000)
      union all
      (select f.household_id, f.wife_name
         from families f where %2$s %4$s limit 1000)
      union all
      (select f.household_id, m.fullname
         from family_members m join families f on f.id = m.family_id
        where %3$s %4$s limit 1000)
    ),
    scored as (
      select c.household_id, c.name, sc.mn, sc.av
      from cand c
      cross join lateral (
        select min(s) as mn, avg(s) as av
        from (select name_token_score(t, c.name) as s from unnest($1) t) x
      ) sc
      where sc.mn >= 0.65
    ),
    best as (
      select distinct on (s.household_id) s.household_id, s.name, s.av
      from scored s
      order by s.household_id, s.av desc
    )
    select b.household_id::bigint, b.name::text, b.av::real
    from best b
    order by b.av desc, b.household_id
    limit $2
  $q$,
    (select string_agg(format('%L <%% f.husband_name', t), ' and ') from unnest(gen) t),
    (select string_agg(format('%L <%% f.wife_name', t), ' and ') from unnest(gen) t),
    (select string_agg(format('%L <%% m.fullname', t), ' and ') from unnest(gen) t),
    addr
  ) using tokens, p_limit;
end;
$$;

revoke all on function asenso.search_households_fuzzy(text, text, int) from public, anon;
grant execute on function asenso.search_households_fuzzy(text, text, int) to authenticated;
grant execute on function asenso.name_token_score(text, text) to authenticated;
