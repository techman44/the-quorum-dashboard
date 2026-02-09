-- Documents: the primary unit of stored knowledge.
-- Each document can be chunked for finer-grained embedding and retrieval.

CREATE TABLE IF NOT EXISTS documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_type        TEXT NOT NULL DEFAULT 'note',
    source          TEXT,                       -- which agent or system created this
    title           TEXT,
    content         TEXT NOT NULL,
    metadata        JSONB DEFAULT '{}',
    tags            TEXT[] DEFAULT '{}',
    owner_id        TEXT,                       -- optional ownership (user, team, project)
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_documents_doc_type   ON documents (doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_source     ON documents (source);
CREATE INDEX IF NOT EXISTS idx_documents_tags       ON documents USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_documents_owner_id   ON documents (owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at);

-- Auto-update updated_at on row modification.
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_documents_updated_at();


-- Document chunks: subdivisions of a document for granular embedding.
CREATE TABLE IF NOT EXISTS document_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    chunk_index     INT NOT NULL,
    content         TEXT NOT NULL,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks (document_id);
