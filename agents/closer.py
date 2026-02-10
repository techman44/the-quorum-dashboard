"""The Closer -- verifies completion and closes loops.

Scans recent conversations for user claims of completed work, searches for
supporting evidence, and updates task status when verification succeeds.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import psycopg2.extras

from agents.base import QuorumAgent

logger = logging.getLogger("quorum.closer")

_PROMPT_PATH = Path(__file__).parent / "prompts" / "closer.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text() if _PROMPT_PATH.exists() else ""

# How far back to look for recent claims (hours).
_DEFAULT_LOOKBACK_HOURS = 24

# Patterns that indicate a completion claim.
_COMPLETION_PATTERNS = [
    "i did", "i have done", "i finished", "i completed", "i've done",
    "i've finished", "i've completed", "just finished", "just completed",
    "done and done", "all done", "that's done", "that is done",
    "sent it", "emailed", "called", "posted", "deployed", "shipped",
    "merged", "pushed", "submitted", "uploaded", "published",
]


class CloserAgent(QuorumAgent):
    """Verifies completion claims and closes task loops."""

    def __init__(self, lookback_hours: int = _DEFAULT_LOOKBACK_HOURS):
        super().__init__("closer")
        self.lookback_hours = lookback_hours

    # ------------------------------------------------------------------
    # Data retrieval
    # ------------------------------------------------------------------

    def _recent_conversations_with_claims(self) -> list[dict]:
        """Fetch recent user turns that may contain completion claims."""
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        since = datetime.now(timezone.utc) - timedelta(hours=self.lookback_hours)

        # Build the WHERE clause with pattern matching.
        pattern_conditions = " OR ".join(["LOWER(ct.content) LIKE %s"] * len(_COMPLETION_PATTERNS))
        pattern_values = [f"%{pattern}%" for pattern in _COMPLETION_PATTERNS]

        cur.execute(
            f"""
            SELECT ct.*, c.title AS conversation_title
            FROM conversation_turns ct
            JOIN conversations c ON c.id = ct.conversation_id
            WHERE ct.role = 'user'
              AND ct.created_at >= %s
              AND ({pattern_conditions})
            ORDER BY ct.created_at DESC
            LIMIT 100
            """,
            [since] + pattern_values,
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _open_tasks(self) -> list[dict]:
        """Fetch all non-completed, non-cancelled tasks."""
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            """
            SELECT * FROM tasks
            WHERE status NOT IN ('done', 'cancelled', 'completed')
            ORDER BY priority, created_at
            LIMIT 500
            """
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _recent_events(self, limit: int = 200) -> list[dict]:
        """Fetch recent events that might serve as evidence."""
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        since = datetime.now(timezone.utc) - timedelta(hours=self.lookback_hours)

        cur.execute(
            """
            SELECT * FROM events
            WHERE created_at >= %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            [since, limit],
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _recent_turns(self, limit: int = 200) -> list[dict]:
        """Fetch all recent conversation turns for context."""
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        since = datetime.now(timezone.utc) - timedelta(hours=self.lookback_hours)

        cur.execute(
            """
            SELECT * FROM conversation_turns
            WHERE created_at >= %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            [since, limit],
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Cross-agent context
    # ------------------------------------------------------------------

    def _get_executor_context(self) -> list[dict]:
        """Fetch recent task-related events from the Executor."""
        return self.get_other_agent_events(
            agent_names=["executor"],
            hours=24,
            limit=20,
        )

    def _get_connector_context(self) -> list[dict]:
        """Fetch recent connections that might relate to task completion."""
        return self.get_other_agent_events(
            agent_names=["connector"],
            hours=24,
            limit=15,
        )

    def _get_all_agent_context(self) -> list[dict]:
        """Fetch recent findings from all agents for broader context."""
        return self.get_other_agent_events(
            agent_names=["executor", "strategist", "connector", "devils_advocate", "opportunist"],
            hours=24,
            limit=30,
        )

    # ------------------------------------------------------------------
    # LLM interaction
    # ------------------------------------------------------------------

    def _build_payload(
        self,
        claims: list[dict],
        tasks: list[dict],
        events: list[dict],
        turns: list[dict],
        other_agent_findings: list[dict] = None,
        flagged_for_you: list[dict] = None,
    ) -> str:
        """Build a JSON payload for the LLM."""

        def _serialize(items: list[dict], max_items: int = 100) -> list[dict]:
            out = []
            for item in items[:max_items]:
                serialized = {}
                for k, v in item.items():
                    if isinstance(v, datetime):
                        serialized[k] = v.isoformat()
                    elif hasattr(v, "__str__"):
                        serialized[k] = str(v)
                    else:
                        serialized[k] = v
                out.append(serialized)
            return out

        return json.dumps(
            {
                "user_claims": _serialize(claims, 50),
                "open_tasks": _serialize(tasks, 100),
                "recent_events": _serialize(events, 100),
                "recent_turns": _serialize(turns, 50),
                "other_agent_findings": _serialize(other_agent_findings or [], 30),
                "flagged_for_you": _serialize(flagged_for_you or [], 20),
            },
            default=str,
        )

    def _parse_response(self, raw: str) -> dict:
        """Parse the LLM's structured response."""
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning("Failed to parse LLM response: %s", raw[:200])
            return {
                "verified_completions": [],
                "partial_updates": [],
                "follow_up_flags": [],
                "verification_events": [],
            }

    # ------------------------------------------------------------------
    # Task and event actions
    # ------------------------------------------------------------------

    def _update_task_status(self, task_id: str, new_status: str, notes: str = "") -> bool:
        """Update a task's status and optionally add notes."""
        conn = self.connect_db()
        cur = conn.cursor()
        try:
            if new_status in ("done", "completed"):
                cur.execute(
                    """
                    UPDATE tasks
                    SET status = %s,
                        completed_at = NOW(),
                        metadata = jsonb_set(
                            COALESCE(metadata, '{}'::jsonb),
                            '{verification_notes}',
                            %s
                        )
                    WHERE id = %s::uuid
                    """,
                    [new_status, notes, task_id],
                )
            else:
                cur.execute(
                    """
                    UPDATE tasks
                    SET status = %s,
                        metadata = jsonb_set(
                            COALESCE(metadata, '{}'::jsonb),
                            '{verification_notes}',
                            %s
                        )
                    WHERE id = %s::uuid
                    """,
                    [new_status, notes, task_id],
                )
            conn.commit()
            return True
        except Exception as exc:
            logger.warning("Failed to update task %s: %s", task_id, exc)
            conn.rollback()
            return False
        finally:
            cur.close()

    def _process_verified_completions(self, completions: list[dict]) -> int:
        """Process verified completions and update task status."""
        updated = 0
        for comp in completions:
            task_id = comp.get("task_id")
            if not task_id:
                continue
            evidence = comp.get("evidence_found", "")
            confidence = comp.get("confidence", 0)
            if confidence >= 0.7:
                notes = f"Verified by Closer: {evidence}"
                if self._update_task_status(task_id, "done", notes):
                    updated += 1
                    logger.info("Marked task %s as done (confidence: %.2f)", task_id, confidence)
        return updated

    def _process_partial_updates(self, updates: list[dict]) -> int:
        """Process partial progress updates."""
        updated = 0
        for upd in updates:
            task_id = upd.get("task_id")
            if not task_id:
                continue
            notes = upd.get("progress_notes", "")
            new_status = upd.get("new_status", "in_progress")
            metadata_note = f"Partial progress by Closer: {notes}"
            if self._update_task_status(task_id, new_status, metadata_note):
                updated += 1
                logger.info("Updated task %s with partial progress", task_id)
        return updated

    def _store_verification_events(self, events: list[dict]) -> int:
        """Store verification events."""
        count = 0
        for evt in events:
            try:
                considered_agents = evt.get("considered_agents", ["executor"])
                self.store_event(
                    event_type="verification",
                    title=evt.get("title", "Verification notice"),
                    description=evt.get("description", ""),
                    metadata={"considered_agents": considered_agents},
                )
                count += 1
            except Exception as exc:
                logger.warning("Failed to store verification event: %s", exc)
        return count

    # ------------------------------------------------------------------
    # Main run
    # ------------------------------------------------------------------

    def run(self) -> str:
        claims = self._recent_conversations_with_claims()
        tasks = self._open_tasks()
        events = self._recent_events()
        turns = self._recent_turns()

        if not claims:
            logger.info("No completion claims found in recent conversations.")
            return "No completion claims found."

        logger.info("Found %d potential completion claims.", len(claims))

        # Gather cross-agent context for better verification.
        other_agent_findings = self._get_all_agent_context()
        if other_agent_findings:
            logger.info("Loaded %d findings from other agents for context.", len(other_agent_findings))

        # Check for events specifically flagged for the Closer.
        flagged_for_me = self.get_events_flagged_for_me(hours=24)
        if flagged_for_me:
            logger.info("Found %d events flagged for %s by other agents", len(flagged_for_me), self.agent_name)

        # Ask the LLM to verify claims against tasks and evidence.
        payload = self._build_payload(claims, tasks, events, turns, other_agent_findings, flagged_for_me)
        raw = self.call_llm(SYSTEM_PROMPT, payload)
        parsed = self._parse_response(raw)

        # Process the results.
        completions = parsed.get("verified_completions", [])
        partials = parsed.get("partial_updates", [])
        flags = parsed.get("follow_up_flags", [])
        verification_events = parsed.get("verification_events", [])

        completed_count = self._process_verified_completions(completions)
        partial_count = self._process_partial_updates(partials)
        event_count = self._store_verification_events(verification_events)

        # Create follow-up events for claims that couldn't be verified.
        for flag in flags:
            claim = flag.get("claim", "")[:100]
            reason = flag.get("reason_undetermined", "")
            suggested = flag.get("suggested_action", "")
            description = f"Claim: {claim}\n\nReason: {reason}\n\nSuggested: {suggested}"
            self.store_event(
                event_type="follow_up",
                title="Verification follow-up needed",
                description=description,
                metadata={"considered_agents": ["executor", "strategist"]},
            )

        summary = (
            f"Processed {len(claims)} claims: verified {completed_count} complete, "
            f"updated {partial_count} with partial progress, stored {event_count} verification events, "
            f"flagged {len(flags)} for follow-up."
        )
        logger.info(summary)
        return summary


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Run the Closer agent")
    parser.add_argument("--since", type=str, default="24h", help="Lookback window, e.g. '24h', '48h'")
    args = parser.parse_args()

    # Parse the --since flag into hours.
    since_str = args.since.strip().lower()
    if since_str.endswith("h"):
        hours = int(since_str[:-1])
    elif since_str.endswith("d"):
        hours = int(since_str[:-1]) * 24
    else:
        hours = int(since_str)

    agent = CloserAgent(lookback_hours=hours)
    agent.execute()
