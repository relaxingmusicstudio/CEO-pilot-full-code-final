-- =============================================================================
-- PHASE 1: IDEMPOTENT CRON SCHEDULING FOR RECONCILIATION
-- =============================================================================

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  -- Find existing job by name
  SELECT jobid INTO v_jobid 
  FROM cron.job 
  WHERE jobname = 'ceo-scheduler-reconcile-pg-net';
  
  -- Unschedule if exists
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
    RAISE NOTICE 'Unscheduled existing job: ceo-scheduler-reconcile-pg-net (jobid: %)', v_jobid;
  END IF;
  
  -- Schedule fresh
  PERFORM cron.schedule(
    'ceo-scheduler-reconcile-pg-net',
    '*/5 * * * *',
    'SELECT public.reconcile_scheduler_pg_net();'
  );
  RAISE NOTICE 'Scheduled ceo-scheduler-reconcile-pg-net (every 5 minutes)';
  
EXCEPTION WHEN undefined_table OR insufficient_privilege THEN
  RAISE NOTICE 'pg_cron not available or insufficient privileges. Skipping cron job setup.';
WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule cron job: %', SQLERRM;
END;
$$;