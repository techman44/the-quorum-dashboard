/**
 * Shared agent utility functions
 * Can be used both on client and server
 */

import type { AgentMetadata } from './agent-schema';
import type { UIAgent } from './use-agents';

/**
 * Convert AgentMetadata to legacy Agent format for backwards compatibility
 * This is a plain function that works on both client and server
 */
export function toLegacyAgent(agent: AgentMetadata | UIAgent): {
  name: string;
  displayName: string;
  color: string;
  schedule: string;
  description: string;
  icon?: string;
} {
  return {
    name: agent.name,
    displayName: agent.displayName,
    color: agent.color,
    schedule: (agent as AgentMetadata).schedule || (agent as UIAgent).schedule || '',
    description: agent.description,
    icon: agent.icon,
  };
}

/**
 * Convert AgentMetadata to UIAgent format
 */
export function toUIAgent(agent: AgentMetadata): UIAgent {
  return {
    name: agent.name,
    displayName: agent.displayName,
    icon: agent.icon,
    color: agent.color,
    description: agent.description,
    schedule: agent.schedule || '',
    enabled: agent.enabled,
    category: agent.category,
    specialties: agent.specialties,
    reasonsToCall: agent.reasonsToCall,
    tags: agent.tags,
  };
}
