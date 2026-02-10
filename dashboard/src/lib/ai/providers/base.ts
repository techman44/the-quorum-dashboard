// Base types and interfaces for AI providers

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  topP?: number;
}

export interface ChatChunk {
  content: string;
  done: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string; // For custom providers
  apiKey?: string;
  oauthToken?: string;
  oauthRefreshToken?: string;
  oauthExpiresAt?: Date;
  isEnabled: boolean;
  metadata?: Record<string, unknown>;
}

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openrouter'
  | 'custom';

export interface AIModel {
  id: string;
  name: string;
  providerId: string;
  providerType: ProviderType;
  contextWindow: number;
  supportsStreaming: boolean;
  description?: string;
}

export interface ProviderCapabilities {
  streaming: boolean;
  systemMessages: boolean;
  maxTokens: number;
}

// Standard model lists for each provider
export const STANDARD_MODELS: Record<ProviderType, AIModel[]> = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', providerType: 'openai', contextWindow: 128000, supportsStreaming: true, description: 'OpenAI\'s most capable model' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'openai', providerType: 'openai', contextWindow: 128000, supportsStreaming: true, description: 'Faster, cheaper GPT-4o' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', providerId: 'openai', providerType: 'openai', contextWindow: 128000, supportsStreaming: true, description: 'GPT-4 with faster performance' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', providerId: 'openai', providerType: 'openai', contextWindow: 16385, supportsStreaming: true, description: 'Fast and cost-effective' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', providerId: 'anthropic', providerType: 'anthropic', contextWindow: 200000, supportsStreaming: true, description: 'Balanced performance and speed' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', providerId: 'anthropic', providerType: 'anthropic', contextWindow: 200000, supportsStreaming: true, description: 'Most capable Claude model' },
    { id: 'claude-haiku-4-20250514', name: 'Claude Haiku 4', providerId: 'anthropic', providerType: 'anthropic', contextWindow: 200000, supportsStreaming: true, description: 'Fastest Claude model' },
  ],
  google: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', providerId: 'google', providerType: 'google', contextWindow: 1000000, supportsStreaming: true, description: 'Google\'s most capable model' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', providerId: 'google', providerType: 'google', contextWindow: 1000000, supportsStreaming: true, description: 'Fast Gemini model' },
  ],
  openrouter: [
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (via OpenRouter)', providerId: 'openrouter', providerType: 'openrouter', contextWindow: 200000, supportsStreaming: true },
    { id: 'openai/gpt-4o', name: 'GPT-4o (via OpenRouter)', providerId: 'openrouter', providerType: 'openrouter', contextWindow: 128000, supportsStreaming: true },
  ],
  custom: [], // Models for custom providers are user-defined
};

export function getStandardModels(providerType: ProviderType): AIModel[] {
  return STANDARD_MODELS[providerType] || [];
}

export function getModelById(modelId: string, providerType: ProviderType): AIModel | undefined {
  return STANDARD_MODELS[providerType].find(m => m.id === modelId);
}
