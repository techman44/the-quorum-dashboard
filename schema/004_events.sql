-- Events: discrete observations produced by agents.
-- Covers decisions, insights, critiques, opportunities, and more.

CREATE TABLE IF NOT EXISTS events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      TEXT NOT NULL,
    actor           TEXT,                       -- agent or user that created the event
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    ref_ids         UUID[] DEFAULT '{}',        -- related document/task/event IDs
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_event_type  ON events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_actor       ON events (actor);
CREATE INDEX IF NOT EXISTS idx_events_created_at  ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_events_ref_ids     ON events USING GIN (ref_ids);
