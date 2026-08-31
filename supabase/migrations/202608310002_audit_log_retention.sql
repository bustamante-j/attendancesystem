begin;

-- Supabase Cron uses pg_cron. The cleanup runs at 02:15 Asia/Manila (18:15 UTC)
-- and keeps the audit table small without adding work to user-facing requests.
create extension if not exists pg_cron with schema extensions;

create or replace function public.purge_expired_audit_logs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.audit_logs
  where created_at < now() - interval '30 days';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_audit_logs() from public, anon, authenticated;
grant execute on function public.purge_expired_audit_logs() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'attendly-audit-log-retention';

select cron.schedule(
  'attendly-audit-log-retention',
  '15 18 * * *',
  $$select public.purge_expired_audit_logs();$$
);

commit;
