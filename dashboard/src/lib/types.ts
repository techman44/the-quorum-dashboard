// Types matching the Quorum PostgreSQL schema exactly

export interface QuorumDocument {
  id: string;
  doc_type: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  tags: string[];
  created_at: Date;
  updated_at: Date;
}

export interface QuorumEvent {
  id: string;
  event_type: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  thread_id?: string | null;
  thread_title?: string | null;
  created_at: Date;
}

export interface QuorumThread {
  id: string;
  thread_id: string;
  title: string;
  message_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface QuorumTask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  owner: string | null;
  due_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface QuorumAgentRun {
  id: string;
  agent_name: string;
  started_at: Date;
  completed_at: Date | null;
  status: 'running' | 'completed' | 'failed';
  summary: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface QuorumAgentConfig {
  agent_name: string;
  display_name: string;
  avatar_url: string | null;
  cron_schedule: string;
  prompt: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  updated_at: Date;
}

export interface QuorumStats {
  documents: number;
  events: number;
  tasks: number;
  embeddings: number;
  unembedded_documents: number;
  unembedded_events: number;
}

export interface SearchResult {
  id: string;
  doc_type: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  tags: string[];
  score: number;
}

export interface QuorumDocumentWithEmbedding extends QuorumDocument {
  has_embedding: boolean;
}

export type QuorumObservationCategory =
  | 'critique'
  | 'risk'
  | 'insight'
  | 'recommendation'
  | 'issue'
  | 'improvement'
  | 'other';

export type QuorumObservationSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type QuorumObservationStatus = 'open' | 'acknowledged' | 'addressed' | 'dismissed';

export type QuorumObservationRefType =
  | 'document'
  | 'task'
  | 'event'
  | 'agent_run'
  | 'observation'
  | null;

export interface QuorumObservation {
  id: string;
  category: QuorumObservationCategory;
  content: string;
  source_agent: string;
  severity: QuorumObservationSeverity;
  status: QuorumObservationStatus;
  ref_id: string | null;
  ref_type: QuorumObservationRefType;
  fingerprint: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateObservationInput {
  category: QuorumObservationCategory;
  content: string;
  source_agent: string;
  severity?: QuorumObservationSeverity;
  status?: QuorumObservationStatus;
  ref_id?: string | null;
  ref_type?: QuorumObservationRefType;
  metadata?: Record<string, unknown>;
}

// ─── AI Provider Types ─────────────────────────────────────────────────────

export type AIProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom';

export interface AIProvider {
  id: string;
  providerType: AIProviderType;
  name: string;
  isEnabled: boolean;
  apiKeyEncrypted?: string;
  oauthToken?: string;
  baseUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentModelAssignment {
  id: string;
  agentName: string;
  primaryProviderId: string;
  primaryModel: string;
  fallbackProviderId?: string;
  fallbackModel?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatSession {
  id: string;
  sessionId: string;
  agentName?: string;
  messages: ChatMessage[];
  totalTokens: number;
  createdAt: Date;
  updatedAt: Date;
}

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

// ─── N8n Workflow Types ────────────────────────────────────────────────────────

export type N8nWebhookEventType =
  | 'observation'
  | 'chat'
  | 'agent_trigger'
  | 'workflow_complete'
  | 'workflow_error';

export interface N8nWebhookEvent {
  event_type: N8nWebhookEventType;
  source_workflow: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  received_at: Date;
}

export interface N8nWebhookResponse {
  success: boolean;
  message: string;
  data: Record<string, unknown>;
}

export interface N8nWorkflowTriggerRequest {
  workflow_id?: string;
  webhook_path?: string;
  data: Record<string, unknown>;
  await_result?: boolean;
  timeout?: number;
}

export interface N8nWorkflowTriggerResponse {
  success: boolean;
  workflowId: string | null;
  executionId: string | null;
  data: Record<string, unknown> | null;
  message: string;
  error?: string;
  finished?: boolean;
}

export interface N8nWorkflowExecution {
  id: string;
  workflow_id: string;
  status: 'running' | 'completed' | 'error' | 'waiting';
  finished: boolean;
  data: Record<string, unknown>;
  started_at: Date;
  stopped_at?: Date;
}

export interface N8nWorkflowConfig {
  workflow_id: string;
  name: string;
  webhook_path: string;
  enabled: boolean;
  description?: string;
  expected_data_schema?: Record<string, unknown>;
  response_schema?: Record<string, unknown>;
}

// ─── Embedding Provider Types ─────────────────────────────────────────────────────

export type EmbeddingProviderType = 'openai' | 'ollama' | 'custom' | 'openrouter';

export interface EmbeddingProviderConfig {
  id: string;
  providerType: EmbeddingProviderType;
  name: string;
  model: string;
  baseUrl?: string;
  apiKeyEncrypted?: string;
  enabled: boolean;
}

export interface EmbeddingModel {
  id: string;
  name: string;
  providerType: EmbeddingProviderType;
  dimension: number;
}

// ─── Skills Types ─────────────────────────────────────────────────────

export type SkillCategory =
  | 'storage'
  | 'communication'
  | 'automation'
  | 'integration'
  | 'monitoring'
  | 'productivity';

export interface SkillSetting {
  key: string;
  label: string;
  type: 'text' | 'password' | 'boolean' | 'number' | 'select' | 'path' | 'cron';
  description?: string;
  defaultValue?: unknown;
  required?: boolean;
  options?: SkillSettingOption[];
  placeholder?: string;
}

export interface SkillSettingOption {
  label: string;
  value: string | number | boolean;
}

export interface SkillMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  category: SkillCategory;
  enabled: boolean;
  capabilities: string[];
  settings: SkillSetting[];
  requiredTools: string[];
  agentAccess: string[];
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillConfig {
  id: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  agentAccess: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillInfo extends Omit<SkillMetadata, 'settings'> {
  settingDefinitions: SkillSetting[];  // The setting definitions from metadata
  configuredSettings: Record<string, unknown>;  // The actual configured values
  isConfigured: boolean;
  hasErrors?: boolean;
  lastUsed?: Date;
}
