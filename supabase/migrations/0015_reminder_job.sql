-- ============================================================================
-- PRABAS Food Planner · 0015 the reminder job
--
-- Every 15 minutes, call the send-reminders Edge Function, which sends what's due.
-- Apply this after the function is deployed and these two Vault secrets exist (made
-- once in the SQL editor, never in a file; see docs/REMINDERS_SETUP.md):
--   reminders_function_url  https://<project ref>.supabase.co/functions/v1/send-reminders
--   reminders_cron_secret   the same value as the function's CRON_SECRET secret
-- The function is deployed with "Verify JWT" off: it checks the secret itself.
-- Needs the pg_cron and pg_net extensions (Database > Extensions).
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Safe to apply again: the old job is replaced.
select cron.unschedule(jobid) from cron.job where jobname = 'send-reminders';

select cron.schedule(
  'send-reminders',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

-- A quick look at whether it's running (newest first):
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'send-reminders')
--   order by start_time desc limit 5;
-- And what the function said back:
--   select status_code, content, created from net._http_response order by created desc limit 5;
