import Link from "next/link";
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/agent-avatar";
import { DynamicIcon } from "@/components/dynamic-icon";
import { timeAgo, cronToHuman } from "@/lib/utils";
import type { QuorumAgentRun } from "@/lib/types";
import type { UIAgent } from "@/lib/use-agents";

interface AgentCardProps {
  agent: UIAgent;
  latestRun: QuorumAgentRun | null;
  onToggleEnabled?: (name: string, enabled: boolean) => Promise<boolean>;
}

const statusVariant: Record<string, string> = {
  running: "bg-blue-500/20 text-blue-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-red-500/20 text-red-400",
};

export function AgentCard({ agent, latestRun, onToggleEnabled }: AgentCardProps) {
  const [isToggling, setIsToggling] = React.useState(false);

  const handleToggle = async () => {
    if (!onToggleEnabled) return;
    setIsToggling(true);
    try {
      await onToggleEnabled(agent.name, !agent.enabled);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <Card
      className="overflow-hidden py-0"
      style={{ borderLeftColor: agent.color, borderLeftWidth: 3 }}
    >
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <AgentAvatar agentName={agent.name} fallbackAgent={agent} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{agent.displayName}</div>
            <div className="truncate text-xs text-muted-foreground">
              {agent.description}
            </div>
          </div>
          {!agent.enabled && (
            <Badge variant="outline" className="text-zinc-500">
              Disabled
            </Badge>
          )}
          {onToggleEnabled && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleToggle}
              disabled={isToggling}
              title={agent.enabled ? "Disable agent" : "Enable agent"}
            >
              {agent.enabled ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <path d="M9 9h6v6H9z" fill="currentColor" />
                </svg>
              )}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {latestRun ? (
            <>
              <Badge
                variant="outline"
                className={statusVariant[latestRun.status] ?? ""}
              >
                {latestRun.status}
              </Badge>
              <span>{timeAgo(new Date(latestRun.started_at))}</span>
            </>
          ) : (
            <span className="italic">Never run</span>
          )}
        </div>

        {agent.schedule && (
          <div className="text-xs text-muted-foreground">
            Schedule: {cronToHuman(agent.schedule)}
          </div>
        )}

        {/* Show specialties if available */}
        {agent.specialties && agent.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {agent.specialties.slice(0, 2).map((specialty) => (
              <Badge
                key={specialty}
                variant="outline"
                className="text-xs px-1.5 py-0"
              >
                {specialty}
              </Badge>
            ))}
            {agent.specialties.length > 2 && (
              <span className="text-xs text-muted-foreground">
                +{agent.specialties.length - 2} more
              </span>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="xs" asChild>
            <Link href={`/agents/${agent.name}`}>View</Link>
          </Button>
          <Button variant="outline" size="xs" asChild disabled={!agent.enabled}>
            <Link href={`/chat/${agent.name}`}>Chat</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentStatusGrid({
  agents,
  runs,
}: {
  agents: ReadonlyArray<UIAgent>;
  runs: QuorumAgentRun[];
}) {
  const runMap = new Map(runs.map((r) => [r.agent_name, r]));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard
          key={agent.name}
          agent={agent}
          latestRun={runMap.get(agent.name) ?? null}
        />
      ))}
    </div>
  );
}
