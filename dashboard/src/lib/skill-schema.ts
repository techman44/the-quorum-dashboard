/**
 * Skill metadata schema for dynamic skill discovery
 *
 * A "skill" represents an integration capability (like Obsidian, Google, Telegram)
 * that agents can use to perform actions. Each skill has its own configuration,
 * capabilities, and settings that can be managed through the dashboard.
 */

export type SkillCategory =
  | 'storage'        // File storage, notes, documents (Obsidian, Google Drive)
  | 'communication'  // Messaging, email, notifications (Telegram, Gmail)
  | 'automation'     // Workflow automation (n8n, Zapier)
  | 'integration'    // External service integrations (GitHub, GOG)
  | 'ai'             // AI/ML capabilities (OpenAI, Anthropic, Ollama)
  | 'data'           // Data processing and analytics
  | 'custom';        // User-defined skills

export type SkillSettingType = 'text' | 'password' | 'boolean' | 'number' | 'select' | 'multiline' | 'path';

export interface SkillSetting {
  key: string;
  label: string;
  type: SkillSettingType;
  description?: string;
  defaultValue?: unknown;
  required?: boolean;
  options?: { value: string; label: string }[]; // For select type
  placeholder?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  secret?: boolean; // If true, the value should be encrypted
}

export interface SkillCapability {
  name: string;
  description: string;
  inputType?: string;
  outputType?: string;
  requiresConfig?: string[]; // Which settings are required for this capability
}

export interface SkillMetadata {
  // Basic identity
  id: string;                      // e.g., "obsidian", "google-gmail", "telegram"
  name: string;                    // e.g., "Obsidian", "Google Gmail"
  version: string;                 // Semantic version
  description: string;             // Short description

  // Visual representation
  icon: string;                    // lucide-react icon name or emoji
  category: SkillCategory;
  color?: string;                  // Hex color for UI theming (optional)

  // State
  enabled: boolean;                // Whether this skill is active

  // Capabilities
  capabilities: SkillCapability[]; // What the skill can do

  // Configuration
  settings: SkillSetting[];        // Configurable settings
  requiredTools: string[];         // External tools required (CLI, services)
  agentAccess: 'all' | string[];   // Which agents can use this skill

  // Dependencies
  dependsOn?: string[];            // Other skills this depends on
  conflictsWith?: string[];        // Skills that conflict with this one

  // Metadata
  author?: string;
  tags: string[];
  documentation?: string;          // URL or path to documentation
  createdAt?: string;
  updatedAt?: string;

  // Runtime state (not stored in metadata)
  installed?: boolean;             // Whether required tools are installed
  configured?: boolean;            // Whether required settings are configured
  status?: 'available' | 'missing-dependencies' | 'not-configured' | 'error';
}

/**
 * Stored skill configuration (in database)
 */
export interface StoredSkill {
  id: string;
  config: Record<string, unknown>;  // User-configured values
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Complete skill with metadata and user configuration
 */
export interface CompleteSkill extends SkillMetadata {
  userConfig?: Record<string, unknown>;
  lastSync?: Date;
  healthStatus?: 'healthy' | 'warning' | 'error';
  healthMessage?: string;
}

/**
 * Default built-in skills
 * These represent the integrations available in The Quorum
 */
export const DEFAULT_SKILLS: SkillMetadata[] = [
  {
    id: 'obsidian',
    name: 'Obsidian',
    version: '1.0.0',
    description: 'Connect and sync your Obsidian vault for AI-powered note search and retrieval',
    icon: 'file-text',
    category: 'storage',
    color: '#7C3AED',
    enabled: false,
    capabilities: [
      {
        name: 'search_notes',
        description: 'Search across all notes in your Obsidian vault',
        requiresConfig: ['vaultPath']
      },
      {
        name: 'sync_notes',
        description: 'Sync notes from vault to Quorum database for semantic search',
        requiresConfig: ['vaultPath']
      },
      {
        name: 'get_vaults',
        description: 'List available Obsidian vaults'
      },
      {
        name: 'search_content',
        description: 'Search within note contents',
        requiresConfig: ['vaultPath']
      }
    ],
    settings: [
      {
        key: 'vaultPath',
        label: 'Vault Path',
        type: 'text',
        description: 'Path to your Obsidian vault directory',
        placeholder: '/Users/username/Documents/Vault',
        required: true
      },
      {
        key: 'syncSchedule',
        label: 'Sync Schedule (cron)',
        type: 'text',
        description: 'Cron expression for automatic note syncing',
        defaultValue: '0 */6 * * *',
        placeholder: '0 */6 * * *'
      },
      {
        key: 'autoSync',
        label: 'Auto-sync on schedule',
        type: 'boolean',
        description: 'Automatically sync notes based on schedule',
        defaultValue: true
      },
      {
        key: 'syncOnStart',
        label: 'Sync on dashboard start',
        type: 'boolean',
        description: 'Sync notes when the dashboard starts',
        defaultValue: true
      }
    ],
    requiredTools: ['obsidian-cli'],
    agentAccess: ['connector', 'data-collector', 'strategist'],
    tags: ['notes', 'knowledge-base', 'markdown', 'pkms'],
    documentation: 'https://help.obsidian.md/Extending+Obsidian/Obsidian+Local+REST+API'
  },
  {
    id: 'google-gmail',
    name: 'Google Gmail',
    version: '1.0.0',
    description: 'Read and analyze your Gmail conversations',
    icon: 'mail',
    category: 'communication',
    color: '#EA4335',
    enabled: false,
    capabilities: [
      {
        name: 'list_messages',
        description: 'List recent emails from your inbox',
        requiresConfig: ['oauth']
      },
      {
        name: 'search_messages',
        description: 'Search emails by content or sender',
        requiresConfig: ['oauth']
      },
      {
        name: 'get_thread',
        description: 'Get full conversation thread',
        requiresConfig: ['oauth']
      }
    ],
    settings: [
      {
        key: 'oauth',
        label: 'OAuth Token',
        type: 'password',
        description: 'Google OAuth access token (managed automatically)',
        secret: true
      },
      {
        key: 'maxResults',
        label: 'Max Results',
        type: 'number',
        description: 'Maximum number of emails to fetch',
        defaultValue: 50,
        validation: { min: 1, max: 500 }
      },
      {
        key: 'syncSchedule',
        label: 'Sync Schedule (cron)',
        type: 'text',
        description: 'How often to fetch new emails',
        defaultValue: '0 */2 * * *'
      }
    ],
    requiredTools: [],
    agentAccess: ['connector', 'data-collector'],
    tags: ['email', 'google', 'communication'],
    documentation: 'https://developers.google.com/gmail/api'
  },
  {
    id: 'telegram',
    name: 'Telegram',
    version: '1.0.0',
    description: 'Send notifications and receive updates via Telegram',
    icon: 'send',
    category: 'communication',
    color: '#0088CC',
    enabled: false,
    capabilities: [
      {
        name: 'send_message',
        description: 'Send a message to a Telegram chat',
        requiresConfig: ['botToken', 'chatId']
      },
      {
        name: 'send_notification',
        description: 'Send formatted notifications',
        requiresConfig: ['botToken', 'chatId']
      }
    ],
    settings: [
      {
        key: 'botToken',
        label: 'Bot Token',
        type: 'password',
        description: 'Your Telegram bot token from BotFather',
        placeholder: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz',
        required: true,
        secret: true
      },
      {
        key: 'chatId',
        label: 'Chat ID',
        type: 'text',
        description: 'Your Telegram chat ID (use @userinfobot to get it)',
        placeholder: '123456789',
        required: true
      },
      {
        key: 'notifyOnEvents',
        label: 'Notify on Events',
        type: 'select',
        description: 'Which events trigger notifications',
        options: [
          { value: 'all', label: 'All Events' },
          { value: 'critical', label: 'Critical Only' },
          { value: 'tasks', label: 'Task Changes' },
          { value: 'none', label: 'None' }
        ],
        defaultValue: 'critical'
      }
    ],
    requiredTools: [],
    agentAccess: ['executor', 'closer'],
    tags: ['notifications', 'messaging', 'alerts'],
    documentation: 'https://core.telegram.org/bots/api'
  },
  {
    id: 'github',
    name: 'GitHub',
    version: '1.0.0',
    description: 'Access repositories, issues, and pull requests',
    icon: 'github',
    category: 'integration',
    color: '#181717',
    enabled: false,
    capabilities: [
      {
        name: 'list_repos',
        description: 'List your repositories',
        requiresConfig: ['auth']
      },
      {
        name: 'get_issues',
        description: 'Fetch issues from a repository',
        requiresConfig: ['auth']
      },
      {
        name: 'get_prs',
        description: 'Fetch pull requests',
        requiresConfig: ['auth']
      },
      {
        name: 'create_issue',
        description: 'Create a new issue',
        requiresConfig: ['auth']
      }
    ],
    settings: [
      {
        key: 'authType',
        label: 'Authentication Type',
        type: 'select',
        description: 'How to authenticate with GitHub',
        options: [
          { value: 'token', label: 'Personal Access Token' },
          { value: 'oauth', label: 'OAuth App' }
        ],
        defaultValue: 'token'
      },
      {
        key: 'token',
        label: 'Personal Access Token',
        type: 'password',
        description: 'GitHub Classic or Fine-grained PAT',
        placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
        secret: true
      },
      {
        key: 'defaultOwner',
        label: 'Default Owner',
        type: 'text',
        description: 'Default repository owner/organization',
        placeholder: 'your-username'
      },
      {
        key: 'defaultRepo',
        label: 'Default Repository',
        type: 'text',
        description: 'Default repository to work with',
        placeholder: 'your-repo'
      }
    ],
    requiredTools: ['git'],
    agentAccess: ['connector', 'executor', 'opportunist'],
    tags: ['git', 'code', 'development', 'issues'],
    documentation: 'https://docs.github.com/en/rest'
  },
  {
    id: 'gog',
    name: 'GOG (Galaxy of Games)',
    version: '1.0.0',
    description: 'Access your GOG game library and wishlist',
    icon: 'gamepad-2',
    category: 'integration',
    color: '#86328A',
    enabled: false,
    capabilities: [
      {
        name: 'get_library',
        description: 'Get your GOG game library',
        requiresConfig: ['oauth']
      },
      {
        name: 'get_wishlist',
        description: 'Get your wishlist',
        requiresConfig: ['oauth']
      },
      {
        name: 'search_games',
        description: 'Search GOG catalog',
        requiresConfig: ['oauth']
      }
    ],
    settings: [
      {
        key: 'oauth',
        label: 'OAuth Token',
        type: 'password',
        description: 'GOG OAuth token (managed via GOG authorization flow)',
        secret: true
      },
      {
        key: 'syncOnStart',
        label: 'Sync on start',
        type: 'boolean',
        description: 'Sync library when dashboard starts',
        defaultValue: true
      }
    ],
    requiredTools: [],
    agentAccess: ['connector', 'data-collector'],
    tags: ['gaming', 'games', 'library', 'wishlist'],
    documentation: 'https://api.gog.com/docs'
  },
  {
    id: 'n8n',
    name: 'n8n Workflow Automation',
    version: '1.0.0',
    description: 'Trigger and monitor n8n workflows',
    icon: 'workflow',
    category: 'automation',
    color: '#EA4B71',
    enabled: false,
    capabilities: [
      {
        name: 'trigger_workflow',
        description: 'Trigger a workflow execution',
        requiresConfig: ['baseUrl', 'apiKey']
      },
      {
        name: 'get_executions',
        description: 'Get workflow execution status',
        requiresConfig: ['baseUrl', 'apiKey']
      },
      {
        name: 'webhook_receive',
        description: 'Receive webhooks from n8n'
      }
    ],
    settings: [
      {
        key: 'baseUrl',
        label: 'n8n Base URL',
        type: 'text',
        description: 'URL of your n8n instance',
        placeholder: 'http://localhost:5678',
        defaultValue: 'http://localhost:5678',
        required: true
      },
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        description: 'n8n API key for authentication',
        placeholder: 'your-n8n-api-key',
        secret: true,
        required: true
      },
      {
        key: 'timeout',
        label: 'Request Timeout (seconds)',
        type: 'number',
        description: 'Timeout for workflow requests',
        defaultValue: 30,
        validation: { min: 5, max: 300 }
      }
    ],
    requiredTools: [],
    agentAccess: ['executor', 'opportunist'],
    tags: ['automation', 'workflows', 'integration'],
    documentation: 'https://docs.n8n.io/api'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    version: '1.0.0',
    description: 'Access OpenAI models and capabilities',
    icon: 'sparkles',
    category: 'ai',
    color: '#10A37F',
    enabled: false,
    capabilities: [
      {
        name: 'chat',
        description: 'Generate chat completions',
        requiresConfig: ['apiKey']
      },
      {
        name: 'embeddings',
        description: 'Generate text embeddings',
        requiresConfig: ['apiKey']
      },
      {
        name: 'function_calling',
        description: 'Use function calling with structured outputs',
        requiresConfig: ['apiKey']
      }
    ],
    settings: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        description: 'OpenAI API key',
        placeholder: 'sk-...',
        secret: true,
        required: true
      },
      {
        key: 'baseUrl',
        label: 'Base URL',
        type: 'text',
        description: 'Custom base URL (for Azure or proxies)',
        placeholder: 'https://api.openai.com/v1'
      },
      {
        key: 'defaultModel',
        label: 'Default Model',
        type: 'select',
        description: 'Default model to use',
        options: [
          { value: 'gpt-4o', label: 'GPT-4o' },
          { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
          { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
          { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
        ],
        defaultValue: 'gpt-4o'
      }
    ],
    requiredTools: [],
    agentAccess: 'all',
    tags: ['ai', 'llm', 'chat', 'embeddings'],
    documentation: 'https://platform.openai.com/docs/api-reference'
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    version: '1.0.0',
    description: 'Access Anthropic Claude models',
    icon: 'brain',
    category: 'ai',
    color: '#D4915D',
    enabled: false,
    capabilities: [
      {
        name: 'chat',
        description: 'Generate chat completions',
        requiresConfig: ['apiKey']
      },
      {
        name: 'thinking_mode',
        description: 'Use extended thinking mode',
        requiresConfig: ['apiKey']
      }
    ],
    settings: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        description: 'Anthropic API key',
        placeholder: 'sk-ant-...',
        secret: true,
        required: true
      },
      {
        key: 'defaultModel',
        label: 'Default Model',
        type: 'select',
        description: 'Default model to use',
        options: [
          { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
          { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
          { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' }
        ],
        defaultValue: 'claude-opus-4-20250514'
      }
    ],
    requiredTools: [],
    agentAccess: 'all',
    tags: ['ai', 'llm', 'chat'],
    documentation: 'https://docs.anthropic.com/en/api/getting-started'
  },
  {
    id: 'ollama',
    name: 'Ollama',
    version: '1.0.0',
    description: 'Run local LLMs with Ollama',
    icon: 'cpu',
    category: 'ai',
    color: '#FFFFFF',
    enabled: true,
    capabilities: [
      {
        name: 'chat',
        description: 'Generate chat completions'
      },
      {
        name: 'embeddings',
        description: 'Generate text embeddings'
      },
      {
        name: 'list_models',
        description: 'List available models'
      }
    ],
    settings: [
      {
        key: 'host',
        label: 'Ollama Host',
        type: 'text',
        description: 'URL of your Ollama instance',
        defaultValue: 'http://localhost:11434',
        placeholder: 'http://localhost:11434'
      },
      {
        key: 'chatModel',
        label: 'Chat Model',
        type: 'text',
        description: 'Default model for chat completions',
        defaultValue: 'llama3.2'
      },
      {
        key: 'embeddingModel',
        label: 'Embedding Model',
        type: 'text',
        description: 'Model for generating embeddings',
        defaultValue: 'mxbai-embed-large'
      }
    ],
    requiredTools: ['ollama'],
    agentAccess: 'all',
    tags: ['ai', 'llm', 'local', 'embeddings'],
    documentation: 'https://github.com/ollama/ollama/blob/main/docs/api.md'
  },
  {
    id: 'webhook',
    name: 'Webhook Receiver',
    version: '1.0.0',
    description: 'Receive and process webhooks from external services',
    icon: 'webhook',
    category: 'automation',
    color: '#64748B',
    enabled: true,
    capabilities: [
      {
        name: 'receive_webhook',
        description: 'Receive incoming webhook requests'
      },
      {
        name: 'verify_signature',
        description: 'Verify webhook signatures'
      }
    ],
    settings: [
      {
        key: 'secret',
        label: 'Webhook Secret',
        type: 'password',
        description: 'Secret for verifying webhook signatures',
        secret: true
      },
      {
        key: 'allowedSources',
        label: 'Allowed Sources',
        type: 'multiline',
        description: 'Comma-separated list of allowed IP addresses or CIDR ranges',
        placeholder: '192.168.1.0/24, 10.0.0.1'
      }
    ],
    requiredTools: [],
    agentAccess: ['data-collector', 'connector'],
    tags: ['webhooks', 'automation', 'integration']
  }
];

/**
 * Get skill by ID
 */
export function getSkillById(id: string): SkillMetadata | undefined {
  return DEFAULT_SKILLS.find(skill => skill.id === id);
}

/**
 * Get skills by category
 */
export function getSkillsByCategory(category: SkillCategory): SkillMetadata[] {
  return DEFAULT_SKILLS.filter(skill => skill.category === category);
}

/**
 * Get skills that an agent can access
 */
export function getSkillsForAgent(agentName: string): SkillMetadata[] {
  return DEFAULT_SKILLS.filter(skill => {
    if (skill.agentAccess === 'all') return true;
    return skill.agentAccess.includes(agentName);
  });
}

/**
 * Get agents that can use a skill
 */
export function getAgentsForSkill(skillId: string): string[] {
  const skill = getSkillById(skillId);
  if (!skill) return [];
  if (skill.agentAccess === 'all') return ['all'];
  return skill.agentAccess;
}

/**
 * Generate skill description for agent prompts
 */
export function generateSkillPrompt(skill: SkillMetadata): string {
  let prompt = `### ${skill.name}\n\n`;
  prompt += `**Description:** ${skill.description}\n\n`;
  prompt += `**Capabilities:**\n`;
  for (const capability of skill.capabilities) {
    const reqNote = capability.requiresConfig?.length
      ? ` (requires: ${capability.requiresConfig.join(', ')})`
      : '';
    prompt += `- \`${capability.name}\`: ${capability.description}${reqNote}\n`;
  }
  return prompt;
}

/**
 * Generate all available skills prompt section
 */
export function generateSkillsPrompt(skills: SkillMetadata[]): string {
  const enabledSkills = skills.filter(s => s.enabled);

  if (enabledSkills.length === 0) {
    return 'No external skills are currently enabled.';
  }

  let prompt = '## Available Skills\n\n';
  prompt += 'The following integration skills are available for use:\n\n';

  for (const skill of enabledSkills) {
    prompt += generateSkillPrompt(skill);
  }

  return prompt;
}
