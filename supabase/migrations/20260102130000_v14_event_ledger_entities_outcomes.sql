-- v14 database spine: events, entities, outcomes, and links.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON public.entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON public.entities(name);

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id UUID,
  subject_type TEXT,
  subject_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace_id TEXT,
  prev_event_id UUID,
  CONSTRAINT events_prev_event_fk FOREIGN KEY (prev_event_id) REFERENCES public.events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON public.events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON public.events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_actor_id ON public.events(actor_id);
CREATE INDEX IF NOT EXISTS idx_events_trace_id ON public.events(trace_id);

CREATE TABLE IF NOT EXISTS public.outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  related_event_id UUID,
  outcome_type TEXT NOT NULL,
  score NUMERIC,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT outcomes_event_fk FOREIGN KEY (related_event_id) REFERENCES public.events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_outcomes_related_event ON public.outcomes(related_event_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_type ON public.outcomes(outcome_type);
CREATE INDEX IF NOT EXISTS idx_outcomes_ts ON public.outcomes(ts DESC);

CREATE TABLE IF NOT EXISTS public.links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id UUID,
  to_entity_id UUID,
  link_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT links_from_entity_fk FOREIGN KEY (from_entity_id) REFERENCES public.entities(id) ON DELETE CASCADE,
  CONSTRAINT links_to_entity_fk FOREIGN KEY (to_entity_id) REFERENCES public.entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_links_from_entity ON public.links(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_links_to_entity ON public.links(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_links_type ON public.links(link_type);

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;
