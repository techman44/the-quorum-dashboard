"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { timeAgo } from "@/lib/utils";
import { fetchAgent, type UIAgent } from "@/lib/use-agents";
import type { QuorumEvent } from "@/lib/types";

const typeStyles: Record<string, string> = {
  insight: "bg-purple-500/20 text-purple-400",
  observation: "bg-blue-500/20 text-blue-400",
  critique: "bg-amber-500/20 text-amber-400",
  opportunity: "bg-emerald-500/20 text-emerald-400",
};

export function ActivityFeed({ events }: { events: QuorumEvent[] }) {
  const [agentsMap, setAgentsMap] = useState<Map<string, UIAgent>>(new Map());

  useEffect(() => {
    // Collect unique agent names from events
    const agentNames = new Set<string>();
    events.forEach((event) => {
      const source = event.metadata?.source as string | undefined;
      if (source) {
        agentNames.add(source);
      }
    });

    // Fetch all agents in parallel
    const fetchAgents = async () => {
      const agentMap = new Map<string, UIAgent>();
      await Promise.all(
        Array.from(agentNames).map(async (name) => {
          const agent = await fetchAgent(name);
          if (agent) {
            agentMap.set(name, agent);
          }
        })
      );
      setAgentsMap(agentMap);
    };

    fetchAgents();
  }, [events]);

  return (
    <ScrollArea className="h-[420px]">
      <div className="flex flex-col gap-1 pr-4">
        {events.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground italic">
            No recent activity
          </p>
        )}
        {events.map((event) => {
          const source = (event.metadata?.source as string) ?? null;
          const agent = source ? agentsMap.get(source) : null;

          return (
            <div
              key={event.id}
              className="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-muted/50"
            >
              <Badge
                variant="outline"
                className={`mt-0.5 shrink-0 ${typeStyles[event.event_type] ?? "bg-zinc-500/20 text-zinc-400"}`}
              >
                {event.event_type}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{event.title}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {agent && (
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: agent.color }}
                      />
                      {agent.displayName}
                    </span>
                  )}
                  <span>{timeAgo(new Date(event.created_at))}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
