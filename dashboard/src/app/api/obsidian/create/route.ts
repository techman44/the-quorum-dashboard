import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// POST /api/obsidian/create - Create a new note
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, content, vault, open = false } = body;

    if (!title) {
      return NextResponse.json(
        { error: 'Missing required field: title' },
        { status: 400 }
      );
    }

    // Build command
    let cmd = `obsidian-cli create "${title.replace(/"/g, '\\"')}"`;
    if (content) {
      cmd += ` --content "${content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    }
    if (vault) {
      cmd = `obsidian-cli --vault "${vault}" create "${title.replace(/"/g, '\\"')}"`;
      if (content) {
        cmd += ` --content "${content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
      }
    }
    if (open) {
      cmd += ' --open';
    }

    const { stdout, stderr } = await execAsync(cmd);

    return NextResponse.json({
      success: true,
      title,
      message: 'Note created successfully',
      output: stdout.trim(),
    });
  } catch (error) {
    console.error('Obsidian create API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create note',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
