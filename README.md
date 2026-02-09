# The Quorum

### Your AI agents forget everything. These don't.

**The Quorum** is an open-source persistent memory and conscience layer for AI agents. It gives your LLM long-term memory, self-awareness, and accountability through a group of specialized "conscience agents" that observe, reflect, and act on your behalf.

One of our agents spotted a job listing, independently searched email history for contacts at that company, found a months-old conversation, and suggested a warm intro instead of a cold application. When the user didn't act, another agent called them out. Two agents, zero human prompting.

---

## The Five Conscience Agents

| Agent | Role | What It Does |
|-------|------|-------------|
| **The Connector** | Memory Bridge | Links current conversations to forgotten history. Surfaces relevant context before you have to ask. |
| **The Executor** | Accountability | Turns discussions into tracked tasks. Flags procrastination. Calls out broken commitments. |
| **The Strategist** | Pattern Recognition | Runs daily/weekly reflections. Identifies trends, risks, and opportunities across your data. |
| **The Devil's Advocate** | Critical Thinking | Challenges your assumptions. Stress-tests decisions. Surfaces risks you missed. |
| **The Opportunist** | Hidden Value | Spots quick wins, reusable patterns, and overlooked connections across projects. |

Plus a **Data Collector** that ingests external sources (email, documents, web pages) into the shared memory system.

---

## How It Works

```
    Your Conversations          External Data
    (chat, CLI, API)        (email, docs, files)
          |                        |
          v                        v
   +--------------+       +-----------------+
   |  Connector   |       | Data Collector  |
   +--------------+       +-----------------+
          |                        |
          +------+    +------------+
                 |    |
                 v    v
       +--------------------+
       |  PostgreSQL        |
       |  + pgvector        |
       |                    |
       |  - documents       |
       |  - conversations   |
       |  - embeddings      |
       |  - events          |
       |  - tasks           |
       +--------------------+
                 |
      +----------+----------+
      |          |          |
      v          v          v
 +----------+ +--------+ +-----------+
 | Executor | |Strategist| | Devil's  |
 +----------+ +--------+ | Advocate |
      |          |        +-----------+
      |          |             |
      +----------+-------------+
                 |
                 v
          +-------------+
          | Opportunist |
          +-------------+
                 |
                 v
        Notifications / Actions
       (Telegram, email, tasks)
```

Every agent reads from and writes to the same shared memory. They run on independent schedules via cron, finding patterns and taking action without being prompted.

---

## Tech Stack

- **PostgreSQL + pgvector** -- semantic vector search over all your data
- **Python** -- agent scripts with a shared base class
- **Any LLM provider** -- Ollama (local), OpenAI, Anthropic, or anything with a chat API
- **Any embedding model** -- Ollama (mxbai-embed-large), OpenAI, or your own
- **Docker** -- handles PostgreSQL and Ollama automatically (no need to install them separately)

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/itcoreai/the-quorum.git
cd the-quorum

# Copy environment config
cp .env.example .env
# Edit .env with your database credentials and LLM provider

# Start PostgreSQL + Ollama (via Docker)
docker compose up -d

# Install Python dependencies
pip install -r requirements.txt

# Run the install script (waits for services, pulls embedding model, etc.)
chmod +x scripts/install.sh
./scripts/install.sh
```

---

## Configuration

All configuration lives in `.env`. See [`.env.example`](.env.example) for the full list of options.

Key settings:

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `EMBEDDING_PROVIDER` | `ollama` or `openai` | `ollama` |
| `LLM_PROVIDER` | `ollama`, `openai`, or `anthropic` | `ollama` |
| `AGENT_TIMEZONE` | Your local timezone | `Australia/Sydney` |
| `AGENT_QUIET_HOURS_START` | Hour to stop notifications | `22` |
| `AGENT_QUIET_HOURS_END` | Hour to resume notifications | `8` |

---

## Scheduling

The agents run on independent cron schedules. Here is a recommended setup:

```cron
# Connector - summarize conversations, bridge to memory
*/10 * * * * cd /path/to/the-quorum && python agents/connector.py

# Executor - review tasks, flag stale items
0 * * * * cd /path/to/the-quorum && python agents/executor.py

# Strategist - daily reflection at 6am
0 6 * * * cd /path/to/the-quorum && python agents/strategist.py

# Devil's Advocate - challenge decisions every 4 hours
0 */4 * * * cd /path/to/the-quorum && python agents/devils_advocate.py

# Opportunist - scan for quick wins every 6 hours
0 */6 * * * cd /path/to/the-quorum && python agents/opportunist.py

# Data Collector - ingest external sources hourly
0 * * * * cd /path/to/the-quorum && python agents/data_collector.py
```

Adjust cadences to match your workflow. The agents respect quiet hours configured in `.env`.

---

## Security and Privacy

- **All data stays local.** Your memories, conversations, and embeddings live in your own PostgreSQL instance. Nothing is sent to external services unless you explicitly configure a cloud LLM/embedding provider.
- **No external marketplace.** No third-party plugins, no dynamically loaded code. Every agent is defined in this repository.
- **No telemetry.** The Quorum does not phone home.
- **Sensitive data controls.** Tag records with metadata sensitivity levels. Use local models (Ollama) to keep everything on your machine.

---

## Project Structure

```
the-quorum/
  agents/           # Agent scripts (Connector, Executor, etc.)
  schema/           # PostgreSQL schema migrations
  scripts/          # Install and utility scripts
  docs/             # Extended documentation
  docker-compose.yml
  .env.example
  requirements.txt
```

---

## Contributing

Contributions are welcome. Here is how to get involved:

1. **Fork** the repository
2. **Create a branch** for your feature or fix
3. **Write tests** for new functionality
4. **Submit a pull request** with a clear description of the change

Please open an issue first for large changes so we can discuss the approach.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

Built by [ITcore.ai](https://itcore.ai)
