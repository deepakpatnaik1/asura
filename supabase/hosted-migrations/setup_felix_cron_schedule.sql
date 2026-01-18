-- Felix Daily Check Cron Setup for Hosted Supabase
-- Run this in the Supabase Dashboard SQL Editor (https://supabase.com/dashboard)
-- Project: msplfgmzkuvtiwxfypwy

-- Step 1: Enable required extensions (may already be enabled)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Step 2: Store project URL in vault
select vault.create_secret(
  'https://msplfgmzkuvtiwxfypwy.supabase.co',
  'felix_project_url'
);

-- Step 3: Store service role key in vault (for Edge Function auth)
-- Get your service_role key from: Supabase Dashboard > Project Settings > API > service_role (secret)
-- NEVER commit the actual key to git!
select vault.create_secret(
  'YOUR_SERVICE_ROLE_KEY_HERE',  -- Replace with actual key when running in SQL Editor
  'felix_service_key'
);

-- Step 4: Schedule the Edge Function to run at 8 AM UTC (9 AM Berlin winter time)
select cron.schedule(
  'felix-daily-check',           -- job name
  '0 8 * * *',                   -- 8 AM UTC = 9 AM CET (Berlin winter)
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'felix_project_url')
           || '/functions/v1/felix-daily-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'felix_service_key')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron', 'time', now())
  ) as request_id;
  $$
);

-- Step 5: Verify the job was created
select jobid, jobname, schedule, command from cron.job where jobname = 'felix-daily-check';

-- To check job history after it runs:
-- select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'felix-daily-check') order by start_time desc limit 10;

-- To manually test the job:
-- select cron.run_job((select jobid from cron.job where jobname = 'felix-daily-check'));

-- To unschedule (if needed):
-- select cron.unschedule('felix-daily-check');
