"""Base class for Quorum agents.

Every agent in the quorum inherits from QuorumAgent, which provides:
- PostgreSQL connection management
- Embedding generation (Ollama or OpenAI)
- Semantic memory search over all stored content
- Document, event, and task storage helpers
- LLM inference (Ollama, Anthropic, or OpenAI)
- Agent run logging for audit and scheduling
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

logger = logging.getLogger("quorum")


class QuorumAgent:
    """Base class providing shared memory operations for all Quorum agents."""

    def __init__(self, agent_name: str):
        self.agent_name = agent_name
        self.db_conn: Optional[psycopg2.extensions.connection] = None
        self.config = self._load_config()

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------

    def _load_config(self) -> dict:
        """Load configuration from environment variables with sensible defaults."""
        load_dotenv()
        return {
            "db_host": os.getenv("DB_HOST", "localhost"),
            "db_port": int(os.getenv("DB_PORT", "5432")),
            "db_user": os.getenv("DB_USER", "quorum"),
            "db_password": os.getenv("DB_PASSWORD", "changeme"),
            "db_name": os.getenv("DB_NAME", "quorum"),
            "embedding_provider": os.getenv("EMBEDDING_PROVIDER", "ollama"),
            "ollama_host": os.getenv("OLLAMA_HOST", "http://localhost:11434"),
            "ollama_embed_model": os.getenv("OLLAMA_EMBED_MODEL", "mxbai-embed-large"),
            "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
            "llm_provider": os.getenv("LLM_PROVIDER", "ollama"),
            "llm_model": os.getenv("LLM_MODEL", "llama3.2"),
            "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY", ""),
            "timezone": os.getenv("AGENT_TIMEZONE", "UTC"),
        }

    # ------------------------------------------------------------------
    # Database helpers
    # ------------------------------------------------------------------

    def connect_db(self) -> psycopg2.extensions.connection:
        """Open (or return existing) database connection."""
        if self.db_conn is None or self.db_conn.closed:
            self.db_conn = psycopg2.connect(
                host=self.config["db_host"],
                port=self.config["db_port"],
                user=self.config["db_user"],
                password=self.config["db_password"],
                dbname=self.config["db_name"],
            )
            psycopg2.extras.register_uuid()
        return self.db_conn

    def disconnect_db(self) -> None:
        """Close the database connection if open."""
        if self.db_conn and not self.db_conn.closed:
            self.db_conn.close()

    # ------------------------------------------------------------------
    # Embedding generation
    # ------------------------------------------------------------------

    def embed_text(self, text: str) -> list[float]:
        """Generate an embedding vector for *text* using the configured provider."""
        provider = self.config["embedding_provider"]

        if provider == "ollama":
            resp = requests.post(
                f"{self.config['ollama_host']}/api/embed",
                json={"model": self.config["ollama_embed_model"], "input": text},
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()["embeddings"][0]

        if provider == "openai":
            resp = requests.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {self.config['openai_api_key']}"},
                json={"model": "text-embedding-3-small", "input": text, "dimensions": 1024},
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()["data"][0]["embedding"]

        raise ValueError(f"Unknown embedding provider: {provider}")

    # ------------------------------------------------------------------
    # Semantic memory search
    # ------------------------------------------------------------------

    def search_memory(
        self,
        query: str,
        limit: int = 10,
        ref_type: Optional[str] = None,
    ) -> list[dict]:
        """Semantic search across all embedded memory.

        Returns a list of dicts, each containing the matching row's fields
        plus a cosine-similarity ``score``.
        """
        query_vec = self.embed_text(query)
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        sql = """
            SELECT e.ref_type, e.ref_id,
                   1 - (e.embedding <=> %s::vector) AS score
            FROM embeddings e
            WHERE 1=1
        """
        params: list = ['[' + ','.join(str(x) for x in query_vec) + ']']

        if ref_type:
            sql += " AND e.ref_type = %s"
            params.append(ref_type)

        sql += " ORDER BY e.embedding <=> %s::vector LIMIT %s"
        params.extend(['[' + ','.join(str(x) for x in query_vec) + ']', limit])

        cur.execute(sql, params)
        results = cur.fetchall()

        # Hydrate each hit with the actual content row.
        enriched: list[dict] = []
        for row in results:
            content = self._fetch_content(cur, row["ref_type"], row["ref_id"])
            if content:
                enriched.append({**row, **content})

        cur.close()
        return enriched

    def _fetch_content(self, cur, ref_type: str, ref_id) -> Optional[dict]:
        """Fetch the full content row for a given reference type and ID."""
        table_map = {
            "document": "documents",
            "document_chunk": "document_chunks",
            "conversation_turn": "conversation_turns",
            "event": "events",
            "task": "tasks",
        }
        table = table_map.get(ref_type)
        if not table:
            return None
        cur.execute(f"SELECT * FROM {table} WHERE id = %s", [ref_id])
        row = cur.fetchone()
        return dict(row) if row else None

    # ------------------------------------------------------------------
    # Storage helpers
    # ------------------------------------------------------------------

    def store_document(
        self,
        doc_type: str,
        title: str,
        content: str,
        metadata: Optional[dict] = None,
        tags: Optional[list[str]] = None,
    ) -> str:
        """Store a document and generate its embedding. Returns the document UUID."""
        conn = self.connect_db()
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO documents (doc_type, source, title, content, metadata, tags)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            [
                doc_type,
                self.agent_name,
                title,
                content,
                json.dumps(metadata or {}),
                tags or [],
            ],
        )
        doc_id = cur.fetchone()[0]

        # Embed the first 8 000 characters (model context-window safety).
        vec = self.embed_text(content[:8000])
        cur.execute(
            """
            INSERT INTO embeddings (ref_type, ref_id, embedding, model_name)
            VALUES ('document', %s, %s::vector, %s)
            ON CONFLICT (ref_type, ref_id)
                DO UPDATE SET embedding = EXCLUDED.embedding
            """,
            [doc_id, '[' + ','.join(str(x) for x in vec) + ']',
             "text-embedding-3-small" if self.config["embedding_provider"] == "openai"
             else self.config["ollama_embed_model"]],
        )

        conn.commit()
        cur.close()
        return str(doc_id)

    def store_event(
        self,
        event_type: str,
        title: str,
        description: str,
        metadata: Optional[dict] = None,
        ref_ids: Optional[list[str]] = None,
    ) -> str:
        """Log an event. Returns the event UUID."""
        conn = self.connect_db()
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO events (event_type, actor, title, description, ref_ids, metadata)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            [
                event_type,
                self.agent_name,
                title,
                description,
                ref_ids or [],
                json.dumps(metadata or {}),
            ],
        )
        event_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        return str(event_id)

    def upsert_task(
        self,
        title: str,
        description: str = "",
        status: str = "pending",
        priority: int = 3,
        owner: Optional[str] = None,
        due_at=None,
        metadata: Optional[dict] = None,
    ) -> str:
        """Create a task. Returns the task UUID."""
        conn = self.connect_db()
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO tasks
                (title, description, status, priority, owner, created_by, due_at, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            [
                title,
                description,
                status,
                priority,
                owner,
                self.agent_name,
                due_at,
                json.dumps(metadata or {}),
            ],
        )
        task_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        return str(task_id)

    # ------------------------------------------------------------------
    # LLM inference
    # ------------------------------------------------------------------

    def call_llm(self, system_prompt: str, user_message: str) -> str:
        """Call the configured LLM and return the assistant response text."""
        provider = self.config["llm_provider"]

        if provider == "ollama":
            resp = requests.post(
                f"{self.config['ollama_host']}/api/chat",
                json={
                    "model": self.config["llm_model"],
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "stream": False,
                },
                timeout=120,
            )
            resp.raise_for_status()
            return resp.json()["message"]["content"]

        if provider == "anthropic":
            resp = requests.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.config["anthropic_api_key"],
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.config["llm_model"],
                    "max_tokens": 4096,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_message}],
                },
                timeout=120,
            )
            resp.raise_for_status()
            return resp.json()["content"][0]["text"]

        if provider == "openai":
            resp = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.config['openai_api_key']}"
                },
                json={
                    "model": self.config["llm_model"],
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                },
                timeout=120,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

        raise ValueError(f"Unknown LLM provider: {provider}")

    # ------------------------------------------------------------------
    # Agent run logging
    # ------------------------------------------------------------------

    def log_run(self, status: str, summary: str = "", metadata: Optional[dict] = None) -> None:
        """Insert an audit row for this agent execution."""
        conn = self.connect_db()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO agent_runs (agent_name, started_at, completed_at, status, summary, metadata)
            VALUES (%s, NOW(), NOW(), %s, %s, %s)
            """,
            [self.agent_name, status, summary, json.dumps(metadata or {})],
        )
        conn.commit()
        cur.close()

    # ------------------------------------------------------------------
    # Execution harness
    # ------------------------------------------------------------------

    def run(self):
        """Override in subclass. Contains the main agent logic."""
        raise NotImplementedError("Subclasses must implement run()")

    def execute(self) -> None:
        """Run the agent with connection management, logging, and error handling."""
        logger.info(f"[{self.agent_name}] Starting run")
        try:
            self.connect_db()
            result = self.run()
            self.log_run("completed", summary=str(result) if result else "")
            logger.info(f"[{self.agent_name}] Completed")
        except Exception as exc:
            logger.error(f"[{self.agent_name}] Failed: {exc}")
            try:
                self.log_run("failed", summary=str(exc))
            except Exception:
                pass
            raise
        finally:
            self.disconnect_db()
