-- Fix security definer view - drop and recreate without SECURITY DEFINER
DROP VIEW IF EXISTS public.monthly_ai_spend;

CREATE VIEW public.monthly_ai_spend WITH (security_invoker = true) AS
SELECT 
  DATE_TRUNC('month', created_at) as month,
  agent_name,
  SUM(cost_usd) as total_cost_usd,
  COUNT(*) as request_count
FROM public.ai_cost_log
WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', created_at), agent_name;