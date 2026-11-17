-- Separate switch for editing a barangay's purok list (Overview tab), so it
-- no longer rides on enable_edit (which also controls household editing).
-- Initialised from enable_edit so current behaviour is unchanged.
alter table asenso.location_settings
  add column if not exists enable_purok_edit boolean not null default false;

update asenso.location_settings
set enable_purok_edit = enable_edit
where enable_purok_edit is distinct from enable_edit;
