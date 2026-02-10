/**
 * Dynamic skills discovery system
 *
 * Discovers and manages integration skills from:
 * 1. Default built-in skills
 * 2. Database-stored skill configurations
 * 3. Future: File system scanning for custom skills
 */

import { pool, upsertSkillConfig, getSkillConfig, listSkillConfigs, type SkillConfig } from './db';
import {
  DEFAULT_SKILLS,
  getSkillMetadata,
  isSkillConfigured,
  type SkillMetadata,
  type SkillInfo,
  type SkillSetting,
} from './skills-schema';

// In-memory cache of discovered skills
let skillsCache: Map<string, SkillInfo> | null = null;
let cacheTimestamp: number = 0;
let tableInitialized = false;
const CACHE_TTL = 60000; // 1 minute

/**
 * Ensure the skills table exists
 */
export async function ensureSkillsTable(): Promise<void> {
  if (tableInitialized) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quorum_skills (
        id TEXT PRIMARY KEY,
        enabled BOOLEAN DEFAULT true,
        settings JSONB NOT NULL DEFAULT '{}',
        agent_access TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_quorum_skills_enabled ON quorum_skills(enabled)
    `);
    tableInitialized = true;
  } catch (error) {
    console.error('Failed to create skills table:', error);
  }
}

/**
 * Build a SkillInfo from metadata and database config
 */
function buildSkillInfo(metadata: SkillMetadata, config?: SkillConfig): SkillInfo {
  const configuredSettings = config?.settings || {};
  const agentAccess = config?.agentAccess || metadata.agentAccess;
  const enabled = config?.enabled ?? metadata.enabled;

  return {
    id: metadata.id,
    name: metadata.name,
    version: metadata.version,
    description: metadata.description,
    icon: metadata.icon,
    category: metadata.category,
    enabled,
    capabilities: metadata.capabilities,
    settingDefinitions: metadata.settings,
    configuredSettings,
    requiredTools: metadata.requiredTools,
    agentAccess,
    tags: metadata.tags,
    author: metadata.author,
    createdAt: config?.createdAt?.toISOString(),
    updatedAt: config?.updatedAt?.toISOString(),
    isConfigured: isSkillConfigured(metadata, configuredSettings),
  };
}

/**
 * Discover all skills (with caching)
 * @param includeDisabled - If true, returns all skills including disabled ones
 */
export async function discoverSkills(includeDisabled: boolean = false): Promise<SkillInfo[]> {
  const now = Date.now();

  // Return cached skills if fresh
  if (skillsCache && (now - cacheTimestamp) < CACHE_TTL) {
    const allSkills = Array.from(skillsCache.values());
    return includeDisabled ? allSkills : allSkills.filter(s => s.enabled);
  }

  // Ensure table exists
  await ensureSkillsTable();

  // Load all skill configurations from database
  const dbConfigs = await listSkillConfigs();
  const configMap = new Map<string, SkillConfig>();
  for (const config of dbConfigs) {
    configMap.set(config.id, config);
  }

  // Build skill info by merging default metadata with database config
  const skillMap = new Map<string, SkillInfo>();

  // Start with default skills
  for (const defaultSkill of DEFAULT_SKILLS) {
    const config = configMap.get(defaultSkill.id);
    const skillInfo = buildSkillInfo(defaultSkill, config);
    skillMap.set(defaultSkill.id, skillInfo);
  }

  // Add any custom skills from database that aren't in defaults
  for (const config of dbConfigs) {
    if (!skillMap.has(config.id)) {
      // Custom skill - use minimal metadata
      const customMetadata: SkillMetadata = {
        id: config.id,
        name: config.id,
        version: '1.0.0',
        description: 'Custom skill',
        icon: 'puzzle',
        category: 'integration',
        enabled: config.enabled,
        capabilities: [],
        settings: [],
        requiredTools: [],
        agentAccess: config.agentAccess,
        tags: ['custom'],
      };
      const skillInfo = buildSkillInfo(customMetadata, config);
      skillMap.set(config.id, skillInfo);
    }
  }

  skillsCache = skillMap;
  cacheTimestamp = now;

  const allSkills = Array.from(skillMap.values());
  return includeDisabled ? allSkills : allSkills.filter(s => s.enabled);
}

/**
 * Get a specific skill by ID
 */
export async function getSkillInfo(id: string): Promise<SkillInfo | null> {
  const skills = await discoverSkills(true);
  return skills.find(s => s.id === id) || null;
}

/**
 * Get skills that an agent can use
 */
export async function getSkillsForAgent(agentName: string): Promise<SkillInfo[]> {
  const skills = await discoverSkills();

  return skills.filter(skill =>
    skill.agentAccess.length === 0 ||
    skill.agentAccess.includes(agentName)
  );
}

/**
 * Get skills by category
 */
export async function getSkillsByCategory(category: string): Promise<SkillInfo[]> {
  const skills = await discoverSkills();
  return skills.filter(s => s.category === category);
}

/**
 * Update skill configuration
 */
export async function updateSkillConfig(
  id: string,
  data: {
    enabled?: boolean;
    settings?: Record<string, unknown>;
    agentAccess?: string[];
  }
): Promise<SkillInfo> {
  // Update in database
  const config = await upsertSkillConfig(id, data);

  // Get default metadata
  const metadata = getSkillMetadata(id) || {
    id,
    name: id,
    version: '1.0.0',
    description: 'Custom skill',
    icon: 'puzzle',
    category: 'integration',
    enabled: true,
    capabilities: [],
    settings: [],
    requiredTools: [],
    agentAccess: [],
    tags: ['custom'],
  };

  // Build updated skill info
  const skillInfo = buildSkillInfo(metadata, config);

  // Update cache
  if (skillsCache) {
    skillsCache.set(id, skillInfo);
  }

  return skillInfo;
}

/**
 * Enable or disable a skill
 */
export async function setSkillEnabled(id: string, enabled: boolean): Promise<void> {
  await upsertSkillConfig(id, { enabled });

  // Update cache
  if (skillsCache) {
    const cached = skillsCache.get(id);
    if (cached) {
      skillsCache.set(id, { ...cached, enabled });
    }
  }
}

/**
 * Delete a skill configuration
 */
export async function deleteSkillConfig(id: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM quorum_skills WHERE id = $1',
    [id]
  );

  // Remove from cache
  if (skillsCache) {
    skillsCache.delete(id);
  }

  return (result.rowCount ?? 0) > 0;
}

/**
 * Clear the skills cache (call after updates)
 */
export function clearSkillsCache(): void {
  skillsCache = null;
}

/**
 * Get skill roster as a formatted prompt section
 * This gets injected into agent system prompts
 */
export async function getSkillsRosterPrompt(): Promise<string> {
  const skills = await discoverSkills();
  const enabledSkills = skills.filter(s => s.enabled && s.isConfigured);

  if (enabledSkills.length === 0) {
    return '## Available Skills\n\nNo skills are currently configured.';
  }

  let prompt = '## Available Skills\n\n';
  prompt += 'The following integration skills are available for use:\n\n';

  // Group by category
  const byCategory = new Map<string, SkillInfo[]>();
  for (const skill of enabledSkills) {
    if (!byCategory.has(skill.category)) {
      byCategory.set(skill.category, []);
    }
    byCategory.get(skill.category)!.push(skill);
  }

  for (const [category, categorySkills] of byCategory.entries()) {
    prompt += `### ${category}\n\n`;
    for (const skill of categorySkills) {
      prompt += `**${skill.name}** (${skill.id})\n`;
      if (skill.description) {
        prompt += `- ${skill.description}\n`;
      }
      if (skill.capabilities.length > 0) {
        prompt += `Capabilities: ${skill.capabilities.join(', ')}\n`;
      }
      prompt += '\n';
    }
  }

  return prompt;
}

/**
 * Register a custom skill
 */
export async function registerSkill(skill: SkillMetadata): Promise<SkillInfo> {
  await ensureSkillsTable();

  // Store configuration in database
  await upsertSkillConfig(skill.id, {
    enabled: skill.enabled,
    settings: {},
    agentAccess: skill.agentAccess,
  });

  // Build skill info
  const skillInfo: SkillInfo = buildSkillInfo(skill, undefined);
  (skillInfo as any).createdAt = new Date();
  (skillInfo as any).updatedAt = new Date();

  // Update cache
  if (skillsCache) {
    skillsCache.set(skill.id, skillInfo);
  }

  return skillInfo;
}
