// Session management for AI conversations
import { pool } from '../db-pool';
import type { ChatMessage } from './providers/base';

export interface Session {
  id: string;
  sessionId: string;
  agentName: string | null;
  messages: ChatMessage[];
  totalTokens: number;
  createdAt: Date;
  updatedAt: Date;
}

const MAX_TOKENS = 100000; // Context window limit
const TOKEN_SAFETY_MARGIN = 10000; // Reserve tokens for response

/**
 * Estimate token count for a message (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get or create a session
 */
export async function getSession(sessionId: string, agentName?: string): Promise<Session> {
  const result = await pool.query(
    `SELECT * FROM quorum_sessions WHERE session_id = $1`,
    [sessionId]
  );

  if (result.rows.length === 0) {
    // Create new session
    const createResult = await pool.query(
      `INSERT INTO quorum_sessions (session_id, agent_name, messages, total_tokens)
       VALUES ($1, $2, $3, 0)
       RETURNING *`,
      [sessionId, agentName || null, JSON.stringify([])]
    );
    return mapRowToSession(createResult.rows[0]);
  }

  return mapRowToSession(result.rows[0]);
}

/**
 * Add a message to a session
 */
export async function addMessageToSession(
  sessionId: string,
  message: ChatMessage
): Promise<void> {
  const session = await getSession(sessionId);

  const messages = [...session.messages, message];
  const messageTokens = estimateTokens(message.content);
  const newTotal = session.totalTokens + messageTokens;

  await pool.query(
    `UPDATE quorum_sessions
     SET messages = $1, total_tokens = $2, updated_at = now()
     WHERE session_id = $3`,
    [JSON.stringify(messages), newTotal, sessionId]
  );
}

/**
 * Get messages for a session, pruned if approaching token limit
 */
export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const session = await getSession(sessionId);

  // If approaching token limit, prune old messages
  if (session.totalTokens > MAX_TOKENS - TOKEN_SAFETY_MARGIN) {
    await pruneSession(sessionId);
    const pruned = await getSession(sessionId);
    return pruned.messages;
  }

  return session.messages;
}

/**
 * Prune old messages from a session to stay within token limits
 * Keeps system messages and recent messages
 */
export async function pruneSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);

  // Keep system messages and prune from the middle
  const systemMessages = session.messages.filter(m => m.role === 'system');
  const conversationMessages = session.messages.filter(m => m.role !== 'system');

  // Keep last N messages to stay within limit
  let tokens = 0;
  const toKeep: ChatMessage[] = [];
  for (const msg of [...conversationMessages].reverse()) {
    const msgTokens = estimateTokens(msg.content);
    if (tokens + msgTokens > MAX_TOKENS - TOKEN_SAFETY_MARGIN) {
      break;
    }
    toKeep.unshift(msg);
    tokens += msgTokens;
  }

  const prunedMessages = [...systemMessages, ...toKeep];

  await pool.query(
    `UPDATE quorum_sessions
     SET messages = $1, total_tokens = $2, updated_at = now()
     WHERE session_id = $3`,
    [JSON.stringify(prunedMessages), tokens, sessionId]
  );
}

/**
 * Clear a session
 */
export async function clearSession(sessionId: string): Promise<void> {
  await pool.query(
    `UPDATE quorum_sessions
     SET messages = $1, total_tokens = 0, updated_at = now()
     WHERE session_id = $1`,
    [JSON.stringify([]), sessionId]
  );
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await pool.query(
    `DELETE FROM quorum_sessions WHERE session_id = $1`,
    [sessionId]
  );
}

/**
 * List all sessions
 */
export async function listSessions(agentName?: string): Promise<Session[]> {
  let query = 'SELECT * FROM quorum_sessions';
  const params: unknown[] = [];

  if (agentName) {
    query += ' WHERE agent_name = $1';
    params.push(agentName);
  }

  query += ' ORDER BY updated_at DESC';

  const result = await pool.query(query, params);
  return result.rows.map(mapRowToSession);
}

function mapRowToSession(row: Record<string, unknown>): Session {
  // Messages are stored as JSONB in the database, need to parse them
  const messagesJson = row.messages as string | null | unknown[] | Record<string, unknown>[];
  let messages: ChatMessage[] = [];

  if (messagesJson) {
    if (typeof messagesJson === 'string') {
      try {
        messages = JSON.parse(messagesJson) as ChatMessage[];
      } catch {
        messages = [];
      }
    } else if (Array.isArray(messagesJson)) {
      // Check if it's already an array of ChatMessage objects
      if (messagesJson.length > 0 && typeof messagesJson[0] === 'object' && messagesJson[0] !== null && 'role' in messagesJson[0]) {
        messages = messagesJson as ChatMessage[];
      } else {
        messages = [];
      }
    }
  }

  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    agentName: row.agent_name as string | null,
    messages,
    totalTokens: (row.total_tokens as number) || 0,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}
