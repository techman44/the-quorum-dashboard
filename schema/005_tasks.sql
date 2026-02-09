-- Tasks: actionable items extracted or created by agents.
-- Tracks status, priority, ownership, deadlines, and provenance.

CREATE TABLE IF NOT EXISTS tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'pending',
    priority        INT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
                                                -- 1 = critical, 5 = low
    owner           TEXT,                       -- who is responsible
    created_by      TEXT,                       -- which agent created this task
    due_at          TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    source_ref_id   UUID,                       -- optional link to originating doc/event
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority   ON tasks (priority);
CREATE INDEX IF NOT EXISTS idx_tasks_owner      ON tasks (owner);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at     ON tasks (due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at);

-- Auto-update updated_at on row modification.
CREATE OR REPLACE FUNCTION update_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_tasks_updated_at();
