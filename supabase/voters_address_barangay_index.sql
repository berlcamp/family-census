-- Speeds up the family form's barangay voter preload, which filters
-- voters with address ILIKE '%town%' AND barangay ILIKE '%barangay%'.
-- Without it every households page load scanned all ~441k voters (2-4 s).
-- Applied 2026-11-16. CONCURRENTLY: built without locking the table; run it
-- outside a transaction.
create index concurrently if not exists voters_address_barangay_trgm_idx
  on asenso.voters using gin (address gin_trgm_ops, barangay gin_trgm_ops);
