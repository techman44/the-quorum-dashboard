/**
 * Agent metadata schema for dynamic agent discovery
 *
 * Each agent can have a metadata.json file with these fields.
 * The system will auto-discover agents and their capabilities.
 */

export interface AgentMetadata {
  // Basic identity
  name: string;                    // e.g., "connector", "executor"
  displayName: string;             // e.g., "The Connector"
  version: string;                 // Semantic version for tracking updates

  // Visual representation
  icon: string;                    // Icon name (lucide-react) or emoji or URL
  color: string;                   // Hex color for UI theming
  description: string;             // Short description for UI

  // Scheduling (for autonomous agents)
  schedule?: string;               // Cron expression, empty if manual only
  enabled: boolean;                // Whether this agent is active

  // Self-description for other agents
  specialties: string[];           // What this agent specializes in
  reasonsToCall: string[];         // When other agents should invoke this agent
  capabilities: AgentCapability[]; // Tools and operations available

  // Cross-agent awareness
  collaboratesWith: string[];      // Which agents this commonly works with
  dependsOn: string[];             // Which agents' output this agent reads

  // Configuration
  category: AgentCategory;         // For grouping in UI
  requires: AgentRequirement[];    // What this agent needs to function

  // Prompt configuration
  systemPrompt?: string;           // Override default system prompt
  tools?: string[];                // Required tools (e.g., "quorum_search", "email")

  // Metadata
  author?: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentCapability {
  name: string;                    // e.g., "search_memory", "send_email"
  description: string;             // What this capability does
  inputType?: string;              // Expected input format
  outputType?: string;             // Expected output format
}

export type AgentCategory =
  | 'conscience'      // The original 7 Quorum agents
  | 'analysis'        // Data analysis and insights
  | 'automation'      // Workflow automation
  | 'integration'     // External system integrations
  | 'industry'        // Industry-specific agents
  | 'custom';         // User-defined agents

export interface AgentRequirement {
  type: 'database' | 'tool' | 'api' | 'service';
  name: string;
  description?: string;
}

/**
 * Dynamic agent roster - shared with all agents
 * This is what gets injected into agent prompts so they know about each other
 */
export interface AgentRosterEntry {
  name: string;
  displayName: string;
  specialties: string[];
  reasonsToCall: string[];
  capabilities: string[];  // Simplified capability names
}

/**
 * Default metadata for built-in Quorum agents
 * These can be overridden by individual agent metadata files
 */
export const DEFAULT_AGENTS: AgentMetadata[] = [
  {
    name: 'connector',
    displayName: 'The Connector',
    version: '1.0.0',
    icon: 'link',
    color: '#3B82F6',
    description: 'Finds non-obvious connections between information',
    schedule: '*/15 * * * *',
    enabled: true,
    specialties: [
      'historical context retrieval',
      'cross-referencing conversations',
      'finding relationships between entities',
      'surfacing forgotten information'
    ],
    reasonsToCall: [
      'When you need to find if something was discussed before',
      'When historical context could inform current decisions',
      'When connecting people, companies, or projects across time',
      'When past work might be reusable for current problems'
    ],
    capabilities: [
      { name: 'search_memory', description: 'Search across all stored information semantically' },
      { name: 'find_connections', description: 'Identify relationships between entities' },
      { name: 'surface_context', description: 'Retrieve relevant historical context' }
    ],
    collaboratesWith: ['strategist', 'executor', 'devils-advocate', 'opportunist'],
    dependsOn: [],
    category: 'conscience',
    requires: [
      { type: 'database', name: 'quorum_documents' },
      { type: 'database', name: 'quorum_events' },
      { type: 'database', name: 'embeddings' }
    ],
    tools: ['quorum_search', 'quorum_store_event'],
    tags: ['memory', 'context', 'connections']
  },
  {
    name: 'executor',
    displayName: 'The Executor',
    version: '1.0.0',
    icon: 'gavel',
    color: '#EF4444',
    description: 'Tracks commitments, deadlines, and accountability',
    schedule: '0 * * * *',
    enabled: true,
    specialties: [
      'task tracking',
      'commitment monitoring',
      'deadline enforcement',
      'accountability'
    ],
    reasonsToCall: [
      'When a task needs to be created or tracked',
      'When a deadline is approaching or missed',
      'When someone commits to doing something',
      'When accountability needs to be enforced'
    ],
    capabilities: [
      { name: 'create_task', description: 'Create a new tracked task' },
      { name: 'update_task', description: 'Update task status or priority' },
      { name: 'flag_overdue', description: 'Flag overdue items for attention' }
    ],
    collaboratesWith: ['connector', 'strategist', 'closer'],
    dependsOn: ['connector'],
    category: 'conscience',
    requires: [
      { type: 'database', name: 'quorum_tasks' }
    ],
    tools: ['quorum_list_tasks', 'quorum_create_task', 'quorum_update_task', 'quorum_store_event'],
    tags: ['tasks', 'accountability', 'deadlines']
  },
  {
    name: 'strategist',
    displayName: 'The Strategist',
    version: '1.0.0',
    icon: 'compass',
    color: '#8B5CF6',
    description: 'Daily strategic synthesis and reprioritization',
    schedule: '0 6 * * *',
    enabled: true,
    specialties: [
      'strategic reflection',
      'pattern recognition over time',
      'priority alignment',
      'trajectory analysis'
    ],
    reasonsToCall: [
      'When analyzing patterns across multiple days',
      'When priorities need realignment',
      'When assessing what is working vs stuck',
      'When making strategic decisions'
    ],
    capabilities: [
      { name: 'write_reflection', description: 'Create strategic reflection documents' },
      { name: 'reprioritize', description: 'Adjust task priorities based on strategy' },
      { name: 'identify_patterns', description: 'Find patterns in activity over time' }
    ],
    collaboratesWith: ['connector', 'executor', 'devils-advocate', 'opportunist', 'closer'],
    dependsOn: ['connector', 'executor', 'devils-advocate', 'opportunist'],
    category: 'conscience',
    requires: [
      { type: 'database', name: 'quorum_events' },
      { type: 'database', name: 'quorum_tasks' }
    ],
    tools: ['quorum_search', 'quorum_store', 'quorum_list_tasks', 'quorum_store_event'],
    tags: ['strategy', 'reflection', 'priorities']
  },
  {
    name: 'devils-advocate',
    displayName: "The Devil's Advocate",
    version: '1.0.0',
    icon: 'alert-triangle',
    color: '#F59E0B',
    description: 'Challenges assumptions and identifies risks',
    schedule: '0 */4 * * *',
    enabled: true,
    specialties: [
      'risk identification',
      'assumption challenging',
      'stress-testing plans',
      'blind spot detection'
    ],
    reasonsToCall: [
      'Before making significant decisions',
      'When a plan seems too optimistic',
      'When assumptions need verification',
      'When identifying failure modes'
    ],
    capabilities: [
      { name: 'critique_plan', description: 'Identify risks and assumptions in plans' },
      { name: 'challenge_assumption', description: 'Question unexamined premises' },
      { name: 'identify_risks', description: 'Find potential failure modes' }
    ],
    collaboratesWith: ['strategist', 'executor', 'opportunist'],
    dependsOn: [],
    category: 'conscience',
    requires: [],
    tools: ['quorum_search', 'quorum_store_event'],
    tags: ['risks', 'critique', 'assumptions']
  },
  {
    name: 'opportunist',
    displayName: 'The Opportunist',
    version: '1.0.0',
    icon: 'lightbulb',
    color: '#10B981',
    description: 'Finds quick wins and hidden value',
    schedule: '0 */6 * * *',
    enabled: true,
    specialties: [
      'quick win identification',
      'reusable asset discovery',
      'automation opportunities',
      'cross-project synergies'
    ],
    reasonsToCall: [
      'When looking for low-effort high-value actions',
      'When work could be reused across projects',
      'When something seems harder than necessary',
      'When opportunities might be missed'
    ],
    capabilities: [
      { name: 'find_quick_wins', description: 'Identify high-value low-effort opportunities' },
      { name: 'find_reuse', description: 'Find reusable code/content/work' },
      { name: 'find_synergies', description: 'Identify cross-project opportunities' }
    ],
    collaboratesWith: ['executor', 'strategist', 'connector'],
    dependsOn: ['executor', 'connector'],
    category: 'conscience',
    requires: [
      { type: 'database', name: 'quorum_tasks' },
      { type: 'database', name: 'quorum_documents' }
    ],
    tools: ['quorum_search', 'quorum_list_tasks', 'quorum_create_task', 'quorum_store_event'],
    tags: ['opportunities', 'quick-wins', 'synergies']
  },
  {
    name: 'data-collector',
    displayName: 'The Data Collector',
    version: '1.0.0',
    icon: 'database',
    color: '#6366F1',
    description: 'Scans inbox, processes files, verifies system health',
    schedule: '*/30 * * * *',
    enabled: true,
    specialties: [
      'file ingestion',
      'document processing',
      'metadata tagging',
      'inbox monitoring'
    ],
    reasonsToCall: [
      'When files need to be processed',
      'When information needs to be stored',
      'When verifying system health',
      'When checking data integrity'
    ],
    capabilities: [
      { name: 'scan_inbox', description: 'Process new files from inbox' },
      { name: 'store_document', description: 'Store and tag documents' },
      { name: 'verify_indexing', description: 'Ensure content is searchable' }
    ],
    collaboratesWith: [],
    dependsOn: [],
    category: 'conscience',
    requires: [
      { type: 'service', name: 'ollama' }
    ],
    tools: ['quorum_scan_inbox', 'quorum_store', 'quorum_integration_status'],
    tags: ['ingestion', 'processing', 'monitoring']
  },
  {
    name: 'closer',
    displayName: 'The Closer',
    version: '1.0.0',
    icon: 'check-circle',
    color: '#F97316',
    description: 'Verifies completion, closes tasks, updates status from evidence',
    schedule: '*/10 * * * *',
    enabled: true,
    specialties: [
      'verification',
      'completion confirmation',
      'evidence gathering',
      'task closure'
    ],
    reasonsToCall: [
      'When someone claims to have completed something',
      'When a task is marked done but needs verification',
      'When checking if work was actually finished',
      'When gathering evidence of completion'
    ],
    capabilities: [
      { name: 'verify_completion', description: 'Verify work against external evidence' },
      { name: 'close_task', description: 'Close verified tasks' },
      { name: 'gather_evidence', description: 'Find proof of completion' }
    ],
    collaboratesWith: ['executor', 'connector'],
    dependsOn: ['executor'],
    category: 'conscience',
    requires: [
      { type: 'database', name: 'quorum_tasks' }
    ],
    tools: ['quorum_search', 'quorum_list_tasks', 'quorum_complete_task', 'quorum_store_event'],
    tags: ['verification', 'completion', 'evidence']
  },
  {
    name: 'quorum',
    displayName: 'The Quorum',
    version: '1.0.0',
    icon: 'users',
    color: '#0EA5E9',
    description: 'Council mode - all agents collaborate on your query',
    schedule: '',
    enabled: true,
    specialties: [
      'multi-agent collaboration',
      'comprehensive analysis',
      'diverse perspective synthesis',
      'council deliberation'
    ],
    reasonsToCall: [
      'When you want input from all perspectives',
      'When complex issues need multiple viewpoints',
      'When you need comprehensive analysis',
      'When uncertain which agent to consult'
    ],
    capabilities: [
      { name: 'council_deliberation', description: 'All agents discuss and contribute' },
      { name: 'synthesize_perspectives', description: 'Combine insights from all agents' }
    ],
    collaboratesWith: ['connector', 'executor', 'strategist', 'devils-advocate', 'opportunist', 'data-collector', 'closer'],
    dependsOn: ['connector', 'executor', 'strategist', 'devils-advocate', 'opportunist', 'data-collector', 'closer'],
    category: 'conscience',
    requires: [],
    tools: [],
    tags: ['council', 'collaboration', 'multi-agent']
  }
];

/**
 * Generate the agent roster entry that gets injected into prompts
 */
export function agentToRosterEntry(agent: AgentMetadata): AgentRosterEntry {
  return {
    name: agent.name,
    displayName: agent.displayName,
    specialties: agent.specialties,
    reasonsToCall: agent.reasonsToCall,
    capabilities: agent.capabilities.map(c => c.name)
  };
}

/**
 * Generate the dynamic agent roster description for prompts
 */
export function generateAgentRosterPrompt(agents: AgentMetadata[]): string {
  const enabledAgents = agents.filter(a => a.enabled);

  if (enabledAgents.length === 0) {
    return 'No agents are currently available.';
  }

  let prompt = '## Available Agents\n\n';
  prompt += 'The following agents are available in this Quorum instance. ';
  prompt += 'Each agent has specific specialties and should be called when their expertise is relevant.\n\n';

  for (const agent of enabledAgents) {
    prompt += `### ${agent.displayName} (${agent.name})\n\n`;
    prompt += `**Specialties:**\n`;
    for (const specialty of agent.specialties) {
      prompt += `- ${specialty}\n`;
    }
    prompt += `\n**When to call this agent:**\n`;
    for (const reason of agent.reasonsToCall) {
      prompt += `- ${reason}\n`;
    }
    prompt += `\n**Capabilities:** ${agent.capabilities.map(c => c.name).join(', ')}\n\n`;
  }

  prompt += `## Cross-Agent Collaboration\n\n`;
  prompt += `When working with other agents, consider:\n`;
  prompt += `1. **Tag relevant agents** in your findings using the \`considered_agents\` field in metadata\n`;
  prompt += `2. **Check what other agents have flagged** for you by searching for events where \`metadata.considered_agents\` contains your name\n`;
  prompt += `3. **Collaborate with complementary agents** - e.g., Connector + Strategist for historical strategic analysis\n`;
  prompt += `4. **Use this roster dynamically** - the agents available may change over time\n`;

  return prompt;
}
