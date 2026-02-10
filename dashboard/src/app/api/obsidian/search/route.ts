import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// GET /api/obsidian/search - Search notes by name
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const vault = searchParams.get('vault');

  if (!query) {
    return NextResponse.json(
      { error: 'Missing search query parameter' },
      { status: 400 }
    );
  }

  try {

    // Build command with optional vault
    let cmd = `obsidian-cli search "${query.replace(/"/g, '\\"')}"`;
    if (vault) {
      cmd = `obsidian-cli --vault "${vault}" search "${query.replace(/"/g, '\\"')}"`;
    }

    const { stdout, stderr } = await execAsync(cmd);

    // Parse output - obsidian-cli returns note names/paths
    const results = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.trim())
      .filter((line) => !line.startsWith('[') && line.length > 0);

    return NextResponse.json({
      query,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Obsidian search API error:', error);

    // obsidian-cli returns non-zero when no results found
    if (error instanceof Error && 'stdout' in error) {
      const stdout = (error as { stdout: string }).stdout || '';
      const results = stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => line.trim())
        .filter((line) => !line.startsWith('[') && line.length > 0);

      if (results.length > 0) {
        return NextResponse.json({
          query,
          results,
          count: results.length,
        });
      }
    }

    return NextResponse.json(
      {
        error: 'Search failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        results: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}
