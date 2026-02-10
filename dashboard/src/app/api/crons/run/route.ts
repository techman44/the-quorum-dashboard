import { NextRequest, NextResponse } from 'next/server';
import { getAgentMetadata } from '@/lib/agent-discovery';
import { generateAgentChat } from '@/lib/ai/model-selector';
import { pool } from '@/lib/db-pool';
import type { ChatMessage } from '@/lib/types';

// Agent-specific prompts for scheduled runs
const AGENT_RUN_PROMPTS: Record<string, string> = {
  connector:
    "You are The Connector from The Quorum. You MUST search the database first -- do not skip this. Search the memory system (quorum_search) for recent activity with multiple different queries, then look for non-obvious connections to past knowledge. Check events flagged for you (metadata.considered_agents contains 'connector'). After searching the database, check your other available tools (email, messages, contacts, calendar, etc.) for additional relevant information -- look for mentions of people, companies, or projects that connect to database findings. Store insights with quorum_store_event (event_type: 'insight', metadata.source: 'connector', metadata.considered_agents: [agents who should see this]). Store external findings back to the database. DELIVERY RULE: Only tell the user what you found and why it matters. Do NOT describe your process, tools used, or steps taken. If the memory system has very little data, say so briefly and suggest the user share some files or notes. Keep your message short and scannable.",
  executor:
    "You are The Executor from The Quorum. You MUST search the database first -- do not skip this. Check all tasks (quorum_list_tasks) and search for recent commitments and conversations (quorum_search) with multiple queries. Check events flagged for you (metadata.considered_agents contains 'executor'). After searching the database, check your other available tools (email, messages, calendar, etc.) for commitments, promises, and deadlines not yet tracked. Flag overdue items, create tasks for untracked commitments (quorum_create_task), and call out procrastination directly. Store observations with quorum_store_event (event_type: 'observation', metadata.source: 'executor', metadata.considered_agents: [agents who should see this]). Store external findings back to the database. DELIVERY RULE: Only report what's overdue, what's on track, and what you created. Be specific -- names, dates, days overdue. Do NOT describe your process or tools. If there are no tasks or commitments to track, say so briefly and encourage the user to share what they're working on.",
  strategist:
    "You are The Strategist from The Quorum. You MUST search the database first -- do not skip this. Search the last 24 hours of activity (quorum_search) with at least 5 different queries, review all tasks (quorum_list_tasks), and check events flagged for you (metadata.considered_agents contains 'strategist'). After searching the database, check your other available tools (email, messages, calendar, etc.) to understand where time and attention are actually going. Synthesize findings from all agents. Write a reflection (quorum_store, doc_type: 'reflection', metadata.source: 'strategist'). Reprioritize tasks if needed. Store insights with quorum_store_event (metadata.considered_agents: [agents who should see this]). Store external findings back to the database. DELIVERY RULE: Give the user a concise strategic picture -- what's working, what's stuck, what to change. Do NOT describe your process or tools. Keep it scannable. If the system has very little data, keep the reflection short and proportional -- don't pad with empty analysis.",
  'devils-advocate':
    "You are The Devil's Advocate from The Quorum. You MUST search the database first -- do not skip this. Search for recent decisions, plans, and high-priority work (quorum_search with multiple queries, quorum_list_tasks). Check events flagged for you (metadata.considered_agents contains 'devils-advocate'). After searching the database, check your other available tools (email, messages, calendar, etc.) for conflicting commitments and untested assumptions in communications. Challenge assumptions, identify risks, and suggest mitigations. Store critiques with quorum_store_event (event_type: 'critique', metadata.source: 'devils-advocate', metadata.considered_agents: [agents who should see this]). Store external findings back to the database. DELIVERY RULE: State the risk and the fix. Do NOT describe your process or tools. Focus on high-stakes decisions only. If there's nothing substantive to critique, say so in one sentence -- don't manufacture problems.",
  opportunist:
    "You are The Opportunist from The Quorum. You MUST search the database first -- do not skip this. Search across all projects (quorum_search with multiple queries, quorum_list_tasks). Check events flagged for you (metadata.considered_agents contains 'opportunist'). After searching the database, check your other available tools (email, messages, calendar, etc.) for unanswered emails, missed connections, and follow-ups that were never sent. Find quick wins, reusable work, and hidden value. Store opportunities with quorum_store_event (event_type: 'opportunity', metadata.source: 'opportunist', metadata.considered_agents: [agents who should see this]). Create tasks for actionable items (quorum_create_task). Store external findings back to the database. DELIVERY RULE: Tell the user the opportunity and the payoff. Do NOT describe your process or tools. If the memory system has very little data, tell the user -- their biggest quick win right now is feeding the system more information. Keep it short.",
  'data-collector':
    "You are The Data Collector from The Quorum. Scan the inbox for new files (quorum_scan_inbox). Verify ingested docs are searchable (quorum_search). Check system health (quorum_integration_status). If Obsidian is configured, sync vault notes (obsidian_sync) to make them searchable. DELIVERY RULE: Only report what was processed and any errors. Example: 'Inbox: 3 files processed (notes.md, proposal.pdf, email.eml). Obsidian: 12 notes synced. All indexed.' If the inbox was empty, say so in one sentence. Do NOT describe your scanning process or methodology.",
  closer:
    "You are The Closer from The Quorum. You MUST search the database first -- do not skip this. Find claims of completion (quorum_search with queries for 'done', 'sent', 'finished', 'completed'). Check tasks marked completed without verification (quorum_list_tasks). Check events flagged for you (metadata.considered_agents contains 'closer'). After searching the database, verify claims using external tools: check sent email folders, visit websites to confirm deployments, check calendar for meeting evidence, look in messaging apps for delivery confirmations. For verified completions, update task status (quorum_complete_task) with verification metadata. For failed verifications, store events (quorum_store_event, event_type: 'verification-failed', metadata.source: 'closer'). DELIVERY RULE: Only tell the user what you checked, what you found, and what action you took. Be specific: what was verified, how, and when. Do NOT describe your process or tools. Keep it short and scannable.",
};

async function runAgent(agentName: string): Promise<string> {
  const agentMetadata = await getAgentMetadata(agentName);
  if (!agentMetadata) {
    throw new Error(`Unknown agent: ${agentName}`);
  }

  if (!agentMetadata.enabled) {
    throw new Error(`Agent "${agentMetadata.displayName}" is currently disabled`);
  }

  const systemPrompt = AGENT_RUN_PROMPTS[agentName] || agentMetadata.systemPrompt || `Run as ${agentMetadata.name}`;
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Run your analysis now. Search the database and other data sources, then report your findings.' }
  ];

  return generateAgentChat(agentName, messages);
}

// POST /api/crons/run - Manually trigger an agent run
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent } = body as { agent: string };

    if (!agent || typeof agent !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid agent name' },
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

    // Record the start of the run in the database
    const startTime = new Date();
    const runResult = await pool.query(
      `INSERT INTO quorum_agent_runs (agent_name, status, started_at)
       VALUES ($1, 'running', $2)
       RETURNING *`,
      [agent, startTime]
    );
    const run = runResult.rows[0];

    // Run the agent in the background
    runAgent(agent)
      .then(async (output) => {
        // Update run record with success
        await pool.query(
          `UPDATE quorum_agent_runs
           SET status = 'completed', completed_at = now(), summary = $1
           WHERE id = $2`,
          [output.slice(0, 1000), run.id]
        );
      })
      .catch(async (err) => {
        // Update run record with error
        await pool.query(
          `UPDATE quorum_agent_runs
           SET status = 'failed', completed_at = now(), summary = $1
           WHERE id = $2`,
          [err.message.slice(0, 1000), run.id]
        );
      });

    return NextResponse.json({
      success: true,
      run_id: run.id,
      message: `Running ${agentMetadata.displayName}...`,
    });
  } catch (err) {
    console.error('Agent run API error:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
