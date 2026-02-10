import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ObsidianVault {
  name: string;
  path: string;
  isDefault: boolean;
}

// GET /api/obsidian/vaults - List available Obsidian vaults
export async function GET(request: NextRequest) {
  try {
    // Check if obsidian-cli is available
    try {
      await execAsync('which obsidian-cli');
    } catch {
      return NextResponse.json(
        { error: 'obsidian-cli is not installed', vaults: [] },
        { status: 400 }
      );
    }

    // Get default vault
    let defaultVault: { name: string; path: string } | null = null;
    try {
      const { stdout } = await execAsync('obsidian-cli print-default --path-only');
      const path = stdout.trim();
      if (path) {
        const name = path.split('/').pop() || 'Unknown';
        defaultVault = { name, path };
      }
    } catch (error) {
      console.warn('Could not get default vault:', error);
    }

    // Try to read Obsidian config for all vaults
    const vaults: ObsidianVault[] = [];

    if (defaultVault) {
      vaults.push({
        name: defaultVault.name,
        path: defaultVault.path,
        isDefault: true,
      });
    }

    // On macOS, Obsidian stores config in a different location
    // Try to find additional vaults from common locations
    const commonPaths = [
      '~/Library/Mobile Documents/iCloud~md~obsidian/Documents',
      '~/Documents/Obsidian',
      '~/Documents',
      '~/SynologyDrive/Obsidian',
    ];

    for (const basePath of commonPaths) {
      try {
        const expandedPath = basePath.replace('~', process.env.HOME || '');
        const { stdout } = await execAsync(`ls -d "${expandedPath}"/* 2>/dev/null || true`);
        const paths = stdout.trim().split('\n').filter(Boolean);

        for (const vaultPath of paths) {
          const name = vaultPath.split('/').pop();
          if (name && !vaults.some((v) => v.path === vaultPath)) {
            // Check if it looks like an Obsidian vault (has .obsidian folder)
            try {
              await execAsync(`test -d "${vaultPath}/.obsidian"`);
              vaults.push({
                name,
                path: vaultPath,
                isDefault: false,
              });
            } catch {
              // Not an Obsidian vault, skip
            }
          }
        }
      } catch {
        // Path doesn't exist or not accessible
      }
    }

    return NextResponse.json({
      vaults,
      obsidianCliInstalled: true,
    });
  } catch (error) {
    console.error('Obsidian vaults API error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        vaults: [],
        obsidianCliInstalled: false,
      },
      { status: 500 }
    );
  }
}
