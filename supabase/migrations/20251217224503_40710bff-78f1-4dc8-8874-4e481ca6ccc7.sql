-- Lead Lifecycle State Machine Enhancement
-- Add columns for outreach tracking and state management

-- Add outcome_reason for detailed disposition
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS outcome_reason text;

-- Add booked_at timestamp for when lead is booked
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS booked_at timestamp with time zone;

-- Add converted_client_id to track which client this lead became
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS converted_client_id uuid REFERENCES public.clients(id);

-- Add next_attempt_at for scheduling
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS next_attempt_at timestamp with time zone;

-- Add max_attempts config per lead (default 6)
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS max_attempts integer DEFAULT 6;

-- Create index for outreach queries
CREATE INDEX IF NOT EXISTS idx_leads_status_next_attempt 
ON public.leads(status, next_attempt_at) 
WHERE status IN ('new', 'attempted');

-- Create index for tenant + status queries
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status 
ON public.leads(tenant_id, status);

-- Add comment explaining valid status values
COMMENT ON COLUMN public.leads.status IS 'Lead lifecycle states: new, attempted, contacted, booked, completed, converted, disqualified, unreachable';