-- "Allow viewing" (Settings page, one switch for all municipalities):
-- when true, encoders can open their barangays' Overview and Households
-- pages read-only even while household editing (enable_edit) is off.
-- The Settings switch sets it on every row at once. Starts off.
alter table asenso.location_settings
  add column if not exists allow_view boolean not null default false;
