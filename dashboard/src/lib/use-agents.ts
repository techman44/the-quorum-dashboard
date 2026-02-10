'use client';

import { useState, useEffect } from 'react';
import type { AgentMetadata } from './agent-schema';

// Lightweight agent type for UI components (matches API response)
export interface UIAgent {
  name: string;
  displayName: string;
  icon: string;
  color: string;
  description: string;
  schedule?: string;
  enabled: boolean;
  category: string;
  specialties: string[];
  reasonsToCall: string[];
  tags: string[];
}

// Convert UIAgent to legacy Agent format for backwards compatibility
export function toLegacyAgent(agent: UIAgent): {
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
    schedule: agent.schedule || '',
    description: agent.description,
    icon: agent.icon,
  };
}

// Global cache for agents
let agentCache: UIAgent[] | null = null;
let cachePromise: Promise<UIAgent[]> | null = null;

/**
 * Fetch all agents from the API
 */
export async function fetchAgents(options?: {
  includeDisabled?: boolean;
  forceRefresh?: boolean;
}): Promise<UIAgent[]> {
  if (agentCache && !options?.forceRefresh) {
    return options?.includeDisabled
      ? agentCache
      : agentCache.filter(a => a.enabled);
  }

  if (cachePromise) {
    return cachePromise;
  }

  cachePromise = (async (): Promise<UIAgent[]> => {
    try {
      const searchParams = new URLSearchParams();
      if (options?.includeDisabled) {
        searchParams.set('includeDisabled', 'true');
      }

      const response = await fetch(`/api/agents?${searchParams.toString()}`, {
        cache: options?.forceRefresh ? 'no-store' : 'force-cache',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch agents: ${response.statusText}`);
      }

      const data = await response.json();
      agentCache = data.agents || [];
      return agentCache!;
    } catch (error) {
      console.error('Error fetching agents:', error);
      // Fallback to empty array on error
      agentCache = [];
      return [];
    } finally {
      cachePromise = null;
    }
  })();

  return cachePromise;
}

/**
 * Fetch a single agent by name
 */
export async function fetchAgent(name: string): Promise<UIAgent | null> {
  try {
    const response = await fetch(`/api/agents/${encodeURIComponent(name)}`, {
      cache: 'force-cache',
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch agent: ${response.statusText}`);
    }

    const data = await response.json();
    return data.agent;
  } catch (error) {
    console.error('Error fetching agent:', error);
    return null;
  }
}

/**
 * Update agent enabled state
 */
export async function setAgentEnabled(name: string, enabled: boolean): Promise<boolean> {
  try {
    const response = await fetch(`/api/agents/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update agent: ${response.statusText}`);
    }

    // Invalidate cache
    agentCache = null;

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error updating agent:', error);
    return false;
  }
}

/**
 * React hook to fetch and use agents
 */
export function useAgents(options?: {
  includeDisabled?: boolean;
  enabled?: boolean;
}) {
  const [agents, setAgents] = useState<UIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAgents() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchAgents(options);
        if (!cancelled) {
          setAgents(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
          setAgents([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAgents();

    return () => {
      cancelled = true;
    };
  }, [options?.includeDisabled, options?.enabled]);

  return { agents, loading, error, refetch: () => fetchAgents({ ...options, forceRefresh: true }) };
}

/**
 * React hook to fetch a single agent
 */
export function useAgent(name: string | null | undefined) {
  const [agent, setAgent] = useState<UIAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!name) {
      setAgent(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadAgent() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchAgent(name as string);
        if (!cancelled) {
          setAgent(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
          setAgent(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAgent();

    return () => {
      cancelled = true;
    };
  }, [name]);

  return { agent, loading, error };
}

/**
 * Get an agent by name from the current list (synchronous, requires useAgents to be called first)
 */
export function getAgentByName(agents: UIAgent[], name: string): UIAgent | undefined {
  return agents.find(a => a.name === name);
}
