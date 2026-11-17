-- Owner-controlled visibility per municipality (Settings page).
--   show_user_logs: everyone who can open the municipality's households pages
--                   sees the User logs download (otherwise owner only).
--   show_ap_badge:  everyone who can open them sees the AP badges (otherwise
--                   only the owner and province admins).
-- Both start off, so nothing changes until the owner turns them on.
alter table asenso.location_settings
  add column if not exists show_user_logs boolean not null default false,
  add column if not exists show_ap_badge boolean not null default false;
