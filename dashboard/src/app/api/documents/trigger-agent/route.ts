import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getAgentMetadata } from '@/lib/agent-discovery';
import { generateAgentChat } from '@/lib/ai/model-selector';
import type { QuorumDocument, QuorumEvent, ChatMessage } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { document_id, agent } = body as { document_id: string; agent: string };

    if (!document_id || typeof document_id !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid document_id' },
        { status: 400 }
      );
    }

    if (!agent || typeof agent !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid agent' },
        { status: 400 }
      );
    }

    // Get agent metadata from dynamic agent discovery system
    const agentMetadata = await getAgentMetadata(agent);
    if (!agentMetadata) {
      return NextResponse.json(
        { error: `Unknown agent: ${agent}` },
        { status: 404 }
      );
    }

    // Check if agent is enabled
    if (!agentMetadata.enabled) {
      return NextResponse.json(
        { error: `Agent "${agentMetadata.displayName}" is currently disabled` },
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

    const prompt = `Review this document and provide your analysis as ${agentMetadata.displayName}: Title: ${doc.title}\n\nContent: ${doc.content}`;
    const messages: ChatMessage[] = [
      { role: 'system', content: agentMetadata.systemPrompt || `You are ${agentMetadata.displayName}. Analyze the given document and provide your insights.` },
      { role: 'user', content: prompt }
    ];

    const analysis = await generateAgentChat(agent, messages);

    const eventResult = await pool.query<QuorumEvent>(
      `INSERT INTO quorum_events (event_type, title, description, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        'agent_analysis',
        `${agentMetadata.displayName} analysis of "${doc.title}"`,
        analysis,
        JSON.stringify({ source: agent, document_id: doc.id }),
      ]
    );

    return NextResponse.json({
      success: true,
      event_id: eventResult.rows[0].id,
      analysis,
    });
  } catch (err) {
    console.error('Trigger agent API error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
