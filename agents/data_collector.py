"""The Data Collector -- generic ingestion, normalization, chunking, and embedding.

Accepts raw content from external sources (email, files, web pages, notes),
normalizes it via the LLM, chunks it for embedding, and stores everything
in the memory system. Can be invoked directly with a file path or piped
content, or called programmatically by other agents.
"""

import json
import logging
import sys
from pathlib import Path
from typing import Optional

from agents.base import QuorumAgent

logger = logging.getLogger("quorum.data_collector")

_PROMPT_PATH = Path(__file__).parent / "prompts" / "data_collector.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text() if _PROMPT_PATH.exists() else ""

# Maximum characters to send to the LLM for normalization.
_MAX_LLM_INPUT = 15_000

# Target chunk size in characters (roughly 500-1500 tokens).
_DEFAULT_CHUNK_SIZE = 3000


class DataCollectorAgent(QuorumAgent):
    """Ingests, normalizes, chunks, and embeds external content."""

    def __init__(self):
        super().__init__("data_collector")
        self._pending_items: list[dict] = []

    def queue_item(
        self,
        source_type: str,
        raw_content: str,
        source_metadata: Optional[dict] = None,
    ) -> None:
        """Add an item to the ingestion queue for this run.

        Args:
            source_type: One of 'email', 'file', 'web', 'note', 'record'.
            raw_content: The raw text content to ingest.
            source_metadata: Optional dict with source-specific fields
                             (e.g., sender, url, file_path).
        """
        self._pending_items.append(
            {
                "source_type": source_type,
                "raw_content": raw_content,
                "source_metadata": source_metadata or {},
            }
        )

    # ------------------------------------------------------------------
    # Normalization via LLM
    # ------------------------------------------------------------------

    def _normalize_with_llm(self, item: dict) -> dict:
        """Ask the LLM to normalize and classify the raw content."""
        payload = json.dumps(
            {
                "source_type": item["source_type"],
                "raw_content": item["raw_content"][:_MAX_LLM_INPUT],
                "source_metadata": item["source_metadata"],
            },
            default=str,
        )

        raw = self.call_llm(SYSTEM_PROMPT, payload)

        # Parse response.
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning("LLM normalization failed, using fallback.")
            return self._fallback_normalize(item)

    def _fallback_normalize(self, item: dict) -> dict:
        """Simple rule-based fallback when the LLM is unavailable or fails."""
        source_type = item["source_type"]
        raw = item["raw_content"]
        meta = item["source_metadata"]

        # Derive a title from metadata or the first line.
        title = meta.get("subject") or meta.get("filename") or meta.get("url") or ""
        if not title:
            first_line = raw.split("\n", 1)[0].strip()
            title = first_line[:120] if first_line else "Untitled"

        doc_type_map = {
            "email": "email",
            "file": "file",
            "web": "web",
            "note": "note",
            "record": "record",
        }

        return {
            "title": title,
            "doc_type": doc_type_map.get(source_type, "note"),
            "content": raw,
            "tags": [source_type],
            "metadata": meta,
            "chunks": [],
        }

    # ------------------------------------------------------------------
    # Chunking
    # ------------------------------------------------------------------

    def _chunk_content(self, content: str, chunk_size: int = _DEFAULT_CHUNK_SIZE) -> list[dict]:
        """Split content into chunks at paragraph boundaries.

        Returns a list of dicts with 'content' and 'metadata' keys.
        """
        if len(content) <= chunk_size:
            return []  # No chunking needed; the full document will be embedded.

        paragraphs = content.split("\n\n")
        chunks: list[dict] = []
        current_chunk = ""
        chunk_idx = 0

        for para in paragraphs:
            if len(current_chunk) + len(para) + 2 > chunk_size and current_chunk:
                chunks.append(
                    {
                        "content": current_chunk.strip(),
                        "metadata": {"chunk_index": chunk_idx},
                    }
                )
                chunk_idx += 1
                current_chunk = para
            else:
                current_chunk = current_chunk + "\n\n" + para if current_chunk else para

        # Flush the last chunk.
        if current_chunk.strip():
            chunks.append(
                {
                    "content": current_chunk.strip(),
                    "metadata": {"chunk_index": chunk_idx},
                }
            )

        return chunks

    # ------------------------------------------------------------------
    # Storage
    # ------------------------------------------------------------------

    def _store_normalized(self, normalized: dict) -> str:
        """Store a normalized document and its chunks."""
        doc_id = self.store_document(
            doc_type=normalized.get("doc_type", "note"),
            title=normalized.get("title", "Untitled"),
            content=normalized.get("content", ""),
            metadata=normalized.get("metadata", {}),
            tags=normalized.get("tags", []),
        )

        # Use LLM-provided chunks or generate our own.
        chunks = normalized.get("chunks") or self._chunk_content(
            normalized.get("content", "")
        )

        conn = self.connect_db()
        cur = conn.cursor()

        for idx, chunk in enumerate(chunks):
            chunk_content = chunk.get("content", "")
            if not chunk_content.strip():
                continue

            cur.execute(
                """
                INSERT INTO document_chunks (document_id, chunk_index, content, metadata)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                [
                    doc_id,
                    idx,
                    chunk_content,
                    json.dumps(chunk.get("metadata", {})),
                ],
            )
            chunk_id = cur.fetchone()[0]

            # Embed the chunk.
            vec = self.embed_text(chunk_content[:8000])
            cur.execute(
                """
                INSERT INTO embeddings (ref_type, ref_id, embedding, model_name)
                VALUES ('document_chunk', %s, %s::vector, %s)
                ON CONFLICT (ref_type, ref_id)
                    DO UPDATE SET embedding = EXCLUDED.embedding
                """,
                [chunk_id, '[' + ','.join(str(x) for x in vec) + ']',
                 "text-embedding-3-small" if self.config["embedding_provider"] == "openai"
                 else self.config["ollama_embed_model"]],
            )

        conn.commit()
        cur.close()
        return doc_id

    # ------------------------------------------------------------------
    # Main run
    # ------------------------------------------------------------------

    def run(self) -> str:
        if not self._pending_items:
            logger.info("No items queued for ingestion.")
            return "No items to ingest."

        ingested = 0
        failed = 0

        for item in self._pending_items:
            try:
                normalized = self._normalize_with_llm(item)
                self._store_normalized(normalized)
                ingested += 1
            except Exception as exc:
                logger.error("Failed to ingest item: %s", exc)
                failed += 1

        self._pending_items.clear()
        summary = f"Ingested {ingested} items, {failed} failures."
        logger.info(summary)
        return summary


def ingest_file(file_path: str) -> None:
    """Convenience function: read a file and ingest it."""
    path = Path(file_path)
    if not path.exists():
        logger.error("File not found: %s", file_path)
        return

    content = path.read_text(errors="replace")
    agent = DataCollectorAgent()

    source_meta = {
        "filename": path.name,
        "file_path": str(path.resolve()),
        "file_size": path.stat().st_size,
    }

    agent.queue_item(
        source_type="file",
        raw_content=content,
        source_metadata=source_meta,
    )
    agent.execute()


def ingest_text(text: str, source_type: str = "note", metadata: Optional[dict] = None) -> None:
    """Convenience function: ingest arbitrary text."""
    agent = DataCollectorAgent()
    agent.queue_item(source_type=source_type, raw_content=text, source_metadata=metadata or {})
    agent.execute()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    if len(sys.argv) > 1:
        # Ingest a file from the command line.
        ingest_file(sys.argv[1])
    elif not sys.stdin.isatty():
        # Ingest piped stdin.
        content = sys.stdin.read()
        if content.strip():
            ingest_text(content, source_type="note")
        else:
            logger.info("Empty input, nothing to ingest.")
    else:
        print("Usage:")
        print("  python agents/data_collector.py <file_path>")
        print("  echo 'some text' | python agents/data_collector.py")
