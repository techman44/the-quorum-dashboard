import { NextResponse } from 'next/server';
import { pool } from '@/lib/db-pool';
import { generateAndStoreEmbedding } from '@/lib/db';
import type { QuorumDocument } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { document_id } = body as { document_id: string };

    if (!document_id || typeof document_id !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid document_id' },
        { status: 400 }
      );
    }

    const docResult = await pool.query<QuorumDocument>(
      'SELECT * FROM quorum_documents WHERE id = $1',
      [document_id]
    );

    if (docResult.rows.length === 0) {
      return NextResponse.json(
        { error: `Document not found: ${document_id}` },
        { status: 404 }
      );
    }

    const doc = docResult.rows[0];
    const success = await generateAndStoreEmbedding(doc.id, doc.content);

    if (!success) {
      return NextResponse.json(
        { error: 'Embedding generation failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, document_id: doc.id });
  } catch (err) {
    console.error('Embed API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
