"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { fetchAgent, type UIAgent } from "@/lib/use-agents";
import { DynamicIcon } from "@/components/dynamic-icon";

interface AgentAvatarProps {
  agentName: string;
  size?: "sm" | "default" | "lg";
  fallbackAgent?: UIAgent | null;
}

// Global cache for agent data
const agentCache = new Map<string, UIAgent>();

export function AgentAvatar({ agentName, size = "default", fallbackAgent }: AgentAvatarProps) {
  const [agent, setAgent] = useState<UIAgent | null>(fallbackAgent ?? null);

  useEffect(() => {
    // Check cache first
    if (agentCache.has(agentName)) {
      setAgent(agentCache.get(agentName)!);
      return;
    }

    // Fetch agent data
    fetchAgent(agentName).then((data) => {
      if (data) {
        agentCache.set(agentName, data);
        setAgent(data);
      }
    });
  }, [agentName]);

  const letter = (agent?.displayName ?? agentName).charAt(0).toUpperCase();
  const color = agent?.color ?? "#71717a";
  const iconName = agent?.icon ?? "bot";

  return (
    <Avatar size={size}>
      <AvatarImage
        src={`/avatars/${agentName}.png`}
        alt={agent?.displayName ?? agentName}
      />
      <AvatarFallback
        style={{ backgroundColor: color, color: "#fff" }}
        className="font-semibold"
      >
        <DynamicIcon name={iconName} className="h-4 w-4" size={16} />
      </AvatarFallback>
    </Avatar>
  );
}
