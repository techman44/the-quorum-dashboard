/**
 * Skills schema for dynamic skill discovery and management
 *
 * A "skill" represents an integration capability that agents can use.
 * Examples: Obsidian integration, Google Gmail, Telegram, etc.
 */

export interface SkillMetadata {
  // Basic identity
  id: string;                    // e.g., "obsidian", "google-gmail", "telegram"
  name: string;                  // e.g., "Obsidian", "Google Gmail"
  version: string;               // Semantic version for tracking updates
  description: string;           // Short description for UI

  // Visual representation
  icon: string;                  // Lucide-react icon name
  category: SkillCategory;       // For grouping in UI

  // State
  enabled: boolean;              // Whether this skill is active

  // Capabilities
  capabilities: string[];        // What the skill can do (e.g., ["search", "sync", "create"])

  // Configuration
  settings: SkillSetting[];      // Configurable settings for this skill
  requiredTools: string[];       // What external tools are needed (e.g., "obsidian-cli")

  // Agent access
  agentAccess: string[];         // Which agents can use this skill (empty = all agents)

  // Metadata
  author?: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillSetting {
  key: string;                   // Setting identifier
  label: string;                 // Human-readable label
  type: 'text' | 'password' | 'boolean' | 'number' | 'select' | 'path' | 'cron';
  description?: string;          // Help text
  defaultValue?: unknown;        // Default value
  required?: boolean;            // Whether this setting must be configured
  options?: SkillSettingOption[]; // For select type
  placeholder?: string;          // Placeholder text
  validation?: SkillValidation;  // Validation rules
}

export interface SkillSettingOption {
  label: string;
  value: string | number | boolean;
}

export interface SkillValidation {
  pattern?: string;              // Regex pattern for text fields
  min?: number;                  // Minimum value for numbers
  max?: number;                  // Maximum value for numbers
  minLength?: number;            // Minimum length for text
  maxLength?: number;            // Maximum length for text
}

export type SkillCategory =
  | 'storage'        // Document/note storage (Obsidian, Google Drive)
  | 'communication'  // Messaging/communication (Telegram, Slack, Email)
  | 'automation'     // Workflow automation (N8n, Zapier)
  | 'integration'    // API integrations (Google Calendar, Notion)
  | 'monitoring'     // Monitoring and health checks
  | 'productivity';  // Productivity tools (Task managers, calendars)

/**
 * Runtime skill configuration (stored in database)
 * This is the actual configured state of a skill
 */
export interface SkillConfig {
  id: string;                     // Matches SkillMetadata.id
  enabled: boolean;
  settings: Record<string, unknown>; // Configured values for settings
  agentAccess: string[];          // Override of default agent access
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Complete skill info (metadata + runtime config)
 */
export interface SkillInfo extends Omit<SkillMetadata, 'settings'> {
  settingDefinitions: SkillSetting[];  // The setting definitions from metadata
  configuredSettings: Record<string, unknown>;  // The actual configured values
  isConfigured: boolean;          // Whether required settings are set
  hasErrors?: boolean;            // Whether there are configuration errors
  lastUsed?: Date;                // When this skill was last used
}

/**
 * Default skills that are available in the system
 */
export const DEFAULT_SKILLS: SkillMetadata[] = [
  {
    id: 'obsidian',
    name: 'Obsidian',
    version: '1.0.0',
    description: 'Sync and search your Obsidian vault notes',
    icon: 'file-text',
    category: 'storage',
    enabled: true,
    capabilities: [
      'search_notes',
      'sync_notes',
      'create_note',
      'update_note',
      'list_vaults'
    ],
    settings: [
      {
        key: 'vaultPath',
        label: 'Vault Path',
        type: 'path',
        description: 'Path to your Obsidian vault directory',
        placeholder: '/path/to/obsidian/vault',
        required: true,
      },
      {
        key: 'syncSchedule',
        label: 'Sync Schedule',
        type: 'cron',
        description: 'Cron expression for automatic sync',
        defaultValue: '0 */6 * * *',
        placeholder: '0 */6 * * *',
      },
      {
        key: 'autoSync',
        label: 'Auto Sync',
        type: 'boolean',
        description: 'Automatically sync on schedule',
        defaultValue: true,
      },
      {
        key: 'syncOnStart',
        label: 'Sync on Start',
        type: 'boolean',
        description: 'Sync notes when dashboard starts',
        defaultValue: true,
      },
    ],
    requiredTools: ['obsidian-cli'],
    agentAccess: ['connector', 'data-collector', 'quorum'],
    tags: ['notes', 'knowledge-base', 'markdown', 'pkm'],
  },
  {
    id: 'google-gmail',
    name: 'Google Gmail',
    version: '1.0.0',
    description: 'Read and manage Gmail messages',
    icon: 'mail',
    category: 'communication',
    enabled: false,
    capabilities: [
      'list_messages',
      'read_message',
      'search_messages',
      'send_message',
      'get_thread'
    ],
    settings: [
      {
        key: 'oauthAccountId',
        label: 'OAuth Account',
        type: 'text',
        description: 'Google OAuth account ID from provider settings',
        required: true,
      },
      {
        key: 'syncSchedule',
        label: 'Sync Schedule',
        type: 'cron',
        description: 'How often to check for new messages',
        defaultValue: '*/30 * * * *',
      },
      {
        key: 'autoSync',
        label: 'Auto Sync',
        type: 'boolean',
        description: 'Automatically fetch new messages',
        defaultValue: false,
      },
    ],
    requiredTools: ['google-oauth'],
    agentAccess: ['connector', 'data-collector'],
    tags: ['email', 'google', 'communication'],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    version: '1.0.0',
    description: 'Send and receive Telegram messages',
    icon: 'send',
    category: 'communication',
    enabled: false,
    capabilities: [
      'send_message',
      'get_updates',
      'get_chat_history',
      'get_me'
    ],
    settings: [
      {
        key: 'botToken',
        label: 'Bot Token',
        type: 'password',
        description: 'Telegram bot token from BotFather',
        required: true,
        placeholder: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz',
      },
      {
        key: 'chatId',
        label: 'Default Chat ID',
        type: 'text',
        description: 'Default chat ID to send messages to',
        placeholder: '123456789',
      },
      {
        key: 'webhookUrl',
        label: 'Webhook URL',
        type: 'text',
        description: 'Optional webhook URL for receiving messages',
        placeholder: 'https://your-domain.com/api/telegram/webhook',
      },
    ],
    requiredTools: [],
    agentAccess: ['connector', 'executor', 'quorum'],
    tags: ['messaging', 'bot', 'notification'],
  },
  {
    id: 'n8n',
    name: 'N8n Automation',
    version: '1.0.0',
    description: 'Trigger and monitor N8n workflows',
    icon: 'workflow',
    category: 'automation',
    enabled: false,
    capabilities: [
      'trigger_workflow',
      'get_execution',
      'list_workflows',
      'get_webhook_url'
    ],
    settings: [
      {
        key: 'baseUrl',
        label: 'N8n Base URL',
        type: 'text',
        description: 'URL of your N8n instance',
        required: true,
        placeholder: 'http://localhost:5678',
      },
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        description: 'N8n API key for authentication',
        required: true,
      },
    ],
    requiredTools: [],
    agentAccess: ['connector', 'executor', 'opportunist'],
    tags: ['automation', 'workflows', 'integration'],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    version: '1.0.0',
    description: 'Manage calendar events and schedules',
    icon: 'calendar',
    category: 'productivity',
    enabled: false,
    capabilities: [
      'list_events',
      'create_event',
      'update_event',
      'delete_event',
      'get_free_busy'
    ],
    settings: [
      {
        key: 'oauthAccountId',
        label: 'OAuth Account',
        type: 'text',
        description: 'Google OAuth account ID from provider settings',
        required: true,
      },
      {
        key: 'calendarId',
        label: 'Calendar ID',
        type: 'text',
        description: 'Primary calendar ID (usually "primary" or email)',
        defaultValue: 'primary',
      },
    ],
    requiredTools: ['google-oauth'],
    agentAccess: ['executor', 'strategist', 'connector'],
    tags: ['calendar', 'google', 'scheduling', 'productivity'],
  },
];

/**
 * Get skill by ID
 */
export function getSkillMetadata(id: string): SkillMetadata | null {
  return DEFAULT_SKILLS.find(s => s.id === id) || null;
}

/**
 * Get all skills in a category
 */
export function getSkillsByCategory(category: SkillCategory): SkillMetadata[] {
  return DEFAULT_SKILLS.filter(s => s.category === category);
}

/**
 * Get skills that an agent can use
 */
export function getSkillsForAgent(agentName: string): SkillMetadata[] {
  return DEFAULT_SKILLS.filter(skill =>
    skill.enabled &&
    (skill.agentAccess.length === 0 || skill.agentAccess.includes(agentName))
  );
}

/**
 * Validate a skill setting value
 */
export function validateSkillSetting(
  setting: SkillSetting,
  value: unknown
): { valid: boolean; error?: string } {
  if (setting.required && (value === null || value === undefined || value === '')) {
    return { valid: false, error: `${setting.label} is required` };
  }

  if (setting.validation) {
    const v = setting.validation;

    if (typeof value === 'string') {
      if (v.minLength && value.length < v.minLength) {
        return { valid: false, error: `${setting.label} must be at least ${v.minLength} characters` };
      }
      if (v.maxLength && value.length > v.maxLength) {
        return { valid: false, error: `${setting.label} must be at most ${v.maxLength} characters` };
      }
      if (v.pattern) {
        const regex = new RegExp(v.pattern);
        if (!regex.test(value)) {
          return { valid: false, error: `${setting.label} format is invalid` };
        }
      }
    }

    if (typeof value === 'number') {
      if (v.min !== undefined && value < v.min) {
        return { valid: false, error: `${setting.label} must be at least ${v.min}` };
      }
      if (v.max !== undefined && value > v.max) {
        return { valid: false, error: `${setting.label} must be at most ${v.max}` };
      }
    }
  }

  return { valid: true };
}

/**
 * Check if a skill is properly configured
 */
export function isSkillConfigured(skill: SkillMetadata | SkillInfo, settings: Record<string, unknown>): boolean {
  const settingDefs = 'settingDefinitions' in skill ? skill.settingDefinitions : skill.settings;
  for (const setting of settingDefs) {
    if (setting.required) {
      const value = settings[setting.key];
      if (value === null || value === undefined || value === '') {
        return false;
      }
    }
  }
  return true;
}

/**
 * Get skill category display name
 */
export function getSkillCategoryName(category: SkillCategory): string {
  const names: Record<SkillCategory, string> = {
    storage: 'Storage',
    communication: 'Communication',
    automation: 'Automation',
    integration: 'Integrations',
    monitoring: 'Monitoring',
    productivity: 'Productivity',
  };
  return names[category] || category;
}

/**
 * Get skills grouped by category
 */
export function getSkillsByCategoryGroup(): Record<SkillCategory, SkillMetadata[]> {
  const grouped = {} as Record<SkillCategory, SkillMetadata[]>;

  for (const skill of DEFAULT_SKILLS) {
    if (!grouped[skill.category]) {
      grouped[skill.category] = [];
    }
    grouped[skill.category].push(skill);
  }

  return grouped;
}
