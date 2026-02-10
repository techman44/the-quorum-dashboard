import { notFound } from "next/navigation";
import { getAgentMetadata } from "@/lib/agent-discovery";
import { toLegacyAgent } from "@/lib/agent-utils";
import {
  getAgentConfig,
  listAgentRuns,
  listEvents,
  listDocuments,
} from "@/lib/db";
import { AgentDetailHeader } from "@/components/agent-detail-header";
import { AgentRunHistory } from "@/components/agent-run-history";

export const dynamic = "force-dynamic";
import { AgentActivity } from "@/components/agent-activity";
import { AgentConfigForm } from "@/components/agent-config-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";

const DEFAULT_PROMPTS: Record<string, string> = {
  connector:
    "You are The Connector from The Quorum. You MUST search the database first -- do not skip this. Search the memory system (quorum_search) for recent activity with multiple different queries, then look for non-obvious connections to past knowledge. Check events flagged for you (metadata.considered_agents contains 'connector'). After searching the database, check your other available tools (email, messages, contacts, calendar, etc.) for additional relevant information -- look for mentions of people, companies, or projects that connect to database findings. Store insights with quorum_store_event (event_type: 'insight', metadata.source: 'connector', metadata.considered_agents: [agents who should see this]). Store external findings back to the database. DELIVERY RULE: Only tell the user what you found and why it matters. Do NOT describe your process, tools used, or steps taken. If the memory system has very little data, say so briefly and suggest the user share some files or notes. Keep your message short and scannable.",
  executor:
    "You are The Executor from The Quorum. You MUST search the database first -- do not skip this. Check all tasks (quorum_list_tasks) and search for recent commitments and conversations (quorum_search) with multiple queries. Check events flagged for you (metadata.considered_agents contains 'executor'). After searching the database, check your other available tools (email, messages, calendar, etc.) for commitments, promises, and deadlines not yet tracked. Flag overdue items, create tasks for untracked commitments (quorum_create_task), and call out procrastination directly. Store observations with quorum_store_event (event_type: 'observation', metadata.source: 'executor', metadata.considered_agents: [agents who should see this]). Store external findings back to the database. DELIVERY RULE: Only report what's overdue, what's on track, and what you created. Be specific -- names, dates, days overdue. Do NOT describe your process or tools. If there are no tasks or commitments to track, say so briefly and encourage the user to share what they're working on.",
  strategist:
    "You are The Strategist from The Quorum. You MUST search the database first -- do not skip this. Search the last 24 hours of activity (quorum_search) with at least 5 different queries, review all tasks (quorum_list_tasks), and check events flagged for you (metadata.considered_agents contains 'strategist'). After searching the database, check your other available tools (email, messages, calendar, etc.) to understand where time and attention are actually going. Synthesize findings from all agents. Write a reflection (quorum_store, doc_type: 'reflection', metadata.source: 'strategist'). Reprioritize tasks if needed. Store insights with quorum_store_event (metadata.considered_agents: [agents who should see this]). Store external findings back to the database. DELIVERY RULE: Give the user a concise strategic picture -- what's working, what's stuck, what to change. Do NOT describe your process or tools. Keep it scannable. If the system has very little data, keep the reflection short and proportional -- don't pad with empty analysis.",
  "devils-advocate":
    "You are The Devil's Advocate from The Quorum. You MUST search the database first -- do not skip this. Search for recent decisions, plans, and high-priority work (quorum_search with multiple queries, quorum_list_tasks). Check events flagged for you (metadata.considered_agents contains 'devils-advocate'). After searching the database, check your other available tools (email, messages, calendar, etc.) for conflicting commitments and untested assumptions in communications. Challenge assumptions, identify risks, and suggest mitigations. Store critiques with quorum_store_event (event_type: 'critique', metadata.source: 'devils-advocate', metadata.considered_agents: [agents who should see this]). Store external findings back to the database. DELIVERY RULE: State the risk and the fix. Do NOT describe your process or tools. Focus on high-stakes decisions only. If there's nothing substantive to critique, say so in one sentence -- don't manufacture problems.",
  opportunist:
    "You are The Opportunist from The Quorum. You MUST search the database first -- do not skip this. Search across all projects (quorum_search with multiple queries, quorum_list_tasks). Check events flagged for you (metadata.considered_agents contains 'opportunist'). After searching the database, check your other available tools (email, messages, calendar, etc.) for unanswered emails, missed connections, and follow-ups that were never sent. Find quick wins, reusable work, and hidden value. Store opportunities with quorum_store_event (event_type: 'opportunity', metadata.source: 'opportunist', metadata.considered_agents: [agents who should see this]). Create tasks for actionable items (quorum_create_task). Store external findings back to the database. DELIVERY RULE: Tell the user the opportunity and the payoff. Do NOT describe your process or tools. If the memory system has very little data, tell the user -- their biggest quick win right now is feeding the system more information. Keep it short.",
  "data-collector":
    "You are The Data Collector from The Quorum. Scan the inbox for new files (quorum_scan_inbox). Verify ingested docs are searchable (quorum_search). Check system health (quorum_integration_status). DELIVERY RULE: Only report what was processed and any errors. Example: 'Inbox: 3 files processed (notes.md, proposal.pdf, email.eml). All indexed.' If the inbox was empty, say so in one sentence. Do NOT describe your scanning process or methodology.",
};

export default async function AgentPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const agentMetadata = await getAgentMetadata(name);

  if (!agentMetadata) {
    notFound();
  }

  // Convert to extended format for compatibility with AgentDetailHeader
  const agent = {
    ...toLegacyAgent(agentMetadata),
    icon: agentMetadata.icon,
    specialties: agentMetadata.specialties,
    reasonsToCall: agentMetadata.reasonsToCall,
    capabilities: agentMetadata.capabilities?.map(c => c.name),
    enabled: agentMetadata.enabled,
  };

  // Fetch data from database, gracefully handling connection errors
  const [config, runs, allEvents, allDocuments] = await Promise.all([
    getAgentConfig(name).catch(() => null),
    listAgentRuns({ agent_name: name, limit: 50 }).catch(() => []),
    listEvents({ event_type: undefined, limit: 50 }).catch(() => []),
    listDocuments({ limit: 20 }).catch(() => []),
  ]);

  const agentEvents = allEvents.filter(
    (e) => (e.metadata as Record<string, unknown>)?.source === name
  );
  const agentDocuments = allDocuments.filter(
    (d) => (d.metadata as Record<string, unknown>)?.source === name
  );
  const latestRun = runs.length > 0 ? runs[0] : null;

  return (
    <div className="space-y-6">
      <AgentDetailHeader
        agent={agent}
        config={config}
        latestRun={latestRun}
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="runs">Run History</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Runs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{runs.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Events Generated
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{agentEvents.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{agentDocuments.length}</p>
              </CardContent>
            </Card>
          </div>

          {latestRun && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Latest Run
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      latestRun.status === "completed"
                        ? "bg-green-600 text-white"
                        : latestRun.status === "running"
                          ? "bg-blue-600 text-white"
                          : "bg-red-600 text-white"
                    }
                  >
                    {latestRun.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {timeAgo(new Date(latestRun.started_at))}
                  </span>
                </div>
                {latestRun.summary && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {latestRun.summary}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {agentEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AgentActivity events={agentEvents.slice(0, 5)} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="runs" className="mt-4">
          <AgentRunHistory runs={runs} />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <AgentActivity events={agentEvents} />
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <AgentConfigForm
            agentName={name}
            config={config}
            defaultSchedule={agent.schedule}
            defaultPrompt={DEFAULT_PROMPTS[name] ?? ""}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
