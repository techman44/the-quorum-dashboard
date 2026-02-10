/**
 * Agent definitions - client-safe exports
 *
 * This file provides client-safe agent data for UI components.
 * Server-side dynamic discovery is in agent-discovery.ts.
 *
 * DEPRECATED: For new code, use useAgents() hook from ./use-agents.ts
 * which fetches from the /api/agents endpoint for dynamic agent discovery.
 */

// Re-export types without importing the server-side code
export type { AgentMetadata, AgentRosterEntry } from './agent-schema';

// Legacy agent type for backwards compatibility
export interface Agent {
  name: string;
  displayName: string;
  color: string;
  schedule: string;
  description: string;
  icon?: string;
}

// Default agents list (matches the schema defaults in agent-schema.ts)
// This is kept for backwards compatibility but is deprecated
export const AGENTS: Agent[] = [
  { name: 'connector', displayName: 'The Connector', color: '#3B82F6', schedule: '*/15 * * * *', description: 'Finds non-obvious connections between information', icon: 'link' },
  { name: 'executor', displayName: 'The Executor', color: '#EF4444', schedule: '0 * * * *', description: 'Tracks commitments, deadlines, and accountability', icon: 'gavel' },
  { name: 'strategist', displayName: 'The Strategist', color: '#8B5CF6', schedule: '0 6 * * *', description: 'Daily strategic synthesis and reprioritization', icon: 'compass' },
  { name: 'devils-advocate', displayName: "The Devil's Advocate", color: '#F59E0B', schedule: '0 */4 * * *', description: 'Challenges assumptions and identifies risks', icon: 'alert-triangle' },
  { name: 'opportunist', displayName: 'The Opportunist', color: '#10B981', schedule: '0 */6 * * *', description: 'Finds quick wins and hidden value', icon: 'lightbulb' },
  { name: 'data-collector', displayName: 'The Data Collector', color: '#6366F1', schedule: '*/30 * * * *', description: 'Scans inbox, processes files, verifies system health', icon: 'database' },
  { name: 'closer', displayName: 'The Closer', color: '#F97316', schedule: '*/10 * * * *', description: 'Verifies completion, closes tasks, updates status from evidence', icon: 'check-circle' },
  { name: 'quorum', displayName: 'The Quorum', color: '#0EA5E9', schedule: '', description: 'Council mode - all agents collaborate on your query', icon: 'users' },
];

/**
 * Get all agents (legacy format)
 * @deprecated Use useAgents() hook from ./use-agents.ts instead
 */
export function getAgents(): Agent[] {
  return AGENTS;
}

/**
 * Get an agent by name
 * @deprecated Use useAgents() hook or fetchAgent() from ./use-agents.ts instead
 */
export function getAgent(name: string): Agent | undefined {
  return AGENTS.find(a => a.name === name);
}
