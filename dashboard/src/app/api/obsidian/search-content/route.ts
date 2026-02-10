import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ContentMatch {
  note: string;
  line: string;
  lineNumber?: number;
  context?: string;
}

// GET /api/obsidian/search-content - Search within note contents
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const vault = searchParams.get('vault');
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  if (!query) {
    return NextResponse.json(
      { error: 'Missing search query parameter' },
      { status: 400 }
    );
  }

  try {

    // Build command with optional vault
    let cmd = `obsidian-cli search-content "${query.replace(/"/g, '\\"')}"`;
    if (vault) {
      cmd = `obsidian-cli --vault "${vault}" search-content "${query.replace(/"/g, '\\"')}"`;
    }

    const { stdout, stderr } = await execAsync(cmd);

    // Parse output - format is typically:
    // note_name
    // matched line content
    // ...
    const lines = stdout.trim().split('\n');
    const matches: ContentMatch[] = [];
    let currentNote: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check if this is a note name (typically doesn't start with spaces)
      // or a content line (typically indented or has the match)
      if (!trimmed.startsWith(' ') && !trimmed.startsWith('\t') && !line.includes(':')) {
        // This looks like a note name
        if (currentNote && matches.length < limit) {
          // Previous note entry
        }
        currentNote = trimmed;
      } else if (currentNote && matches.length < limit) {
        // This is content under a note
        matches.push({
          note: currentNote,
          line: trimmed,
          context: trimmed.replace(new RegExp(query, 'gi'), (match: string) => `<<${match}>>`),
        });
      }
    }

    return NextResponse.json({
      query,
      matches: matches.slice(0, limit),
      count: matches.length,
    });
  } catch (error) {
    console.error('Obsidian search-content API error:', error);

    // obsidian-cli returns non-zero when no results found
    if (error instanceof Error && 'stdout' in error) {
      const stdout = (error as { stdout: string }).stdout || '';
      if (stdout.trim()) {
        return NextResponse.json({
          query,
          matches: [],
          count: 0,
        });
      }
    }

    return NextResponse.json(
      {
        error: 'Content search failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        matches: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}
