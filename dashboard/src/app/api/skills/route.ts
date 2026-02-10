import { NextRequest, NextResponse } from 'next/server';
import { discoverSkills, updateSkillConfig, deleteSkillConfig } from '@/lib/skills-discovery';
import { getSkillMetadata, validateSkillSetting } from '@/lib/skills-schema';

/**
 * GET /api/skills - List all skills
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeDisabled = searchParams.get('includeDisabled') === 'true';
    const category = searchParams.get('category');

    let skills = await discoverSkills(includeDisabled);

    // Filter by category if specified
    if (category) {
      skills = skills.filter(s => s.category === category);
    }

    // Return safe version (no sensitive data)
    const safeSkills = skills.map(skill => ({
      id: skill.id,
      name: skill.name,
      version: skill.version,
      description: skill.description,
      icon: skill.icon,
      category: skill.category,
      enabled: skill.enabled,
      capabilities: skill.capabilities,
      settingDefinitions: skill.settingDefinitions.map(s => ({
        key: s.key,
        label: s.label,
        type: s.type,
        description: s.description,
        required: s.required,
        defaultValue: s.defaultValue,
        placeholder: s.placeholder,
        options: s.options,
      })),
      requiredTools: skill.requiredTools,
      agentAccess: skill.agentAccess,
      isConfigured: skill.isConfigured,
      hasErrors: skill.hasErrors,
      tags: skill.tags,
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
    }));

    return NextResponse.json({ skills: safeSkills });
  } catch (error) {
    console.error('Failed to list skills:', error);
    return NextResponse.json(
      {
        error: 'Failed to list skills',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skills - Register/update a skill
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, enabled, settings, agentAccess } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Skill ID is required' },
        { status: 400 }
      );
    }

    // Validate skill exists in metadata
    const metadata = getSkillMetadata(id);
    if (!metadata) {
      return NextResponse.json(
        { error: 'Unknown skill ID' },
        { status: 404 }
      );
    }

    // Validate settings if provided
    if (settings) {
      for (const [key, value] of Object.entries(settings)) {
        const settingDef = metadata.settings.find(s => s.key === key);
        if (settingDef) {
          const validation = validateSkillSetting(settingDef, value);
          if (!validation.valid) {
            return NextResponse.json(
              { error: validation.error },
              { status: 400 }
            );
          }
        }
      }
    }

    // Update skill configuration
    const skill = await updateSkillConfig(id, {
      enabled: enabled !== undefined ? enabled : undefined,
      settings,
      agentAccess,
    });

    return NextResponse.json({
      success: true,
      skill: {
        id: skill.id,
        name: skill.name,
        enabled: skill.enabled,
        isConfigured: skill.isConfigured,
      },
    });
  } catch (error) {
    console.error('Failed to update skill:', error);
    return NextResponse.json(
      {
        error: 'Failed to update skill',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/skills - Remove/disable a skill
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Skill ID is required' },
        { status: 400 }
      );
    }

    const success = await deleteSkillConfig(id);

    if (!success) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete skill:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete skill',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
