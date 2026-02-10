// Model selector for AI agents
import { pool } from '../db';
import type { AIProvider, ChatMessage } from './providers/base';
import type { ChatOptions } from './providers/base';
import { createProvider } from './providers';
import { decryptApiKey } from './encryption';

export interface AgentModelAssignment {
  id: string;
  agentName: string;
  primaryProviderId: string;
  primaryModel: string;
  fallbackProviderId: string | null;
  fallbackModel: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderWithConfig extends AIProvider {
  apiKeyDecrypted?: string;
  oauthRefreshToken?: string;
  oauthExpiresAt?: Date;
}

/**
 * Get model assignment for an agent
 */
export async function getAgentModelAssignment(agentName: string): Promise<AgentModelAssignment | null> {
  const result = await pool.query(
    `SELECT * FROM quorum_agent_models WHERE agent_name = $1`,
    [agentName]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToAssignment(result.rows[0]);
}

/**
 * Set model assignment for an agent
 */
export async function setAgentModelAssignment(
  agentName: string,
  primaryProviderId: string,
  primaryModel: string,
  fallbackProviderId?: string,
  fallbackModel?: string
): Promise<AgentModelAssignment> {
  const result = await pool.query(
    `INSERT INTO quorum_agent_models (agent_name, primary_provider_id, primary_model, fallback_provider_id, fallback_model)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (agent_name) DO UPDATE SET
       primary_provider_id = EXCLUDED.primary_provider_id,
       primary_model = EXCLUDED.primary_model,
       fallback_provider_id = EXCLUDED.fallback_provider_id,
       fallback_model = EXCLUDED.fallback_model,
       updated_at = now()
     RETURNING *`,
    [agentName, primaryProviderId, primaryModel, fallbackProviderId || null, fallbackModel || null]
  );

  return mapRowToAssignment(result.rows[0]);
}

/**
 * Get all provider configurations
 */
export async function getAllProviders(): Promise<ProviderWithConfig[]> {
  const result = await pool.query(
    `SELECT * FROM quorum_ai_providers ORDER BY created_at DESC`
  );

  return result.rows.map((row: Record<string, unknown>) => {
    const provider: ProviderWithConfig = {
      id: row.id as string,
      name: row.name as string,
      type: row.provider_type as AIProvider['type'],
      baseUrl: row.base_url as string | undefined,
      apiKey: row.api_key_encrypted as string | undefined,
      oauthToken: row.oauth_token as string | undefined,
      oauthRefreshToken: row.oauth_refresh_token as string | undefined,
      oauthExpiresAt: row.oauth_expires_at as Date | undefined,
      isEnabled: (row.is_enabled as boolean) ?? true,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    };

    // Decrypt API key for use
    if (provider.apiKey) {
      try {
        provider.apiKeyDecrypted = decryptApiKey(provider.apiKey);
      } catch {
        console.warn(`Failed to decrypt API key for provider ${provider.id}`);
      }
    }

    return provider;
  });
}

/**
 * Get a provider by ID
 */
export async function getProvider(providerId: string): Promise<ProviderWithConfig | null> {
  const result = await pool.query(
    `SELECT * FROM quorum_ai_providers WHERE id = $1`,
    [providerId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const provider: ProviderWithConfig = {
    id: row.id as string,
    name: row.name as string,
    type: row.provider_type as AIProvider['type'],
    baseUrl: row.base_url as string | undefined,
    apiKey: row.api_key_encrypted as string | undefined,
    oauthToken: row.oauth_token as string | undefined,
    oauthRefreshToken: row.oauth_refresh_token as string | undefined,
    oauthExpiresAt: row.oauth_expires_at as Date | undefined,
    isEnabled: (row.is_enabled as boolean) ?? true,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };

  // Decrypt API key for use
  if (provider.apiKey) {
    try {
      provider.apiKeyDecrypted = decryptApiKey(provider.apiKey);
    } catch {
      console.warn(`Failed to decrypt API key for provider ${provider.id}`);
    }
  }

  return provider;
}

/**
 * Get the AI provider and model for an agent
 * Returns primary provider, or falls back to fallback provider if primary fails
 */
export async function getProviderForAgent(
  agentName: string
): Promise<{ provider: ProviderWithConfig; model: string } | null> {
  const assignment = await getAgentModelAssignment(agentName);

  if (!assignment) {
    return null;
  }

  const provider = await getProvider(assignment.primaryProviderId);

  if (!provider || !provider.isEnabled) {
    // Try fallback
    if (assignment.fallbackProviderId) {
      const fallbackProvider = await getProvider(assignment.fallbackProviderId);
      if (fallbackProvider && fallbackProvider.isEnabled) {
        return {
          provider: fallbackProvider,
          model: assignment.fallbackModel || assignment.primaryModel,
        };
      }
    }
    return null;
  }

  return {
    provider,
    model: assignment.primaryModel,
  };
}

/**
 * Create a provider instance from an assignment
 */
export async function createAgentProvider(agentName: string) {
  const config = await getProviderForAgent(agentName);

  if (!config) {
    throw new Error(`No AI provider configured for agent: ${agentName}`);
  }

  const { provider, model } = config;

  // Add model to provider metadata and include OAuth fields
  const providerWithModel: AIProvider = {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKeyDecrypted, // Use decrypted API key
    oauthToken: provider.oauthToken,
    oauthRefreshToken: provider.oauthRefreshToken,
    oauthExpiresAt: provider.oauthExpiresAt,
    isEnabled: provider.isEnabled,
    metadata: {
      ...provider.metadata,
      model,
    },
  };

  return createProvider(providerWithModel);
}

/**
 * Generate a chat completion for an agent
 */
export async function generateAgentChat(
  agentName: string,
  messages: ChatMessage[],
  options?: ChatOptions
): Promise<string> {
  const providerService = await createAgentProvider(agentName);
  const result = await providerService.chat(messages || [], options);
  return result.content;
}

/**
 * Generate a streaming chat completion for an agent
 */
export async function* streamAgentChat(
  agentName: string,
  messages: ChatMessage[],
  options?: ChatOptions
): AsyncGenerator<string> {
  const providerService = await createAgentProvider(agentName);
  yield* providerService.chatStream(messages || [], options);
}

/**
 * Initialize default model assignments for all Quorum agents
 */
export async function initializeDefaultModelAssignments(): Promise<void> {
  const agents = [
    'connector',
    'executor',
    'strategist',
    'devils-advocate',
    'opportunist',
    'data-collector',
    'closer',
  ];

  // Check if there's at least one provider configured
  const providers = await getAllProviders();
  if (providers.length === 0) {
    console.log('No providers configured, skipping model assignment initialization');
    return;
  }

  const defaultProvider = providers[0];

  for (const agent of agents) {
    const existing = await getAgentModelAssignment(agent);
    if (!existing) {
      await setAgentModelAssignment(
        agent,
        defaultProvider.id,
        defaultProvider.metadata?.model as string || 'gpt-4o-mini'
      );
      console.log(`Initialized model assignment for ${agent}`);
    }
  }
}

function mapRowToAssignment(row: Record<string, unknown>): AgentModelAssignment {
  return {
    id: row.id as string,
    agentName: row.agent_name as string,
    primaryProviderId: row.primary_provider_id as string,
    primaryModel: row.primary_model as string,
    fallbackProviderId: row.fallback_provider_id as string | null,
    fallbackModel: row.fallback_model as string | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}
