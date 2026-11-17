-- Reports page: read asenso.ap_family_summary with more working memory.
-- At the default work_mem the view spills to disk and takes ~7.5s, which hits
-- the API's 8s statement_timeout ("canceling statement due to statement
-- timeout"). With 64MB it runs in ~3.7s. Read-only; the view is unchanged.
create or replace function asenso.ap_family_summary_report()
returns setof asenso.ap_family_summary
language sql
stable
set work_mem = '64MB'
as $$
  select * from asenso.ap_family_summary;
$$;

revoke all on function asenso.ap_family_summary_report() from public, anon, authenticated;
grant execute on function asenso.ap_family_summary_report() to service_role;

-- Rollback:
-- drop function asenso.ap_family_summary_report();
