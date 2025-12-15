-- Migration 1: Enhance business_profile as business_dna
ALTER TABLE business_profile ADD COLUMN IF NOT EXISTS industry text DEFAULT 'hvac';
ALTER TABLE business_profile ADD COLUMN IF NOT EXISTS target_customer_description text;
ALTER TABLE business_profile ADD COLUMN IF NOT EXISTS brand_voice jsonb DEFAULT '{"tone": "professional", "personality": "friendly", "formality": "casual-professional"}'::jsonb;
ALTER TABLE business_profile ADD COLUMN IF NOT EXISTS unique_selling_points text[];
ALTER TABLE business_profile ADD COLUMN IF NOT EXISTS main_competitors text[];
ALTER TABLE business_profile ADD COLUMN IF NOT EXISTS pain_points text[];
ALTER TABLE business_profile ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
ALTER TABLE business_profile ADD COLUMN IF NOT EXISTS onboarding_progress jsonb DEFAULT '{}'::jsonb;