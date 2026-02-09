"""The Onboarding Agent -- guides new users through an initial questionnaire.

On first run, conducts a conversational interview to learn about the user:
who they are, what they're working on, their goals, accountability preferences,
and data sources they'd like to connect. Stores everything as documents, events,
and tasks so the conscience agents have real data from day one.

Usage:
    python -m agents.onboarding          # Run onboarding (skips if already done)
    python -m agents.onboarding --reset  # Re-run even if already completed
"""

import json
import logging
import sys
from pathlib import Path

import psycopg2.extras
import requests

from agents.base import QuorumAgent

logger = logging.getLogger("quorum.onboarding")

# Load the system prompt from the prompts directory.
_PROMPT_PATH = Path(__file__).parent / "prompts" / "onboarding.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text() if _PROMPT_PATH.exists() else ""

# ---------------------------------------------------------------------------
# Section definitions -- each section has a topic, an opening instruction for
# the LLM, a doc_type for storage, and the max exchanges before summarising.
# ---------------------------------------------------------------------------

SECTIONS = [
    {
        "name": "linkedin_resume",
        "doc_type": "onboarding-career",
        "title": "Career Profile (LinkedIn/Resume)",
        "tags": ["onboarding", "career-history", "profile"],
        "max_exchanges": 3,
        "instruction": (
            "Before asking detailed questions, offer the user a shortcut. Say: "
            "'Before we dive in, do you have a LinkedIn profile URL or resume you "
            "can paste here? It saves a lot of typing -- I can extract your career "
            "history, roles, skills, and education in one go, and the agents will "
            "have much richer context to work with. Totally optional though -- if "
            "you'd rather just answer questions, we can do that instead.' "
            "If they share a LinkedIn URL or paste resume text, extract everything: "
            "name, roles, companies, skills, education, certifications. DO NOT store "
            "email addresses or phone numbers. If they decline, just say 'No worries' "
            "and we will cover it in the next section."
        ),
    },
    {
        "name": "about_you",
        "doc_type": "onboarding-profile",
        "title": "User Profile",
        "tags": ["onboarding", "profile"],
        "max_exchanges": 5,
        "instruction": (
            "Learn about the person. If they already shared a LinkedIn profile or "
            "resume in the previous section, skip questions they already answered "
            "and instead confirm what you know: 'I see you are [role] at [company] "
            "-- is that still current?' Then focus on what the profile didn't cover: "
            "current projects, daily tools, and what they are focused on right now. "
            "If they didn't share a profile, start from scratch: ask their name, "
            "role, what they do day-to-day, and their main current projects."
        ),
    },
    {
        "name": "goals",
        "doc_type": "onboarding-goals",
        "title": "Goals and Priorities",
        "tags": ["onboarding", "goals", "priorities"],
        "max_exchanges": 6,
        "instruction": (
            "Now transition to learning about the person's goals and priorities. "
            "Ask about: their top priorities right now, areas where they tend to "
            "procrastinate or lose momentum, where they want to be in 6 months and "
            "12 months, and any pending decisions they are wrestling with. "
            "Adapt your questions based on what they share -- you do not need to "
            "cover every sub-topic if the conversation flows naturally elsewhere."
        ),
    },
    {
        "name": "system_preferences",
        "doc_type": "onboarding-system-config",
        "title": "System Depth and Notification Preferences",
        "tags": ["onboarding", "preferences", "notifications", "system-config"],
        "max_exchanges": 4,
        "instruction": (
            "Ask about how deeply the system should analyse things and how it "
            "should communicate. Present clear options with recommendations:\n\n"
            "1. Analysis depth -- Light (just highlights, safety net), Standard "
            "(recommended -- detailed reflections, pattern recognition, proactive "
            "suggestions), or Deep (comprehensive cross-referencing, rigorous "
            "challenge of all decisions).\n\n"
            "2. Notification frequency -- Real-time (every finding), Batched daily "
            "(recommended -- one summary per day), Weekly digest (one per week), "
            "or On-demand only (no notifications, check when you want).\n\n"
            "3. Information detail -- Brief (headline + one sentence), Standard "
            "(recommended -- headline, context, suggested next step), or "
            "Comprehensive (full analysis with reasoning and related items).\n\n"
            "Ask one preference at a time. Give your recommendation for each."
        ),
    },
    {
        "name": "accountability",
        "doc_type": "onboarding-preferences",
        "title": "Accountability Style",
        "tags": ["onboarding", "preferences", "accountability"],
        "max_exchanges": 4,
        "instruction": (
            "Now ask about how the person wants the agents to talk to them when "
            "pushing back or holding them accountable. Ask about: how direct or "
            "blunt the agents should be when calling out procrastination or missed "
            "commitments, whether there are any topics or areas of their life "
            "that are off-limits for the agents, and any other communication "
            "style preferences or pet peeves."
        ),
    },
    {
        "name": "data_sources",
        "doc_type": "onboarding-data-sources",
        "title": "Data Sources and Integrations",
        "tags": ["onboarding", "integrations", "data-sources"],
        "max_exchanges": 3,
        "instruction": (
            "Finally, ask about external data sources and systems the person "
            "would like to connect to The Quorum in the future. Examples include "
            "calendars, task managers, email, Slack, note-taking tools, fitness "
            "trackers, financial tools, etc. Just learn what they use and what "
            "they would find most valuable to connect -- actual integrations will "
            "come later. Keep this section short."
        ),
    },
]

# Template for asking the LLM to summarise a section.
_SUMMARISE_INSTRUCTION = (
    "Based on the conversation so far in this section, produce a clear, "
    "detailed summary of what you learned. Write it in third person as a "
    "briefing for the other agents. Include every specific detail that was "
    "mentioned -- names, projects, timelines, preferences. Do not editorialize "
    "or add things that were not said. Return ONLY the summary text, no "
    "preamble or headings."
)

# Template for extracting actionable tasks from the goals section.
_EXTRACT_TASKS_INSTRUCTION = (
    "Based on the conversation so far, extract any concrete goals, commitments, "
    "or action items the person mentioned. Return a JSON array of objects, each "
    "with keys: \"title\" (short action-oriented title), \"description\" (one "
    "sentence of context), and \"priority\" (integer 1-5, where 1 is highest). "
    "If there are no clear action items, return an empty array. Return ONLY "
    "the JSON array, no other text."
)


class OnboardingAgent(QuorumAgent):
    """Interactive onboarding questionnaire driven by an LLM."""

    def __init__(self):
        super().__init__("onboarding")

    # ------------------------------------------------------------------
    # Multi-turn LLM helper
    # ------------------------------------------------------------------

    def _call_llm_chat(
        self, system_prompt: str, messages: list[dict]
    ) -> str:
        """Send a full multi-turn conversation to the configured LLM.

        ``messages`` is a list of dicts with keys ``role`` and ``content``
        (roles: "user", "assistant").
        """
        provider = self.config["llm_provider"]

        if provider == "ollama":
            all_messages = [{"role": "system", "content": system_prompt}] + messages
            resp = requests.post(
                f"{self.config['ollama_host']}/api/chat",
                json={
                    "model": self.config["llm_model"],
                    "messages": all_messages,
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
                    "messages": messages,
                },
                timeout=120,
            )
            resp.raise_for_status()
            return resp.json()["content"][0]["text"]

        if provider == "openai":
            all_messages = [{"role": "system", "content": system_prompt}] + messages
            resp = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.config['openai_api_key']}"
                },
                json={
                    "model": self.config["llm_model"],
                    "messages": all_messages,
                },
                timeout=120,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

        raise ValueError(f"Unknown LLM provider: {provider}")

    # ------------------------------------------------------------------
    # Onboarding-complete check
    # ------------------------------------------------------------------

    def _is_onboarded(self) -> bool:
        """Return True if onboarding has already been completed."""
        conn = self.connect_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM documents WHERE doc_type = 'onboarding-complete'"
        )
        count = cur.fetchone()[0]
        cur.close()
        return count > 0

    def _clear_onboarding(self) -> None:
        """Remove all onboarding documents so the questionnaire can be re-run."""
        conn = self.connect_db()
        cur = conn.cursor()
        # Delete embeddings that reference onboarding documents first.
        cur.execute(
            """
            DELETE FROM embeddings
            WHERE ref_type = 'document'
              AND ref_id IN (
                  SELECT id FROM documents
                  WHERE doc_type LIKE 'onboarding%%'
              )
            """
        )
        cur.execute("DELETE FROM documents WHERE doc_type LIKE 'onboarding%%'")
        conn.commit()
        cur.close()
        logger.info("Cleared previous onboarding data.")

    # ------------------------------------------------------------------
    # Conversation loop for one section
    # ------------------------------------------------------------------

    def _run_section(self, section: dict) -> str:
        """Conduct one section of the questionnaire. Returns the LLM summary."""
        section_prompt = (
            SYSTEM_PROMPT
            + "\n\n--- SECTION INSTRUCTION ---\n"
            + section["instruction"]
        )
        messages: list[dict] = []

        for exchange in range(section["max_exchanges"]):
            # Build a user-context message for the first turn to kick things off.
            if exchange == 0:
                messages.append(
                    {"role": "user", "content": "[The user is ready. Begin this section.]"}
                )

            # Get the LLM's next question / response.
            assistant_reply = self._call_llm_chat(section_prompt, messages)
            messages.append({"role": "assistant", "content": assistant_reply})

            # Print the question and get user input.
            print(f"\n{assistant_reply}\n")
            try:
                user_input = input("> ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\n\nOnboarding interrupted. Progress has not been saved.")
                sys.exit(1)

            if not user_input:
                user_input = "(no response)"

            messages.append({"role": "user", "content": user_input})

        # Ask the LLM to summarise what it learned in this section.
        messages.append({"role": "user", "content": _SUMMARISE_INSTRUCTION})
        summary = self._call_llm_chat(section_prompt, messages)

        return summary

    # ------------------------------------------------------------------
    # Task extraction
    # ------------------------------------------------------------------

    def _extract_tasks(self, conversation_messages: list[dict]) -> list[dict]:
        """Ask the LLM to pull concrete tasks from the goals conversation."""
        messages = conversation_messages + [
            {"role": "user", "content": _EXTRACT_TASKS_INSTRUCTION}
        ]
        raw = self._call_llm_chat(SYSTEM_PROMPT, messages)

        # Parse JSON, tolerating markdown code fences.
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            tasks = json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning("Could not parse task extraction response: %s", raw[:300])
            return []

        if not isinstance(tasks, list):
            return []
        return tasks

    # ------------------------------------------------------------------
    # Main run
    # ------------------------------------------------------------------

    def run(self) -> str:
        reset = "--reset" in sys.argv

        if self._is_onboarded() and not reset:
            print(
                "\nOnboarding has already been completed. "
                "Run with --reset to start over.\n"
            )
            return "Already onboarded."

        if reset and self._is_onboarded():
            print("\nResetting previous onboarding data...\n")
            self._clear_onboarding()

        # ── Welcome ──────────────────────────────────────────────────
        print(
            "\n"
            "========================================================\n"
            "  Welcome to The Quorum -- Onboarding\n"
            "========================================================\n"
            "\n"
            "This conversation helps your AI agents understand who\n"
            "you are, what you're working on, and how you'd like\n"
            "them to work with you.\n"
            "\n"
            "It takes about 5-10 minutes. Just answer naturally --\n"
            "there are no right or wrong answers. Everything you\n"
            "share is stored locally in your database and is never\n"
            "sent anywhere except to your configured LLM provider.\n"
            "\n"
            "You can press Ctrl+C at any time to quit without saving.\n"
            "--------------------------------------------------------\n"
        )

        stored_doc_ids: list[str] = []
        all_goals_messages: list[dict] = []

        for i, section in enumerate(SECTIONS):
            if i > 0:
                print(
                    "\n--------------------------------------------------------"
                    f"\n  Section {i + 1} of {len(SECTIONS)}: {section['title']}"
                    "\n--------------------------------------------------------"
                )
            else:
                print(
                    f"  Section 1 of {len(SECTIONS)}: {section['title']}"
                    "\n--------------------------------------------------------"
                )

            summary = self._run_section(section)

            # Store the summary as a document.
            doc_id = self.store_document(
                doc_type=section["doc_type"],
                title=section["title"],
                content=summary,
                metadata={"source": "onboarding", "section": section["name"]},
                tags=section["tags"],
            )
            stored_doc_ids.append(doc_id)
            print(f"\n  [Saved: {section['title']}]")

            # For the goals section, feed the summary to the task extractor.
            if section["name"] == "goals":
                all_goals_messages = [
                    {"role": "user", "content": f"Here is a summary of a person's goals and priorities:\n\n{summary}"},
                ]

        # ── Extract and store tasks from the goals section ───────────
        task_ids: list[str] = []
        if all_goals_messages:
            print("\n  Extracting tasks from your goals...")
            tasks = self._extract_tasks(all_goals_messages)
            for task_data in tasks:
                title = task_data.get("title", "Untitled task")
                description = task_data.get("description", "")
                priority = task_data.get("priority", 3)
                priority = max(1, min(5, int(priority)))

                task_id = self.upsert_task(
                    title=title,
                    description=description,
                    status="pending",
                    priority=priority,
                    owner=None,
                    metadata={"source": "onboarding"},
                )
                task_ids.append(task_id)
                print(f"    Task created: {title}")

            if not task_ids:
                print("    (No concrete tasks extracted -- that's fine.)")

        # ── Store completion marker ──────────────────────────────────
        complete_doc_id = self.store_document(
            doc_type="onboarding-complete",
            title="Onboarding Complete",
            content=(
                "The initial onboarding questionnaire was completed. "
                "See the onboarding-profile, onboarding-goals, "
                "onboarding-preferences, and onboarding-data-sources "
                "documents for the full details."
            ),
            metadata={
                "related_doc_ids": stored_doc_ids,
            },
            tags=["onboarding", "milestone"],
        )

        self.store_event(
            event_type="onboarding-complete",
            title="User Onboarding Completed",
            description=(
                "The user completed the initial onboarding questionnaire. "
                f"{len(stored_doc_ids)} profile documents and "
                f"{len(task_ids)} tasks were created."
            ),
            metadata={"doc_ids": stored_doc_ids},
            ref_ids=stored_doc_ids + [complete_doc_id],
        )

        # ── Summary ──────────────────────────────────────────────────
        print(
            "\n"
            "========================================================\n"
            "  Onboarding Complete\n"
            "========================================================\n"
        )
        print(f"  Documents stored:  {len(stored_doc_ids)}")
        print(f"  Tasks created:     {len(task_ids)}")
        print(f"  Completion marker: stored")
        print()
        print(
            "  Your agents now have a foundation to work with.\n"
            "  They will learn more about you over time through\n"
            "  your conversations and the data they collect.\n"
        )
        print(
            "  To re-run this questionnaire later:\n"
            "    python -m agents.onboarding --reset\n"
        )

        return f"Onboarding complete. {len(stored_doc_ids)} documents stored."


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    agent = OnboardingAgent()
    agent.execute()
