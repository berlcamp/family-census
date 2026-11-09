-- Track the last time each user signed in to family-census.
-- Set by app/(public)/auth/callback/page.tsx after a successful Google sign-in.
-- Run once in the Supabase SQL Editor. Additive only. To undo:
--   drop index if exists asenso.users_last_signin_at_idx;
--   alter table asenso.users drop column if exists last_signin_at;

alter table asenso.users
  add column if not exists last_signin_at timestamptz;

-- One-time backfill from Supabase Auth. Note: auth.users is shared by every app
-- on this project, so a backfilled value may be a sign-in to another app with
-- the same Google account. From now on the column only records this system.
update asenso.users u
set last_signin_at = a.last_sign_in_at
from auth.users a
where lower(a.email) = lower(u.email)
  and u.last_signin_at is null
  and a.last_sign_in_at is not null;

create index if not exists users_last_signin_at_idx
  on asenso.users (last_signin_at desc nulls last);
