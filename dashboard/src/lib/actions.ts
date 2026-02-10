'use server';

import { revalidatePath } from 'next/cache';
import {
  createTask,
  updateTask,
  deleteTask as dbDeleteTask,
  deleteDocument as dbDeleteDocument,
  updateAgentConfig as dbUpdateAgentConfig,
  generateAndStoreEmbedding,
} from './db';
import { pool } from './db-pool';
import type { QuorumDocument } from './types';

export async function updateTaskStatus(taskId: string, newStatus: string) {
  await updateTask(taskId, { status: newStatus });
  revalidatePath('/');
  revalidatePath('/tasks');
}

export async function createNewTask(formData: FormData) {
  const title = formData.get('title') as string;
  const description = (formData.get('description') as string) ?? '';
  const priority = (formData.get('priority') as string) ?? 'medium';
  const owner = (formData.get('owner') as string) || undefined;
  const due_at = (formData.get('due_at') as string) || undefined;

  await createTask({ title, description, priority, owner, due_at });
  revalidatePath('/');
  revalidatePath('/tasks');
}

export async function updateTaskDetails(
  taskId: string,
  updates: {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    owner?: string | null;
    due_at?: string | null;
  }
) {
  await updateTask(taskId, updates);
  revalidatePath('/');
  revalidatePath('/tasks');
}

export async function deleteTask(taskId: string) {
  await dbDeleteTask(taskId);
  revalidatePath('/');
  revalidatePath('/tasks');
}

export async function updateAgentConfigAction(
  agentName: string,
  updates: {
    display_name?: string;
    avatar_url?: string | null;
    cron_schedule?: string;
    prompt?: string;
    enabled?: boolean;
    settings?: Record<string, unknown>;
  }
) {
  await dbUpdateAgentConfig(agentName, updates);
  revalidatePath('/');
  revalidatePath('/agents');
}

export async function toggleAgentEnabled(agentName: string, enabled: boolean) {
  // Update database config
  await dbUpdateAgentConfig(agentName, { enabled });

  // Also update agent discovery system via API
  try {
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/agents/${encodeURIComponent(agentName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  } catch (err) {
    console.error('Failed to update agent discovery enabled state:', err);
  }

  revalidatePath('/');
  revalidatePath('/agents');
  revalidatePath('/settings');
}

export async function deleteDocumentAction(docId: string) {
  await dbDeleteDocument(docId);
  revalidatePath('/');
  revalidatePath('/documents');
}

export async function triggerEmbedding(docId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const docResult = await pool.query<QuorumDocument>(
      'SELECT * FROM quorum_documents WHERE id = $1',
      [docId]
    );

    if (docResult.rows.length === 0) {
      return { success: false, error: 'Document not found' };
    }

    const doc = docResult.rows[0];
    const success = await generateAndStoreEmbedding(doc.id, doc.content);

    if (!success) {
      return { success: false, error: 'Embedding generation failed' };
    }

    revalidatePath('/');
    revalidatePath('/documents');
    return { success: true };
  } catch (err) {
    console.error('triggerEmbedding error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}
