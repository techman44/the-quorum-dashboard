import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { pool } from '@/lib/db-pool';

const execAsync = promisify(exec);

interface ObsidianNote {
  path: string;
  title: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  tags?: string[];
  created?: Date;
  modified?: Date;
}

interface SyncResult {
  added: number;
  updated: number;
  skipped: number;
  errors: number;
  notes: string[];
}

// Parse YAML frontmatter from markdown content
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; content: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, content };
  }

  const frontmatter: Record<string, unknown> = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value: string | string[] = line.slice(colonIndex + 1).trim();

      // Parse YAML values (basic implementation)
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith('[') && value.endsWith(']')) {
        value = value
          .slice(1, -1)
          .split(',')
          .map((v) => v.trim().replace(/^"|"$/g, ''))
          .filter(Boolean);
      } else if (value === 'true') {
        value = true as unknown as string;
      } else if (value === 'false') {
        value = false as unknown as string;
      } else if (!isNaN(Number(value))) {
        value = Number(value) as unknown as string;
      }

      frontmatter[key] = value;
    }
  }

  return { frontmatter, content: match[2] };
}

// Extract tags from frontmatter and content
function extractTags(frontmatter: Record<string, unknown>, content: string): string[] {
  const tags: string[] = [];

  // Tags from frontmatter
  const frontmatterTags = frontmatter.tags;
  if (Array.isArray(frontmatterTags)) {
    tags.push(...frontmatterTags.map(String));
  } else if (typeof frontmatterTags === 'string') {
    tags.push(...frontmatterTags.split(',').map((t) => t.trim()));
  }

  // Tags from content (#hashtag format)
  const tagRegex = /#([\w-]+)/g;
  const contentTags = content.match(tagRegex);
  if (contentTags) {
    tags.push(...contentTags.map((t) => t.slice(1)));
  }

  return [...new Set(tags)];
}

// Walk directory recursively to find markdown files
async function findMarkdownFiles(dir: string, baseDir = dir): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip hidden directories and .obsidian
        if (!entry.name.startsWith('.') && entry.name !== '.obsidian') {
          files.push(...(await findMarkdownFiles(fullPath, baseDir)));
        }
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.warn(`Could not read directory ${dir}:`, error);
  }

  return files;
}

// Read and parse an Obsidian note
async function readNote(filePath: string): Promise<ObsidianNote | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const { frontmatter, content: bodyContent } = parseFrontmatter(content);
    const tags = extractTags(frontmatter, bodyContent);

    // Get relative path from vault root for title
    const title = filePath.split('/').pop()?.replace('.md', '') || 'Untitled';

    return {
      path: filePath,
      title,
      content: bodyContent,
      frontmatter,
      tags,
    };
  } catch (error) {
    console.warn(`Could not read note ${filePath}:`, error);
    return null;
  }
}

// Store note in Quorum database
async function storeNote(note: ObsidianNote, vaultPath: string): Promise<boolean> {
  try {
    const relativePath = note.path.replace(vaultPath + '/', '');
    const docId = `obsidian:${relativePath.replace(/\.md$/, '')}`;

    // Check if document exists
    const existingResult = await pool.query(
      'SELECT id FROM quorum_documents WHERE id = $1',
      [docId]
    );

    const metadata = {
      source: 'obsidian',
      vault_path: vaultPath,
      relative_path: relativePath,
      frontmatter: note.frontmatter,
      tags: note.tags,
      file_path: note.path,
    };

    if (existingResult.rows.length > 0) {
      // Update existing document
      await pool.query(
        `UPDATE quorum_documents
         SET title = $1, content = $2, metadata = $3, tags = $4, updated_at = NOW()
         WHERE id = $5`,
        [note.title, note.content, JSON.stringify(metadata), note.tags || [], docId]
      );
      return true; // Updated
    } else {
      // Insert new document
      await pool.query(
        `INSERT INTO quorum_documents (id, doc_type, title, content, metadata, tags, created_at, updated_at)
         VALUES ($1, 'obsidian_note', $2, $3, $4, $5, NOW(), NOW())`,
        [docId, note.title, note.content, JSON.stringify(metadata), note.tags || []]
      );
      return false; // Added
    }
  } catch (error) {
    console.error(`Failed to store note ${note.path}:`, error);
    throw error;
  }
}

// POST /api/obsidian/sync - Sync vault notes to Quorum documents
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vault, limit = 100 } = body;

    // Get vault path
    let vaultPath = vault;
    if (!vaultPath) {
      try {
        const { stdout } = await execAsync('obsidian-cli print-default --path-only');
        vaultPath = stdout.trim();
      } catch {
        return NextResponse.json(
          { error: 'No vault specified and no default vault found' },
          { status: 400 }
        );
      }
    }

    // Expand ~ in path
    vaultPath = vaultPath.replace('~', process.env.HOME || '');

    // Find all markdown files in vault
    const markdownFiles = await findMarkdownFiles(vaultPath);

    const result: SyncResult = {
      added: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      notes: [],
    };

    // Process notes with limit
    const filesToProcess = markdownFiles.slice(0, limit);

    for (const filePath of filesToProcess) {
      try {
        const note = await readNote(filePath);
        if (note) {
          const isUpdate = await storeNote(note, vaultPath);
          if (isUpdate) {
            result.updated++;
          } else {
            result.added++;
          }
          result.notes.push(note.title);
        } else {
          result.skipped++;
        }
      } catch (error) {
        result.errors++;
        console.error(`Failed to sync note ${filePath}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      vault: vaultPath,
      totalNotes: markdownFiles.length,
      processed: filesToProcess.length,
      result,
    });
  } catch (error) {
    console.error('Obsidian sync API error:', error);
    return NextResponse.json(
      {
        error: 'Sync failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET /api/obsidian/sync - Get sync status
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const vault = searchParams.get('vault');

    // Get vault path
    let vaultPath = vault;
    if (!vaultPath) {
      try {
        const { stdout } = await execAsync('obsidian-cli print-default --path-only');
        vaultPath = stdout.trim();
      } catch {
        vaultPath = '';
      }
    }

    if (vaultPath) {
      vaultPath = vaultPath.replace('~', process.env.HOME || '');
    }

    // Count synced notes in database
    const dbResult = await pool.query(
      `SELECT COUNT(*) as count FROM quorum_documents WHERE doc_type = 'obsidian_note'`
    );
    const syncedCount = parseInt(dbResult.rows[0].count, 10);

    // Count markdown files in vault
    let vaultNoteCount = 0;
    if (vaultPath) {
      try {
        const markdownFiles = await findMarkdownFiles(vaultPath);
        vaultNoteCount = markdownFiles.length;
      } catch (error) {
        console.warn('Could not count vault notes:', error);
      }
    }

    return NextResponse.json({
      vault: vaultPath,
      syncedNotes: syncedCount,
      vaultNotes: vaultNoteCount,
      needsSync: vaultNoteCount > syncedCount,
    });
  } catch (error) {
    console.error('Obsidian sync status API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get sync status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
