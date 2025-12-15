-- Migration 5: User Preferences and Relationship Memory Tables

-- user_preferences table for personalized AI interactions
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  preferred_name text,
  communication_style text DEFAULT 'balanced',
  celebration_preference text DEFAULT 'normal',
  timezone text DEFAULT 'America/New_York',
  notification_preferences jsonb DEFAULT '{"daily_summary": true, "instant_alerts": true, "weekly_wins": true}'::jsonb,
  working_hours jsonb DEFAULT '{"start": "08:00", "end": "18:00", "days": ["mon","tue","wed","thu","fri"]}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

-- relationship_memory table for AI to remember user context
CREATE TABLE IF NOT EXISTS relationship_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  memory_type text NOT NULL,
  content text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,
  importance_score integer DEFAULT 5,
  last_referenced_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationship_memory ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_preferences
CREATE POLICY "Users can view their own preferences" ON user_preferences 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences" ON user_preferences 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences" ON user_preferences 
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for relationship_memory
CREATE POLICY "Users can view their own memories" ON relationship_memory 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own memories" ON relationship_memory 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own memories" ON relationship_memory 
  FOR UPDATE USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_tenant_id ON user_preferences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_relationship_memory_user_id ON relationship_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_relationship_memory_type ON relationship_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_relationship_memory_importance ON relationship_memory(importance_score DESC);

-- Trigger for updated_at on user_preferences
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();