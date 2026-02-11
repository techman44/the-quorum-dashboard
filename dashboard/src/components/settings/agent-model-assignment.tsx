'use client';

import { useState, useTransition, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAgents, type UIAgent } from '@/lib/use-agents';
import { DynamicIcon } from '@/components/dynamic-icon';

interface Provider {
  id: string;
  providerType: 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom';
  name: string;
  isEnabled: boolean;
  hasApiKey: boolean;
}

interface AgentModelAssignment {
  id: string;
  agentName: string;
  primaryProviderId: string;
  primaryModel: string;
  fallbackProviderId?: string;
  fallbackModel?: string;
}

interface AgentModelAssignmentProps {
  providers: Provider[];
  assignments: AgentModelAssignment[];
}

// Model lists aligned with OpenClaw's available models
const FALLBACK_MODELS: Record<string, string[]> = {
  openai: [
    'gpt-5.1',
    'gpt-5.1-codex-max',
    'gpt-5.1-mini',
    'gpt-5.1-nano',
    'gpt-5.2',
    'gpt-5.2-mini',
    'gpt-5.2-nano',
    'gpt-5',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-4o',
    'gpt-4o-mini',
    'o1',
    'o1-mini',
    'o3',
    'o3-mini',
    'o3-mini-high',
  ],
  anthropic: [
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-3-7-sonnet',
    'claude-3-5-sonnet',
    'claude-3-5-haiku',
    'claude-3-opus',
  ],
  google: [
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-thinking-exp',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  openrouter: [],
  custom: [],
};

const PROVIDER_TYPE_COLORS: Record<string, string> = {
  openai: 'bg-emerald-600',
  anthropic: 'bg-orange-600',
  google: 'bg-blue-600',
  openrouter: 'bg-purple-600',
  custom: 'bg-gray-600',
};

export function AgentModelAssignment({
  providers,
  assignments: initialAssignments,
}: AgentModelAssignmentProps) {
  const { agents, loading: agentsLoading } = useAgents({ includeDisabled: false });

  // Store assignments in state, synced with props
  const [assignments, setAssignments] = useState<AgentModelAssignment[]>(initialAssignments);

  // Sync assignments when props change
  useEffect(() => {
    setAssignments(initialAssignments);
  }, [initialAssignments]);

  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  // "Apply to all" selections
  const [applyToAllPrimary, setApplyToAllPrimary] = useState<{ providerId: string; model: string } | null>(null);
  const [applyToAllFallback, setApplyToAllFallback] = useState<{ providerId: string; model: string } | null>(null);

  // Discovered models cache per provider
  const [discoveredModels, setDiscoveredModels] = useState<Record<string, string[]>>({});
  const [isDiscovering, setIsDiscovering] = useState<Record<string, boolean>>({});

  // Get enabled providers only
  const enabledProviders = providers.filter((p) => p.isEnabled && (p.hasApiKey || p.providerType === 'custom'));

  function getProvider(providerId: string) {
    return providers.find((p) => p.id === providerId);
  }

  // Discover models for a specific provider
  async function discoverModelsForProvider(providerId: string) {
    const provider = getProvider(providerId);
    if (!provider) return;

    // For Anthropic/Google, use fallback
    if (provider.providerType === 'anthropic' || provider.providerType === 'google') {
      setDiscoveredModels(prev => ({
        ...prev,
        [providerId]: FALLBACK_MODELS[provider.providerType] || [],
      }));
      return;
    }

    // For OpenAI, custom, openrouter - fetch from API
    if (provider.providerType === 'openai' || provider.providerType === 'custom' || provider.providerType === 'openrouter') {
      setIsDiscovering(prev => ({ ...prev, [providerId]: true }));
      try {
        const response = await fetch(`/api/settings/providers?discover=true&providerId=${encodeURIComponent(providerId)}`);
        const data = await response.json();
        if (data.models && data.models.length > 0) {
          setDiscoveredModels(prev => ({
            ...prev,
            [providerId]: data.models,
          }));
        } else {
          setDiscoveredModels(prev => ({
            ...prev,
            [providerId]: [],
          }));
        }
      } catch (error) {
        console.error(`Failed to discover models for ${provider.name}:`, error);
        setDiscoveredModels(prev => ({
          ...prev,
          [providerId]: FALLBACK_MODELS[provider.providerType] || [],
        }));
      } finally {
        setIsDiscovering(prev => ({ ...prev, [providerId]: false }));
      }
    }
  }

  // Get models for a provider (discovered or fallback)
  function getModelsForProvider(providerId: string): string[] {
    if (discoveredModels[providerId]) {
      return discoveredModels[providerId];
    }

    const provider = getProvider(providerId);
    if (!provider) return [];

    return FALLBACK_MODELS[provider.providerType] || [];
  }

  // Auto-discover models for enabled providers on mount
  useEffect(() => {
    for (const provider of enabledProviders) {
      discoverModelsForProvider(provider.id);
    }
  }, [providers]);

  function getAssignmentForAgent(agentName: string) {
    return assignments.find((a) => a.agentName === agentName);
  }

  // Save assignment to API
  async function saveAssignment(agentName: string, assignmentData: {
    primaryProviderId: string;
    primaryModel: string;
    fallbackProviderId?: string;
    fallbackModel?: string;
  }) {
    startTransition(async () => {
      try {
        setSaveStatus('saving');

        const response = await fetch('/api/settings/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentName,
            ...assignmentData,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || 'Failed to save assignment');
        }

        const result = await response.json();

        // Update local state with the result from server
        setAssignments(prev => {
          const existing = prev.find(a => a.agentName === agentName);
          if (existing) {
            return prev.map(a => a.agentName === agentName ? result.assignment : a);
          } else {
            return [...prev, result.assignment];
          }
        });

        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (error) {
        console.error('Assignment save error:', error);
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    });
  }

  // Apply primary model to all agents
  async function applyPrimaryToAll() {
    if (!applyToAllPrimary) return;

    const { providerId, model } = applyToAllPrimary;

    for (const agent of agents) {
      await saveAssignment(agent.name, {
        primaryProviderId: providerId,
        primaryModel: model,
        fallbackProviderId: undefined,
        fallbackModel: undefined,
      });
    }

    setApplyToAllPrimary(null);
  }

  // Apply fallback model to all agents
  async function applyFallbackToAll() {
    if (!applyToAllFallback) return;

    const { providerId, model } = applyToAllFallback;

    for (const agent of agents) {
      const current = getAssignmentForAgent(agent.name);
      await saveAssignment(agent.name, {
        primaryProviderId: current?.primaryProviderId || providerId,
        primaryModel: current?.primaryModel || model,
        fallbackProviderId: providerId,
        fallbackModel: model,
      });
    }

    setApplyToAllFallback(null);
  }

  // Get the first enabled provider for default selections
  const firstEnabledProvider = enabledProviders[0];
  const firstEnabledProviderModels = firstEnabledProvider ? getModelsForProvider(firstEnabledProvider.id) : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Agent Model Assignments</CardTitle>
            <CardDescription>
              Configure which AI provider and model each agent uses
            </CardDescription>
          </div>
          {saveStatus === 'saving' && (
            <Badge className="bg-yellow-600 text-white">Saving...</Badge>
          )}
          {saveStatus === 'success' && (
            <Badge className="bg-green-600 text-white">Saved</Badge>
          )}
          {saveStatus === 'error' && (
            <Badge variant="destructive">Error saving</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {enabledProviders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No enabled providers with API keys configured. Add and enable a provider first.
          </div>
        ) : agentsLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading agents...</div>
        ) : agents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No agents available.</div>
        ) : (
          <>
            {/* Apply to All Section */}
            <div className="mb-6 p-4 bg-muted/50 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Quick Setup - Apply to All Agents</h4>
                  <p className="text-sm text-muted-foreground">Set a default model for all agents at once</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Primary for all */}
                <div className="flex gap-2">
                  <Select
                    value={applyToAllPrimary?.providerId || ''}
                    onValueChange={(value) => {
                      const models = getModelsForProvider(value);
                      setApplyToAllPrimary({
                        providerId: value,
                        model: models[0] || '',
                      });
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {enabledProviders.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={applyToAllPrimary?.model || ''}
                    onValueChange={(value) => {
                      if (applyToAllPrimary) {
                        setApplyToAllPrimary({ ...applyToAllPrimary, model: value });
                      }
                    }}
                    disabled={!applyToAllPrimary?.providerId}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent>
                      {applyToAllPrimary?.providerId && getModelsForProvider(applyToAllPrimary.providerId).map((model) => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={applyPrimaryToAll}
                    disabled={!applyToAllPrimary?.providerId || !applyToAllPrimary?.model || isPending}
                    size="sm"
                  >
                    Set Primary
                  </Button>
                </div>

                {/* Fallback for all */}
                <div className="flex gap-2">
                  <Select
                    value={applyToAllFallback?.providerId || ''}
                    onValueChange={(value) => {
                      const models = getModelsForProvider(value);
                      setApplyToAllFallback({
                        providerId: value,
                        model: models[0] || '',
                      });
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {enabledProviders.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={applyToAllFallback?.model || ''}
                    onValueChange={(value) => {
                      if (applyToAllFallback) {
                        setApplyToAllFallback({ ...applyToAllFallback, model: value });
                      }
                    }}
                    disabled={!applyToAllFallback?.providerId}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent>
                      {applyToAllFallback?.providerId && getModelsForProvider(applyToAllFallback.providerId).map((model) => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={applyFallbackToAll}
                    disabled={!applyToAllFallback?.providerId || !applyToAllFallback?.model || isPending}
                    size="sm"
                    variant="outline"
                  >
                    Set Fallback
                  </Button>
                </div>
              </div>
            </div>

            {/* Individual Agent Configurations */}
            <div className="space-y-4">
              {agents.map((agent) => {
                const assignment = getAssignmentForAgent(agent.name);
                const primaryProviderId = assignment?.primaryProviderId || '';
                const primaryModel = assignment?.primaryModel || '';
                const fallbackProviderId = assignment?.fallbackProviderId || 'none';
                const fallbackModel = assignment?.fallbackModel || '';

                const primaryProvider = getProvider(primaryProviderId);
                const fallbackProvider = fallbackProviderId !== 'none' ? getProvider(fallbackProviderId) : null;

                return (
                  <div
                    key={agent.name}
                    className="border rounded-lg p-4 space-y-4"
                  >
                    {/* Agent Header */}
                    <div className="flex items-center gap-3">
                      <div style={{ color: agent.color }}>
                        <DynamicIcon name={agent.icon} className="h-5 w-5" size={20} />
                      </div>
                      <div>
                        <h4 className="font-medium">{agent.displayName}</h4>
                        <p className="text-xs text-muted-foreground">
                          {agent.description}
                        </p>
                      </div>
                    </div>

                    {/* Primary Provider Selection */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`${agent.name}-primary-provider`}>
                          Primary Provider
                        </Label>
                        <Select
                          value={primaryProviderId}
                          onValueChange={(value) => {
                            const models = getModelsForProvider(value);
                            saveAssignment(agent.name, {
                              primaryProviderId: value,
                              primaryModel: models[0] || '',
                              fallbackProviderId: assignment?.fallbackProviderId,
                              fallbackModel: assignment?.fallbackModel,
                            });
                          }}
                        >
                          <SelectTrigger id={`${agent.name}-primary-provider`}>
                            <SelectValue placeholder="Select provider">
                              {primaryProvider ? primaryProvider.name : ''}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {enabledProviders.map((provider) => (
                              <SelectItem key={provider.id} value={provider.id}>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`inline-block h-2 w-2 rounded-full ${
                                      PROVIDER_TYPE_COLORS[provider.providerType]
                                    }`}
                                  />
                                  {provider.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`${agent.name}-primary-model`}>
                          Primary Model
                        </Label>
                        <Select
                          value={primaryModel}
                          onValueChange={(value) => {
                            saveAssignment(agent.name, {
                              primaryProviderId: primaryProviderId || firstEnabledProvider?.id || '',
                              primaryModel: value,
                              fallbackProviderId: assignment?.fallbackProviderId,
                              fallbackModel: assignment?.fallbackModel,
                            });
                          }}
                          disabled={!primaryProviderId}
                        >
                          <SelectTrigger id={`${agent.name}-primary-model`}>
                            <SelectValue placeholder="Select model">
                              {primaryModel || ''}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {primaryProviderId &&
                              getModelsForProvider(primaryProviderId).map(
                                (model) => (
                                  <SelectItem key={model} value={model}>
                                    {model}
                                  </SelectItem>
                                )
                              )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Fallback Provider Selection */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`${agent.name}-fallback-provider`}>
                          Fallback Provider (optional)
                        </Label>
                        <Select
                          value={fallbackProviderId}
                          onValueChange={(value) => {
                            if (value === 'none') {
                              saveAssignment(agent.name, {
                                primaryProviderId: primaryProviderId || firstEnabledProvider?.id || '',
                                primaryModel: primaryModel || firstEnabledProviderModels[0] || '',
                                fallbackProviderId: undefined,
                                fallbackModel: undefined,
                              });
                            } else {
                              const models = getModelsForProvider(value);
                              saveAssignment(agent.name, {
                                primaryProviderId: primaryProviderId || firstEnabledProvider?.id || '',
                                primaryModel: primaryModel || firstEnabledProviderModels[0] || '',
                                fallbackProviderId: value,
                                fallbackModel: models[0] || '',
                              });
                            }
                          }}
                        >
                          <SelectTrigger id={`${agent.name}-fallback-provider`}>
                            <SelectValue placeholder="None">
                              {fallbackProvider ? fallbackProvider.name : 'None'}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {enabledProviders
                              .filter((p) => p.id !== primaryProviderId)
                              .map((provider) => (
                                <SelectItem key={provider.id} value={provider.id}>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`inline-block h-2 w-2 rounded-full ${
                                        PROVIDER_TYPE_COLORS[provider.providerType]
                                      }`}
                                    />
                                    {provider.name}
                                  </div>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`${agent.name}-fallback-model`}>
                          Fallback Model
                        </Label>
                        <Select
                          value={fallbackModel}
                          onValueChange={(value) => {
                            saveAssignment(agent.name, {
                              primaryProviderId: primaryProviderId || firstEnabledProvider?.id || '',
                              primaryModel: primaryModel || firstEnabledProviderModels[0] || '',
                              fallbackProviderId: fallbackProviderId !== 'none' ? fallbackProviderId : undefined,
                              fallbackModel: value,
                            });
                          }}
                          disabled={!fallbackProviderId || fallbackProviderId === 'none'}
                        >
                          <SelectTrigger id={`${agent.name}-fallback-model`}>
                            <SelectValue placeholder="Select model">
                              {fallbackModel || ''}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {fallbackProviderId && fallbackProviderId !== 'none' &&
                              getModelsForProvider(fallbackProviderId).map((model) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Visual indicator of current assignment */}
                    {primaryProvider && (
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <span className="text-xs text-muted-foreground">Using:</span>
                        <Badge className={PROVIDER_TYPE_COLORS[primaryProvider.providerType]}>
                          {primaryProvider.name}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground">
                          {primaryModel || '(none)'}
                        </span>
                        {fallbackProvider && (
                          <>
                            <span className="text-xs text-muted-foreground">(fallback:</span>
                            <Badge
                              className={PROVIDER_TYPE_COLORS[fallbackProvider.providerType]}
                              variant="outline"
                            >
                              {fallbackProvider.name}
                            </Badge>
                            <span className="text-xs font-mono text-muted-foreground">
                              {fallbackModel})
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
