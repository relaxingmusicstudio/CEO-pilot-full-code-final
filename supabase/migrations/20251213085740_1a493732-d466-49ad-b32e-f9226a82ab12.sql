-- Channels table for messaging channel configurations
CREATE TABLE public.channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_type TEXT NOT NULL CHECK (channel_type IN ('sms', 'whatsapp', 'email', 'messenger', 'instagram')),
    name TEXT NOT NULL,
    credentials JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    webhook_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Unified contacts table
CREATE TABLE public.contacts_unified (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    email TEXT,
    phone TEXT,
    whatsapp_id TEXT,
    messenger_id TEXT,
    instagram_id TEXT,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    tags TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Unified conversations table
CREATE TABLE public.conversations_unified (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_type TEXT NOT NULL CHECK (channel_type IN ('sms', 'whatsapp', 'email', 'messenger', 'instagram')),
    external_id TEXT,
    contact_id UUID REFERENCES public.contacts_unified(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    unread_count INTEGER DEFAULT 0,
    assigned_to UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Unified messages table
CREATE TABLE public.messages_unified (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations_unified(id) ON DELETE CASCADE NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    content TEXT NOT NULL,
    media_url TEXT,
    status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    is_mock BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Sequences table for automations
CREATE TABLE public.sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'tag_added', 'lead_created', 'conversation_started')),
    steps JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    enrolled_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Sequence enrollments
CREATE TABLE public.sequence_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id UUID REFERENCES public.sequences(id) ON DELETE CASCADE NOT NULL,
    contact_id UUID REFERENCES public.contacts_unified(id) ON DELETE CASCADE NOT NULL,
    current_step INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    next_step_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(sequence_id, contact_id)
);

-- Enable RLS on all tables
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts_unified ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations_unified ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages_unified ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;

-- Channels policies (admin only)
CREATE POLICY "Admins can manage channels" ON public.channels FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Contacts policies
CREATE POLICY "Admins can view all contacts" ON public.contacts_unified FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage contacts" ON public.contacts_unified FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert contacts" ON public.contacts_unified FOR INSERT WITH CHECK (true);

-- Conversations policies
CREATE POLICY "Admins can view all conversations" ON public.conversations_unified FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage conversations" ON public.conversations_unified FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert conversations" ON public.conversations_unified FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update conversations" ON public.conversations_unified FOR UPDATE USING (true);

-- Messages policies
CREATE POLICY "Admins can view all messages" ON public.messages_unified FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage messages" ON public.messages_unified FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert messages" ON public.messages_unified FOR INSERT WITH CHECK (true);

-- Sequences policies
CREATE POLICY "Admins can manage sequences" ON public.sequences FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Sequence enrollments policies
CREATE POLICY "Admins can manage enrollments" ON public.sequence_enrollments FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert enrollments" ON public.sequence_enrollments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update enrollments" ON public.sequence_enrollments FOR UPDATE USING (true);

-- Enable realtime for messages and conversations
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages_unified;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations_unified;

-- Update triggers
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contacts_unified_updated_at BEFORE UPDATE ON public.contacts_unified FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversations_unified_updated_at BEFORE UPDATE ON public.conversations_unified FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sequences_updated_at BEFORE UPDATE ON public.sequences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();