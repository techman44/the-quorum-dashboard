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

// Local state type for unsaved assignments
interface LocalAssignment {
  primaryProviderId: string;
  primaryModel: string;
  fallbackProviderId: string;
  fallbackModel: string;
}

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

// Fallback models for providers that don't support discovery
const FALLBACK_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250514'],
  google: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'],
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
  const [assignments, setAssignments] = useState<AgentModelAssignment[]>(
    initialAssignments
  );
  // Local state for unsaved selections - allows provider selection before saving
  const [localAssignments, setLocalAssignments] = useState<Record<string, LocalAssignment>>({});
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  // Discovered models cache per provider
  const [discoveredModels, setDiscoveredModels] = useState<Record<string, string[]>>({});
  const [isDiscovering, setIsDiscovering] = useState<Record<string, boolean>>({});

  // Get enabled providers only
  // For custom providers, API key is not required
  const enabledProviders = providers.filter((p) => p.isEnabled && (p.hasApiKey || p.providerType === 'custom'));

  function getProvider(providerId: string) {
    return providers.find((p) => p.id === providerId);
  }

  // Discover models for a specific provider
  async function discoverModelsForProvider(providerId: string) {
    const provider = getProvider(providerId);
    if (!provider) return;

    // For providers without discovery API, use fallback
    if (provider.providerType === 'openai' || provider.providerType === 'anthropic' || provider.providerType === 'google') {
      setDiscoveredModels(prev => ({
        ...prev,
        [providerId]: FALLBACK_MODELS[provider.providerType] || [],
      }));
      return;
    }

    // For custom/openrouter, fetch from API
    if (provider.providerType === 'custom' || provider.providerType === 'openrouter') {
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
          // Use empty array if no models found
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

    // Return fallback models initially, will be replaced by discovery
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

  // Get the effective value to display - prioritizes saved assignment, then local state
  function getPrimaryProviderValue(agentName: string): string {
    const saved = getAssignmentForAgent(agentName);
    if (saved?.primaryProviderId) return saved.primaryProviderId;
    return localAssignments[agentName]?.primaryProviderId || '';
  }

  function getPrimaryModelValue(agentName: string): string {
    const saved = getAssignmentForAgent(agentName);
    if (saved?.primaryModel) return saved.primaryModel;
    return localAssignments[agentName]?.primaryModel || '';
  }

  function getFallbackProviderValue(agentName: string): string {
    const saved = getAssignmentForAgent(agentName);
    if (saved?.fallbackProviderId) return saved.fallbackProviderId;
    return localAssignments[agentName]?.fallbackProviderId || 'none';
  }

  function getFallbackModelValue(agentName: string): string {
    const saved = getAssignmentForAgent(agentName);
    if (saved?.fallbackModel) return saved.fallbackModel;
    return localAssignments[agentName]?.fallbackModel || '';
  }

  // Update local state immediately for responsive UI, then persist to API
  function updateLocalAssignment(
    agentName: string,
    updates: Partial<LocalAssignment>
  ) {
    setLocalAssignments((prev) => ({
      ...prev,
      [agentName]: {
        ...prev[agentName],
        ...updates,
      },
    }));
  }

  async function handleUpdateAssignment(
    agentName: string,
    updates: Partial<AgentModelAssignment>
  ) {
    const currentAssignment = getAssignmentForAgent(agentName);

    // Combine saved assignment with local state for the full picture
    const localState = localAssignments[agentName] || {};
    const baseAssignment = currentAssignment || {
      id: '',
      agentName,
      primaryProviderId: '',
      primaryModel: '',
      fallbackProviderId: '',
      fallbackModel: '',
    };

    const newAssignment: AgentModelAssignment = {
      ...baseAssignment,
      ...localState,
      ...updates,
    };

    // Convert "none" to undefined for the API
    const apiFallbackProviderId = newAssignment.fallbackProviderId === 'none'
      ? undefined
      : newAssignment.fallbackProviderId;
    const apiFallbackModel = newAssignment.fallbackModel === 'none' || !apiFallbackProviderId
      ? undefined
      : newAssignment.fallbackModel;

    // Only save if we have the required fields
    if (!newAssignment.primaryProviderId || !newAssignment.primaryModel) {
      return;
    }

    startTransition(async () => {
      try {
        setSaveStatus('saving');

        const response = await fetch('/api/settings/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentName,
            primaryProviderId: newAssignment.primaryProviderId,
            primaryModel: newAssignment.primaryModel,
            fallbackProviderId: apiFallbackProviderId,
            fallbackModel: apiFallbackModel,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Failed to save assignment:', errorData);
          throw new Error(errorData.error || 'Failed to save assignment');
        }

        const result = await response.json();

        // Update local state
        if (currentAssignment) {
          setAssignments(
            assignments.map((a) =>
              a.agentName === agentName ? result.assignment : a
            )
          );
        } else {
          setAssignments([...assignments, result.assignment]);
        }

        // Clear local state for this agent after successful save
        setLocalAssignments((prev) => {
          const newState = { ...prev };
          delete newState[agentName];
          return newState;
        });

        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (error) {
        console.error('Assignment save error:', error);
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    });
  }

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
            No enabled providers with API keys configured. Add and enable a provider
            first.
          </div>
        ) : agentsLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading agents...
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No agents available.
          </div>
        ) : (
          <div className="space-y-6">
            {agents.map((agent) => {
              const assignment = getAssignmentForAgent(agent.name);
              const primaryProviderId = getPrimaryProviderValue(agent.name);
              const primaryModel = getPrimaryModelValue(agent.name);
              const fallbackProviderId = getFallbackProviderValue(agent.name);
              const fallbackModel = getFallbackModelValue(agent.name);

              const primaryProvider = getProvider(primaryProviderId);
              const fallbackProvider = fallbackProviderId && fallbackProviderId !== 'none'
                ? getProvider(fallbackProviderId)
                : null;

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
                          const provider = getProvider(value);
                          if (provider) {
                            const models = getModelsForProvider(value);
                            // Update local state immediately for responsive UI
                            updateLocalAssignment(agent.name, {
                              primaryProviderId: value,
                              primaryModel: models[0] || '',
                            });
                            // Then persist to API
                            handleUpdateAssignment(agent.name, {
                              primaryProviderId: value,
                              primaryModel: models[0] || '',
                            });
                          }
                        }}
                      >
                        <SelectTrigger id={`${agent.name}-primary-provider`}>
                          <SelectValue placeholder="Select provider">
                            {primaryProvider ? primaryProvider.name : 'Select provider'}
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
                          updateLocalAssignment(agent.name, {
                            primaryModel: value,
                          });
                          handleUpdateAssignment(agent.name, {
                            primaryModel: value,
                          });
                        }}
                        disabled={!primaryProviderId}
                      >
                        <SelectTrigger id={`${agent.name}-primary-model`}>
                          <SelectValue placeholder="Select model" />
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
                            updateLocalAssignment(agent.name, {
                              fallbackProviderId: 'none',
                              fallbackModel: '',
                            });
                            handleUpdateAssignment(agent.name, {
                              fallbackProviderId: 'none',
                              fallbackModel: '',
                            });
                          } else {
                            const provider = getProvider(value);
                            if (provider) {
                              const models = getModelsForProvider(value);
                              updateLocalAssignment(agent.name, {
                                fallbackProviderId: value,
                                fallbackModel: models[0] || '',
                              });
                              handleUpdateAssignment(agent.name, {
                                fallbackProviderId: value,
                                fallbackModel: models[0] || '',
                              });
                            }
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
                            .filter(
                              (p) => p.id !== primaryProviderId
                            )
                            .map((provider) => (
                              <SelectItem key={provider.id} value={provider.id}>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`inline-block h-2 w-2 rounded-full ${
                                      PROVIDER_TYPE_COLORS[
                                        provider.providerType
                                      ]
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
                          updateLocalAssignment(agent.name, {
                            fallbackModel: value,
                          });
                          handleUpdateAssignment(agent.name, {
                            fallbackModel: value,
                          });
                        }}
                        disabled={!fallbackProviderId || fallbackProviderId === 'none'}
                      >
                        <SelectTrigger id={`${agent.name}-fallback-model`}>
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          {fallbackProviderId && fallbackProviderId !== 'none' &&
                            getModelsForProvider(
                              fallbackProviderId
                            ).map((model) => (
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
                      <span className="text-xs text-muted-foreground">
                        Using:
                      </span>
                      <Badge
                        className={PROVIDER_TYPE_COLORS[primaryProvider.providerType]}
                      >
                        {primaryProvider.name}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">
                        {primaryModel}
                      </span>
                      {fallbackProvider && (
                        <>
                          <span className="text-xs text-muted-foreground">
                            (fallback:
                          </span>
                          <Badge
                            className={
                              PROVIDER_TYPE_COLORS[fallbackProvider.providerType]
                            }
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
        )}
      </CardContent>
    </Card>
  );
}
