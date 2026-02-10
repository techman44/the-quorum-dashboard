import { getStats, getLatestRunPerAgent, listEvents, ensureAgentConfigTable, seedAgentConfigs } from "@/lib/db";
import { discoverAgents } from "@/lib/agent-discovery";
import { StatsCards } from "@/components/stats-cards";
import { AgentStatusGrid } from "@/components/agent-card";
import { AgentStatusGridClient } from "@/components/agent-status-grid-client";
import { ActivityFeed } from "@/components/activity-feed";
import { toLegacyAgent } from "@/lib/agent-utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Try to initialize database tables, but continue if unavailable
  try {
    await ensureAgentConfigTable();
  } catch {
    // Database unavailable, will use defaults
  }

  // Fetch agents dynamically (works even without DB)
  const agents = await discoverAgents();
  const legacyAgents = agents.map(toLegacyAgent);

  // Try to seed configs, but continue if unavailable
  try {
    await seedAgentConfigs(legacyAgents);
  } catch {
    // Database unavailable
  }

  // Fetch data with fallback for database unavailability
  const defaultStats = { documents: 0, events: 0, tasks: 0, embeddings: 0, unembedded_documents: 0, unembedded_events: 0 };
  const [stats, runs, events] = await Promise.all([
    getStats().catch(() => defaultStats),
    getLatestRunPerAgent().catch(() => []),
    listEvents({ limit: 20 }).catch(() => []),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          The Quorum agent overview
        </p>
      </div>

      <StatsCards stats={stats} />

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          <h2 className="mb-4 text-lg font-semibold">Agents</h2>
          <AgentStatusGridClient agents={agents} runs={runs} />
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold">Recent Activity</h2>
          <ActivityFeed events={events} />
        </section>
      </div>
    </div>
  );
}
