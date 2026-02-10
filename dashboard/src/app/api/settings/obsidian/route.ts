import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

interface ObsidianSettings {
  enabled: boolean;
  vaultPath: string;
  syncSchedule: string;
  autoSync: boolean;
  syncOnStart: boolean;
}

const DEFAULT_SETTINGS: ObsidianSettings = {
  enabled: false,
  vaultPath: '',
  syncSchedule: '0 */6 * * *',
  autoSync: true,
  syncOnStart: true,
};

async function ensureSettingsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quorum_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (error) {
    console.error('Failed to create settings table:', error);
  }
}

// GET /api/settings/obsidian - Get Obsidian settings
export async function GET(request: NextRequest) {
  try {
    await ensureSettingsTable();

    const result = await pool.query(
      `SELECT value FROM quorum_settings WHERE key = 'obsidian'`
    );

    if (result.rows.length > 0) {
      return NextResponse.json(result.rows[0].value as ObsidianSettings);
    }

    return NextResponse.json(DEFAULT_SETTINGS);
  } catch (error) {
    console.error('Failed to get Obsidian settings:', error);
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

// POST /api/settings/obsidian - Save Obsidian settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Partial<ObsidianSettings>;

    const settings: ObsidianSettings = {
      enabled: body.enabled ?? DEFAULT_SETTINGS.enabled,
      vaultPath: body.vaultPath ?? DEFAULT_SETTINGS.vaultPath,
      syncSchedule: body.syncSchedule ?? DEFAULT_SETTINGS.syncSchedule,
      autoSync: body.autoSync ?? DEFAULT_SETTINGS.autoSync,
      syncOnStart: body.syncOnStart ?? DEFAULT_SETTINGS.syncOnStart,
    };

    await ensureSettingsTable();

    await pool.query(
      `INSERT INTO quorum_settings (key, value, updated_at)
       VALUES ('obsidian', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_at = NOW()`,
      [JSON.stringify(settings)]
    );

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error('Failed to save Obsidian settings:', error);
    return NextResponse.json(
      {
        error: 'Failed to save settings',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
