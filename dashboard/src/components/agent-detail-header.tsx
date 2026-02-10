"use client";

import Link from "next/link";
import { useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cronToHuman } from "@/lib/utils";
import type { QuorumAgentConfig, QuorumAgentRun } from "@/lib/types";
import { Play } from "lucide-react";
import { setAgentEnabled } from "@/lib/use-agents";

interface AgentDef {
  name: string;
  displayName: string;
  color: string;
  schedule: string;
  description: string;
  icon?: string;
  specialties?: string[];
  reasonsToCall?: string[];
  capabilities?: string[];
  enabled?: boolean;
}

interface AgentDetailHeaderProps {
  agent: AgentDef;
  config: QuorumAgentConfig | null;
  latestRun: QuorumAgentRun | null;
}

function getStatusBadge(latestRun: QuorumAgentRun | null) {
  if (!latestRun) {
    return <Badge variant="outline">Never run</Badge>;
  }
  switch (latestRun.status) {
    case "running":
      return <Badge className="bg-blue-600 text-white">Running</Badge>;
    case "completed":
      return <Badge className="bg-green-600 text-white">Completed</Badge>;
    case "failed":
      return <Badge className="bg-red-600 text-white">Failed</Badge>;
    default:
      return <Badge variant="outline">{latestRun.status}</Badge>;
  }
}

export function AgentDetailHeader({
  agent,
  config,
  latestRun,
}: AgentDetailHeaderProps) {
  const schedule = config?.cron_schedule || agent.schedule;
  const enabled = config?.enabled ?? agent.enabled ?? true;
  const [isRunning, setIsRunning] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [isToggling, setIsToggling] = useState(false);

  const handleRunNow = async () => {
    setIsRunning(true);
    setRunMessage("");

    try {
      const response = await fetch("/api/crons/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: agent.name }),
      });

      const data = await response.json();
      if (data.success) {
        setRunMessage("Agent run started!");
        setTimeout(() => {
          setRunMessage("");
          window.location.reload(); // Refresh to show new run status
        }, 2000);
      } else {
        setRunMessage(data.error || "Failed to start agent");
      }
    } catch (err) {
      setRunMessage("Failed to start agent");
    } finally {
      setIsRunning(false);
    }
  };

  const handleToggleEnabled = async (checked: boolean) => {
    setIsToggling(true);
    try {
      const success = await setAgentEnabled(agent.name, checked);
      if (success) {
        // Refresh the page to show updated state
        window.location.reload();
      } else {
        setRunMessage("Failed to update agent status");
        setTimeout(() => setRunMessage(""), 3000);
      }
    } catch (err) {
      setRunMessage("Failed to update agent status");
      setTimeout(() => setRunMessage(""), 3000);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <div className="size-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shrink-0"
          style={{ backgroundColor: agent.color }}
        >
          {agent.displayName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold" style={{ color: agent.color }}>
              {agent.displayName}
            </h1>
            {getStatusBadge(latestRun)}
            {!enabled && (
              <Badge variant="outline" className="text-muted-foreground">
                Disabled
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">{agent.description}</p>
          <p className="text-sm text-muted-foreground mt-2">
            Schedule: {cronToHuman(schedule)}{" "}
            <span className="text-xs opacity-60">({schedule})</span>
          </p>
          {runMessage && (
            <p className={`text-sm mt-1 ${runMessage.includes("Failed") ? "text-red-500" : "text-green-500"}`}>
              {runMessage}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {enabled ? "Enabled" : "Disabled"}
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={handleToggleEnabled}
              disabled={isToggling}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunNow}
              disabled={isRunning || !enabled}
            >
              <Play className="h-4 w-4 mr-1" />
              {isRunning ? "Starting..." : "Run Now"}
            </Button>
            <Button asChild variant={enabled ? undefined : "outline"}>
              <Link href={`/chat/${agent.name}`}>Chat</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Extended Agent Metadata */}
      {(agent.specialties || agent.reasonsToCall || agent.capabilities) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {agent.specialties && agent.specialties.length > 0 && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="text-sm font-semibold mb-2">Specialties</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                {agent.specialties.map((specialty, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{specialty}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {agent.reasonsToCall && agent.reasonsToCall.length > 0 && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="text-sm font-semibold mb-2">When to Call</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                {agent.reasonsToCall.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {agent.capabilities && agent.capabilities.length > 0 && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="text-sm font-semibold mb-2">Capabilities</h3>
              <div className="flex flex-wrap gap-1">
                {agent.capabilities.map((capability, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {capability}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
