import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// POST /api/obsidian/move - Move or rename a note (updates wikilinks)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { from, to, vault } = body;

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Missing required fields: from, to' },
        { status: 400 }
      );
    }

    // Build command
    let cmd = `obsidian-cli move "${from.replace(/"/g, '\\"')}" "${to.replace(/"/g, '\\"')}"`;
    if (vault) {
      cmd = `obsidian-cli --vault "${vault}" move "${from.replace(/"/g, '\\"')}" "${to.replace(/"/g, '\\"')}"`;
    }

    const { stdout, stderr } = await execAsync(cmd);

    return NextResponse.json({
      success: true,
      from,
      to,
      message: 'Note moved successfully',
      output: stdout.trim(),
    });
  } catch (error) {
    console.error('Obsidian move API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to move note',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
