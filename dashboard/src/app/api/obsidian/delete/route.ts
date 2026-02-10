import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// DELETE /api/obsidian/delete - Delete a note
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const note = searchParams.get('note');
    const vault = searchParams.get('vault');

    if (!note) {
      return NextResponse.json(
        { error: 'Missing required parameter: note' },
        { status: 400 }
      );
    }

    // Build command
    let cmd = `obsidian-cli delete "${note.replace(/"/g, '\\"')}"`;
    if (vault) {
      cmd = `obsidian-cli --vault "${vault}" delete "${note.replace(/"/g, '\\"')}"`;
    }

    const { stdout, stderr } = await execAsync(cmd);

    return NextResponse.json({
      success: true,
      note,
      message: 'Note deleted successfully',
    });
  } catch (error) {
    console.error('Obsidian delete API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete note',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
