-- AP membership crossmatch: setup (step 2)
--
-- Adds two NEW tables and two helper functions. Does not modify any existing
-- table, column, or row. Safe to re-run.
--
--   asenso.barangay_aliases  - one-time map of misspelled barangay names
--                              (existing_members / households) to the official
--                              barangay in asenso.voters. Reviewed 2026-11-16.
--   asenso.ap_match_results  - staging table for the matcher. Nothing here is
--                              applied to family_members / families until a
--                              separate, reviewed step.

-- ---------------------------------------------------------------------------
-- Keys (same rules as adm-v26 lib/utils/voterMatch.ts barangayKey())
-- ---------------------------------------------------------------------------

-- "DOÑA CONSUELO" = "DONA CONSUELO", "STA" = "SANTA", "(...)" dropped,
-- "PROPER" -> "P", "CENTRAL" -> "C", punctuation and spaces removed.
create or replace function asenso.brgy_key(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      upper(translate(coalesce(p, ''), 'ñÑáéíóúÁÉÍÓÚ', 'nNaeiouAEIOU')),
      '\(.*?\)', ' ', 'g'),
      '\mSTA\M\.?', 'SANTA', 'g'),
      '\mSTO\M\.?', 'SANTO', 'g'),
      '\mPROPER\M', 'P', 'g'),
      '\mCENTRAL\M', 'C', 'g'),
    '[^A-Z0-9]', '', 'g');
$$;

-- "City of Ozamiz" = "OZAMIZ CITY" = "Ozamiz" -> "ozamiz"
create or replace function asenso.town_key(p text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    regexp_replace(asenso.ap_norm(p), '\m(city|of)\M', '', 'g'),
    '\s+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Barangay aliases
-- ---------------------------------------------------------------------------

create table if not exists asenso.barangay_aliases (
  id                bigint generated always as identity primary key,
  source            text not null check (source in ('existing_members', 'households')),
  town_raw          text not null,
  barangay_raw      text not null,
  town_key          text generated always as (asenso.town_key(town_raw)) stored,
  barangay_key      text generated always as (asenso.brgy_key(barangay_raw)) stored,
  official_town     text not null,   -- asenso.voters.address
  official_barangay text not null,   -- asenso.voters.barangay
  note              text,
  created_at        timestamptz not null default now(),
  unique (source, town_key, barangay_key)
);

alter table asenso.barangay_aliases enable row level security;

insert into asenso.barangay_aliases
  (source, town_raw, barangay_raw, official_town, official_barangay, note)
values
  ('existing_members', 'City of Ozamiz',    'Manningcol',                  'OZAMIZ CITY',       'MANINGCOL',                     '96% name evidence'),
  ('existing_members', 'City of Ozamiz',    'Carmen Annex',                'OZAMIZ CITY',       'CARMEN (MISAMIS ANNEX)',        '95% name evidence'),
  ('existing_members', 'Calamba',           'Don Bernardo A. Neri',        'CALAMBA',           'DON BERNARDO NERI POB.',        '97% name evidence'),
  ('existing_members', 'City of Tangub',    'Silangat',                    'CITY OF TANGUB',    'SILANGA',                       'Mixed: 63% SILANGA / 35% SILANGIT; mapped to SILANGA by decision 2026-11-16'),
  ('existing_members', 'Bonifacio',         'Poblacion 1',                 'BONIFACIO',         'POBLACION',                     '96% name evidence'),
  ('existing_members', 'Bonifacio',         'Mipagne',                     'BONIFACIO',         'MIGPANGE',                      '99% name evidence'),
  ('existing_members', 'Bonifacio',         'Lower Usogan',                'BONIFACIO',         'LOWER USUGAN',                  '99% name evidence'),
  ('existing_members', 'Tudela',            'Colambutan Bajo - 340',       'TUDELA',            'CALAMBUTAN BAJO',               '98% name evidence'),
  ('existing_members', 'Aloran',            'Lumabayao',                   'ALORAN',            'LUMBAYAO',                      '95% name evidence'),
  ('existing_members', 'City of Tangub',    'Barangay 6',                  'CITY OF TANGUB',    'BARANGAY VI - LOWER POLAO',     '94% name evidence'),
  ('existing_members', 'Tudela',            'Colambutan Settlement - 341', 'TUDELA',            'CALAMBUTAN SETTLEMENT',         '93% name evidence'),
  ('existing_members', 'City of Tangub',    'Barangay 5',                  'CITY OF TANGUB',    'BARANGAY V - MALUBOG',          '95% name evidence'),
  ('existing_members', 'City of Tangub',    'Barangay 3',                  'CITY OF TANGUB',    'BARANGAY III- MARKET KALUBIAN', '96% name evidence'),
  ('existing_members', 'Aloran',            'Matipas',                     'ALORAN',            'MATIPAZ',                       '94% name evidence'),
  ('existing_members', 'City of Tangub',    'Barangay 4',                  'CITY OF TANGUB',    'BARANGAY IV - ST. MICHAEL',     '96% name evidence'),
  ('existing_members', 'City of Tangub',    'Kauswagon',                   'CITY OF TANGUB',    'KAUSWAGAN',                     '96% name evidence'),
  ('existing_members', 'City of Tangub',    'Barangay 1',                  'CITY OF TANGUB',    'BARANGAY I - CITY HALL',        '93% name evidence'),
  ('existing_members', 'City of Tangub',    'Barangay 2',                  'CITY OF TANGUB',    'BARANGAY II - MARILOU ANNEX',   '96% name evidence'),
  ('existing_members', 'City of Tangub',    'Barangay 7',                  'CITY OF TANGUB',    'BARANGAY VII - UPPER POLAO',    '95% name evidence'),
  ('existing_members', 'City of Oroquieta', 'Ciriaco Pastrano',            'CITY OF OROQUIETA', 'CIRIACO C. PASTRANO',           '95% name evidence'),
  ('existing_members', 'City of Tangub',    'Hoyohoy',                     'CITY OF TANGUB',    'HUYOHOY',                       '99% name evidence'),
  ('existing_members', 'City of Tangub',    'Baluc',                       'CITY OF TANGUB',    'BALUK',                         '96% name evidence'),
  ('existing_members', 'City of Tangub',    'Matugnao',                    'CITY OF TANGUB',    'MATUGNAW',                      '97% name evidence'),
  ('existing_members', 'TANGUB CITY',       'BRGY. 2',                     'CITY OF TANGUB',    'BARANGAY II - MARILOU ANNEX',   'Single record; by numbering'),
  ('households',       'PLARIDEL',          'KAUSAWAGAN',                  'PLARIDEL',          'KAUSWAGAN',                     'Typo in census households (330)')
on conflict (source, town_key, barangay_key) do nothing;
-- Not listed on purpose (their keys already resolve via town_key/brgy_key):
--   'Tangub City' / 'Barangay 5'  -> same keys as 'City of Tangub' / 'Barangay 5'
--   'CITY OF OZAMIZ' / 'manningcol' -> same keys as 'City of Ozamiz' / 'Manningcol'

-- ---------------------------------------------------------------------------
-- Match results (staging; reviewed before anything is applied)
-- ---------------------------------------------------------------------------

create table if not exists asenso.ap_match_results (
  id                         bigint generated always as identity primary key,
  -- Who: a family member row, or the husband/wife slot of a families row.
  person_type                text not null check (person_type in ('member', 'husband', 'wife')),
  person_id                  bigint not null,  -- family_members.id or families.id
  fullname                   text,             -- as encoded in the census
  linked_voter_id            bigint,           -- voter already linked in the census (null = non-registered)
  town                       text,             -- households.address
  barangay                   text,             -- households.barangay

  -- Non-registered people re-checked against asenso.voters (typo = actually registered).
  matched_voter_id           bigint,
  voter_match_status         text check (voter_match_status in ('auto', 'review', 'none')),
  voter_match_reason         text,
  voter_in_census_elsewhere  boolean,          -- matched voter is already encoded in another family

  -- AP membership.
  existing_member_id         bigint,           -- public.existing_members.id (outside Ozamiz)
  em_match_status            text check (em_match_status in ('auto', 'review', 'none')),
  em_match_reason            text,
  ap_source                  text check (ap_source in ('voter_is_ap', 'existing_member', 'non_registered_ap')),
  is_ap                      boolean,

  -- Flags requested for the census.
  new_identified_registered  boolean,
  possible_duplicate         boolean,

  -- Human review of 'review' rows.
  review_decision            text check (review_decision in ('accept', 'reject')),
  reviewed_by                text,
  reviewed_at                timestamptz,

  run_id                     text,
  matched_at                 timestamptz not null default now(),
  unique (person_type, person_id)
);

create index if not exists ap_match_results_voter_status_idx on asenso.ap_match_results (voter_match_status);
create index if not exists ap_match_results_em_status_idx    on asenso.ap_match_results (em_match_status);
create index if not exists ap_match_results_barangay_idx     on asenso.ap_match_results (town, barangay);

alter table asenso.ap_match_results enable row level security;

-- New tables inherit the schema's default grants (anon/authenticated get ALL,
-- including TRUNCATE, which RLS does not block). Only server-side code
-- (service role) may touch these.
revoke all on asenso.ap_match_results from anon, authenticated;
revoke all on asenso.barangay_aliases from anon, authenticated;
