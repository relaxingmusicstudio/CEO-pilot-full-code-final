-- CEO Conversations table for persistent chat history
CREATE TABLE public.ceo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'Business Strategy Session',
  messages JSONB DEFAULT '[]'::jsonb,
  context JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one active conversation per user/tenant
CREATE UNIQUE INDEX ceo_conversations_active_idx ON public.ceo_conversations(user_id, tenant_id) WHERE is_active = true;
CREATE INDEX ceo_conversations_tenant_idx ON public.ceo_conversations(tenant_id);
CREATE INDEX ceo_conversations_user_idx ON public.ceo_conversations(user_id);

-- CEO Strategic Plan table for 2-week rolling plans
CREATE TABLE public.ceo_strategic_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  plan_horizon_days INTEGER DEFAULT 14,
  current_phase TEXT DEFAULT 'foundation',
  weekly_objectives JSONB DEFAULT '[]'::jsonb,
  daily_focus JSONB DEFAULT '[]'::jsonb,
  agent_workloads JSONB DEFAULT '{}'::jsonb,
  milestones JSONB DEFAULT '[]'::jsonb,
  blockers JSONB DEFAULT '[]'::jsonb,
  next_review_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  auto_adjust BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ceo_strategic_plan_tenant_idx ON public.ceo_strategic_plan(tenant_id);

-- CEO Agent Delegations table for tracking agent tasks
CREATE TABLE public.ceo_agent_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.ceo_conversations(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  delegated_to TEXT NOT NULL,
  task_description TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress',
  priority TEXT DEFAULT 'medium',
  input_context JSONB DEFAULT '{}'::jsonb,
  output_result JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  visible_in_chat BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ceo_agent_delegations_conversation_idx ON public.ceo_agent_delegations(conversation_id);
CREATE INDEX ceo_agent_delegations_tenant_idx ON public.ceo_agent_delegations(tenant_id);
CREATE INDEX ceo_agent_delegations_status_idx ON public.ceo_agent_delegations(status);

-- Enable RLS
ALTER TABLE public.ceo_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ceo_strategic_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ceo_agent_delegations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ceo_conversations
CREATE POLICY "Users can view own conversations" ON public.ceo_conversations
  FOR SELECT USING (auth.uid() = user_id OR tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert own conversations" ON public.ceo_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id OR tenant_id = get_user_tenant_id());

CREATE POLICY "Users can update own conversations" ON public.ceo_conversations
  FOR UPDATE USING (auth.uid() = user_id OR tenant_id = get_user_tenant_id());

CREATE POLICY "Service role full access conversations" ON public.ceo_conversations
  FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for ceo_strategic_plan
CREATE POLICY "Users can view tenant plan" ON public.ceo_strategic_plan
  FOR SELECT USING (tenant_id = get_user_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "Users can manage tenant plan" ON public.ceo_strategic_plan
  FOR ALL USING (tenant_id = get_user_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "Service role full access plan" ON public.ceo_strategic_plan
  FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for ceo_agent_delegations
CREATE POLICY "Users can view tenant delegations" ON public.ceo_agent_delegations
  FOR SELECT USING (tenant_id = get_user_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "Users can insert delegations" ON public.ceo_agent_delegations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update delegations" ON public.ceo_agent_delegations
  FOR UPDATE USING (tenant_id = get_user_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "Service role full access delegations" ON public.ceo_agent_delegations
  FOR ALL USING (true) WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_ceo_conversations_updated_at
  BEFORE UPDATE ON public.ceo_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ceo_strategic_plan_updated_at
  BEFORE UPDATE ON public.ceo_strategic_plan
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();