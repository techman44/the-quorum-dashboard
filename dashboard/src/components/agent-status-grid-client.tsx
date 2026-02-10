'use client';

import { useState } from 'react';
import { AgentCard } from '@/components/agent-card';
import type { UIAgent } from '@/lib/use-agents';
import { setAgentEnabled } from '@/lib/use-agents';
import type { QuorumAgentRun } from '@/lib/types';

interface AgentStatusGridClientProps {
  agents: UIAgent[];
  runs: QuorumAgentRun[];
}

export function AgentStatusGridClient({ agents, runs }: AgentStatusGridClientProps) {
  const [agentStates, setAgentStates] = useState<Record<string, boolean>>(
    agents.reduce((acc, agent) => ({ ...acc, [agent.name]: agent.enabled }), {})
  );

  const handleToggleEnabled = async (name: string, enabled: boolean) => {
    const success = await setAgentEnabled(name, enabled);
    if (success) {
      setAgentStates(prev => ({ ...prev, [name]: enabled }));
    }
    return success;
  };

  const runMap = new Map(runs.map((r) => [r.agent_name, r]));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard
          key={agent.name}
          agent={{ ...agent, enabled: agentStates[agent.name] ?? agent.enabled }}
          latestRun={runMap.get(agent.name) ?? null}
          onToggleEnabled={handleToggleEnabled}
        />
      ))}
    </div>
  );
}
