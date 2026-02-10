import Link from 'next/link';
import { getStats, listAgentConfigs, pool, listAIProviders, listAgentModelAssignments, type AIProvider } from '@/lib/db';
import { discoverAgents } from '@/lib/agent-discovery';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AgentToggle } from '@/components/agent-toggle';
import { ProviderManagement } from '@/components/settings/provider-management';
import { AgentModelAssignment } from '@/components/settings/agent-model-assignment';
import { EmbeddingProvider } from '@/components/settings/embedding-provider';
import { ObsidianSettings } from '@/components/settings/obsidian-settings';
import { SkillsManagement } from '@/components/settings/skills-management';
import type { AgentModelAssignment as AgentModelAssignmentType } from '@/lib/types';
import { discoverSkills } from '@/lib/skills-discovery';
import type { AgentMetadata } from '@/lib/agent-schema';

// Server-side helper to convert AgentMetadata to legacy format
function toLegacyAgent(agent: AgentMetadata) {
  return {
    name: agent.name,
    displayName: agent.displayName,
    color: agent.color,
    schedule: agent.schedule || '',
    description: agent.description,
    icon: agent.icon,
  };
}

export const dynamic = 'force-dynamic';

// Safe provider type for UI (no sensitive data exposed)
interface SafeProvider {
  id: string;
  providerType: 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom';
  name: string;
  isEnabled: boolean;
  baseUrl?: string;
  hasApiKey: boolean;
  hasOAuth?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

async function checkDbConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function checkOllamaConnection(): Promise<boolean> {
  const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  try {
    const res = await fetch(`${host}/api/tags`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function getSafeProviders(): Promise<SafeProvider[]> {
  try {
    const providers = await listAIProviders();
    // Return providers without exposing decrypted API keys
    // Note: database returns snake_case columns
    return providers.map((p: any): SafeProvider => ({
      id: p.id,
      providerType: (p.provider_type || p.providerType) as SafeProvider['providerType'],
      name: p.name,
      isEnabled: p.is_enabled !== undefined ? p.is_enabled : p.isEnabled,
      baseUrl: (p.base_url || p.baseUrl) ?? undefined,
      hasApiKey: !!(p.api_key_encrypted || p.apiKeyEncrypted) || !!(p.oauth_token || p.oauthToken),
      hasOAuth: !!(p.oauth_token || p.oauthToken),
      createdAt: p.created_at || p.createdAt,
      updatedAt: p.updated_at || p.updatedAt,
    }));
  } catch {
    return [];
  }
}

async function getAgentAssignments(): Promise<AgentModelAssignmentType[]> {
  try {
    return await listAgentModelAssignments();
  } catch {
    return [];
  }
}

export default async function SettingsPage() {
  const [stats, dbConnected, ollamaConnected, agentConfigs, providers, agentAssignments, agents, skills] =
    await Promise.all([
      getStats(),
      checkDbConnection(),
      checkOllamaConnection(),
      listAgentConfigs(),
      getSafeProviders(),
      getAgentAssignments(),
      discoverAgents(),
      discoverSkills(true),
    ]);

  const agentMap = new Map(agents.map((a) => [a.name, toLegacyAgent(a)]));

  const ollamaHost = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  const dbHost = process.env.QUORUM_DB_HOST ?? '192.168.20.150';
  const dbPort = process.env.QUORUM_DB_PORT ?? '5432';
  const dbName = process.env.QUORUM_DB_NAME ?? 'quorum';
  const dbUser = process.env.QUORUM_DB_USER ?? 'quorum';

  const unembeddedTotal =
    stats.unembedded_documents + stats.unembedded_events;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          System health, agent configuration, and database info
        </p>
      </div>

      {/* Section 1: System Health */}
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
          <CardDescription>Service status and data counts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Connection status */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Database</span>
              {dbConnected ? (
                <Badge className="bg-emerald-600 text-white">Connected</Badge>
              ) : (
                <Badge variant="destructive">Disconnected</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Ollama</span>
              {ollamaConnected ? (
                <Badge className="bg-emerald-600 text-white">Connected</Badge>
              ) : (
                <Badge variant="destructive">Disconnected</Badge>
              )}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Documents', value: stats.documents },
              { label: 'Events', value: stats.events },
              { label: 'Tasks', value: stats.tasks },
              { label: 'Embeddings', value: stats.embeddings },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border bg-muted/50 p-4 text-center"
              >
                <p className="text-2xl font-bold">{stat.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Unembedded warning */}
          {unembeddedTotal > 0 && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
              {stats.unembedded_documents > 0 && (
                <span>
                  {stats.unembedded_documents} document{stats.unembedded_documents !== 1 && 's'} awaiting embedding.{' '}
                </span>
              )}
              {stats.unembedded_events > 0 && (
                <span>
                  {stats.unembedded_events} event{stats.unembedded_events !== 1 && 's'} awaiting embedding.
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Agent Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Configuration</CardTitle>
          <CardDescription>Manage agent schedules and status</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentConfigs.map((config) => {
                const agent = agentMap.get(config.agent_name);
                const color = agent?.color ?? '#6B7280';
                return (
                  <TableRow key={config.agent_name}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-medium">
                          {config.display_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {config.cron_schedule || '--'}
                      </code>
                    </TableCell>
                    <TableCell>
                      <AgentToggle
                        agentName={config.agent_name}
                        enabled={config.enabled}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {config.updated_at
                        ? new Date(config.updated_at).toLocaleString()
                        : '--'}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/agents/${config.agent_name}`}
                        className="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        Edit
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
              {agentConfigs.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    No agent configurations found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 3: AI Provider Management */}
      <ProviderManagement initialProviders={providers} />

      {/* Section 4: Agent Model Assignments */}
      <AgentModelAssignment
        providers={providers}
        assignments={agentAssignments}
      />

      {/* Section 5: Embedding Provider */}
      <EmbeddingProvider providers={providers} />

      {/* Section 6: Obsidian Integration */}
      <ObsidianSettings />

      {/* Section 7: Skills Management */}
      <SkillsManagement initialSkills={skills} />

      {/* Section 8: Database Configuration */}

      {/* Section 5: Database Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Database</CardTitle>
          <CardDescription>Connection details (read-only)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Host', value: dbHost },
              { label: 'Port', value: dbPort },
              { label: 'Database', value: dbName },
              { label: 'User', value: dbUser },
              { label: 'Password', value: '****' },
              { label: 'Ollama Host', value: ollamaHost },
            ].map((item) => (
              <div key={item.label} className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-muted-foreground w-28 shrink-0">
                  {item.label}
                </span>
                <span className="text-sm font-mono">{item.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
