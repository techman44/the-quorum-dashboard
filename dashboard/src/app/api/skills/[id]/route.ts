import { NextRequest, NextResponse } from 'next/server';
import { getSkillInfo, setSkillEnabled, updateSkillConfig } from '@/lib/skills-discovery';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/skills/[id] - Get a specific skill
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const skill = await getSkillInfo(id);

    if (!skill) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 }
      );
    }

    // Return safe version (exclude sensitive setting values)
    const safeSkill = {
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
    };

    return NextResponse.json(safeSkill);
  } catch (error) {
    console.error('Failed to get skill:', error);
    return NextResponse.json(
      {
        error: 'Failed to get skill',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/skills/[id] - Update a skill
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { enabled, settings, agentAccess } = body;

    // If only enabling/disabling, use the simpler function
    if (enabled !== undefined && settings === undefined && agentAccess === undefined) {
      await setSkillEnabled(id, enabled);
      const skill = await getSkillInfo(id);

      return NextResponse.json({
        success: true,
        skill: {
          id: skill?.id,
          name: skill?.name,
          enabled: skill?.enabled,
        },
      });
    }

    // Full update
    const skill = await updateSkillConfig(id, {
      enabled,
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
 * DELETE /api/skills/[id] - Remove a skill
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { deleteSkillConfig } = await import('@/lib/skills-discovery');

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
