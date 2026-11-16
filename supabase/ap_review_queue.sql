-- AP review queue: per-barangay counts of names the matcher could not decide
-- (is_ap is null). Used by the owner-only /ap-review screen through
-- app/api/ap-review (service role). Read-only view; no data is changed.

create or replace view asenso.ap_review_queue_summary
with (security_invoker = true)
as
select
  town,
  barangay,
  count(*)                                             as to_review,
  count(*) filter (where review_decision is not null)  as reviewed
from asenso.ap_match_results
where is_ap is null
group by town, barangay;

revoke all on asenso.ap_review_queue_summary from anon, authenticated;
