/**
 * Dynamic agent discovery system
 *
 * Discovers agents from:
 * 1. Default built-in agents
 * 2. Database-stored agent configurations
 * 3. Future: File system scanning for custom agents
 */

import { pool } from './db';
import { AgentMetadata, DEFAULT_AGENTS, agentToRosterEntry, AgentRosterEntry, generateAgentRosterPrompt } from './agent-schema';

// In-memory cache of discovered agents
let agentCache: AgentMetadata[] | null = null;
let cacheTimestamp: number = 0;
let tableInitialized = false;
const CACHE_TTL = 60000; // 1 minute

// In-memory override for agent enabled states (used when database is unavailable)
const inMemoryEnabledOverrides: Map<string, boolean> = new Map();

/**
 * Ensure the agents table exists
 */
export async function ensureAgentsTable(): Promise<void> {
  if (tableInitialized) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quorum_agents (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name TEXT NOT NULL UNIQUE,
        config JSONB NOT NULL DEFAULT '{}',
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_quorum_agents_name ON quorum_agents(name)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_quorum_agents_enabled ON quorum_agents(enabled)
    `);
    tableInitialized = true;
  } catch (error) {
    console.error('Failed to create agents table:', error);
  }
}

/**
 * Get all agents (with caching)
 * @param includeDisabled - If true, returns all agents including disabled ones
 */
export async function discoverAgents(includeDisabled: boolean = false): Promise<AgentMetadata[]> {
  const now = Date.now();

  // Return cached agents if fresh
  if (agentCache && (now - cacheTimestamp) < CACHE_TTL) {
    return includeDisabled ? agentCache : agentCache.filter(a => a.enabled);
  }

  // Start with default agents
  const agents: AgentMetadata[] = [...DEFAULT_AGENTS];

  // Ensure table exists
  await ensureAgentsTable();

  // Load custom agent configurations from database (including disabled ones for merging)
  try {
    const result = await pool.query(
      `SELECT name, config, enabled, created_at, updated_at
       FROM quorum_agents
       ORDER BY name ASC`
    );

    // Merge with default agents (custom agents can override defaults)
    for (const row of result.rows) {
      const customConfig = row.config as AgentMetadata;
      const existingIndex = agents.findIndex(a => a.name === row.name);

      if (existingIndex >= 0) {
        // Override default agent with custom configuration
        agents[existingIndex] = {
          ...agents[existingIndex],
          ...customConfig,
          enabled: row.enabled,
          updatedAt: row.updated_at
        };
      } else {
        // Add new custom agent
        agents.push({
          ...customConfig,
          enabled: row.enabled,
          updatedAt: row.updated_at
        });
      }
    }
  } catch (error) {
    // Table might not exist yet, return defaults
    console.warn('Could not load custom agents from database:', error);
  }

  // Apply in-memory enabled overrides
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    if (inMemoryEnabledOverrides.has(agent.name)) {
      agents[i] = { ...agent, enabled: inMemoryEnabledOverrides.get(agent.name)! };
    }
  }

  agentCache = agents;
  cacheTimestamp = now;

  return includeDisabled ? agents : agents.filter(a => a.enabled);
}

/**
 * Get a specific agent by name
 * @param name - Agent name
 * @param includeDisabled - If true, will return disabled agents too
 */
export async function getAgentMetadata(name: string, includeDisabled: boolean = true): Promise<AgentMetadata | null> {
  const agents = await discoverAgents(includeDisabled);
  return agents.find(a => a.name === name) || null;
}

/**
 * Get the agent roster for prompt injection
 * This is what agents use to understand what other agents exist
 */
export async function getAgentRoster(): Promise<AgentRosterEntry[]> {
  const agents = await discoverAgents(true); // Get all agents including disabled for roster
  return agents.filter(a => a.enabled).map(agentToRosterEntry);
}

/**
 * Get the agent roster as a formatted prompt section
 * This gets injected into agent system prompts
 */
export async function getAgentRosterPrompt(): Promise<string> {
  const agents = await discoverAgents(true); // Get all agents including disabled
  const enabledAgents = agents.filter(a => a.enabled);
  return generateAgentRosterPrompt(enabledAgents);
}

/**
 * Find agents by specialty or capability
 */
export async function findAgentsByCriteria(criteria: {
  specialty?: string;
  capability?: string;
  category?: string;
  tag?: string;
}): Promise<AgentMetadata[]> {
  const agents = await discoverAgents();

  return agents.filter(agent => {
    if (criteria.specialty && !agent.specialties.some(s =>
      s.toLowerCase().includes(criteria.specialty!.toLowerCase()))) {
      return false;
    }
    if (criteria.capability && !agent.capabilities.some(c =>
      c.name.toLowerCase().includes(criteria.capability!.toLowerCase()))) {
      return false;
    }
    if (criteria.category && agent.category !== criteria.category) {
      return false;
    }
    if (criteria.tag && !agent.tags.includes(criteria.tag)) {
      return false;
    }
    return true;
  });
}

/**
 * Get agents that should be notified based on content analysis
 * Uses reasonsToCall to determine relevance
 */
export async function findRelevantAgents(content: string): Promise<AgentMetadata[]> {
  const agents = await discoverAgents();
  const contentLower = content.toLowerCase();

  // Simple keyword matching for now
  // TODO: Use embeddings for semantic matching
  return agents.filter(agent => {
    // Check if any reasons to call match the content
    return agent.reasonsToCall.some(reason =>
      contentLower.includes(reason.toLowerCase()) ||
      reason.toLowerCase().split(/\s+/).some(word =>
        word.length > 4 && contentLower.includes(word)
      )
    );
  });
}

/**
 * Register or update a custom agent in the database
 * Falls back to in-memory storage if database is unavailable
 */
export async function registerAgent(metadata: AgentMetadata): Promise<AgentMetadata> {
  try {
    await ensureAgentsTable();
    const result = await pool.query(
      `INSERT INTO quorum_agents (name, config, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET
         config = EXCLUDED.config,
         enabled = EXCLUDED.enabled,
         updated_at = NOW()
       RETURNING *`,
      [metadata.name, JSON.stringify(metadata), metadata.enabled]
    );
  } catch (error) {
    // If database is unavailable, fall back to in-memory storage
    console.warn('Database unavailable for agent registration, using in-memory fallback:', error);
    inMemoryEnabledOverrides.set(metadata.name, metadata.enabled);
  }

  // Invalidate cache
  agentCache = null;

  return metadata;
}

/**
 * Enable or disable an agent
 * Falls back to in-memory storage if database is unavailable
 */
export async function setAgentEnabled(name: string, enabled: boolean): Promise<void> {
  try {
    // First try to update in database
    await ensureAgentsTable();
    await pool.query(
      `INSERT INTO quorum_agents (name, config, enabled)
       VALUES ($1, '{}', $2)
       ON CONFLICT (name) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         updated_at = NOW()`,
      [name, enabled]
    );
  } catch (error) {
    // If database is unavailable, fall back to in-memory storage
    console.warn('Database unavailable for agent enable/disable, using in-memory fallback:', error);
    inMemoryEnabledOverrides.set(name, enabled);
  }

  // Invalidate cache
  agentCache = null;
}

/**
 * Clear the agent cache (call after updates)
 */
export function clearAgentCache(): void {
  agentCache = null;
}

/**
 * Get legacy agent format for backwards compatibility
 */
export async function getLegacyAgents() {
  const agents = await discoverAgents();
  return agents.map(a => ({
    name: a.name,
    displayName: a.displayName,
    color: a.color,
    schedule: a.schedule || '',
    description: a.description,
    icon: a.icon
  }));
}
