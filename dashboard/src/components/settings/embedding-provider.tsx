'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

interface Provider {
  id: string;
  providerType: 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom';
  name: string;
  isEnabled: boolean;
  hasApiKey: boolean;
}

interface EmbeddingConfig {
  id: string;
  providerType: 'ollama' | 'openai' | 'custom' | 'openrouter';
  name: string;
  model: string;
  baseUrl?: string;
  hasApiKey?: boolean;
  enabled: boolean;
}

interface EmbeddingProviderProps {
  providers: Provider[];
}

interface EmbeddingModel {
  name: string;
  dimension: number;
}

const PROVIDER_TYPES = [
  { value: 'ollama', label: 'Ollama', color: 'bg-slate-600' },
  { value: 'openai', label: 'OpenAI', color: 'bg-emerald-600' },
  { value: 'openrouter', label: 'OpenRouter', color: 'bg-purple-600' },
  { value: 'custom', label: 'Custom', color: 'bg-gray-600' },
] as const;

// Fallback models when discovery fails
const FALLBACK_MODELS: Record<string, { name: string; dimension: number }[]> = {
  ollama: [
    { name: 'mxbai-embed-large', dimension: 1024 },
    { name: 'nomic-embed-text', dimension: 768 },
    { name: 'nomic-embed-text-v1.5', dimension: 768 },
    { name: 'all-minilm', dimension: 384 },
    { name: 'bge-large', dimension: 1024 },
    { name: 'bge-small', dimension: 384 },
  ],
  openai: [
    { name: 'text-embedding-3-small', dimension: 1536 },
    { name: 'text-embedding-3-large', dimension: 3072 },
    { name: 'text-embedding-ada-002', dimension: 1536 },
  ],
  custom: [
    { name: 'custom-embedding', dimension: 1536 },
  ],
  openrouter: [
    { name: 'custom-embedding', dimension: 1536 },
  ],
};

export function EmbeddingProvider({ providers }: EmbeddingProviderProps) {
  const [config, setConfig] = useState<EmbeddingConfig | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Form state
  const [providerType, setProviderType] = useState<'ollama' | 'openai' | 'custom' | 'openrouter'>('ollama');
  const [model, setModel] = useState('mxbai-embed-large');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [enabled, setEnabled] = useState(true);

  // Discovered models state
  const [discoveredModels, setDiscoveredModels] = useState<Record<string, EmbeddingModel[]>>({});

  // Load initial config
  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const response = await fetch('/api/settings/embeddings');
      const data = await response.json();
      if (data.config) {
        setConfig(data.config);
        setProviderType(data.config.providerType);
        setModel(data.config.model);
        setBaseUrl(data.config.baseUrl || '');
        setEnabled(data.config.enabled !== undefined ? data.config.enabled : true);
        if (data.config.id && !data.config.id.startsWith('default')) {
          setSelectedProviderId(data.config.id);
        }
        // NOTE: Don't auto-discover on load - use static fallback models instead
        // User can click "Refresh" to discover models manually
        const providerType = data.config.providerType;
        const baseUrl = data.config.baseUrl;
        const cacheKey = `${providerType}-${baseUrl || 'default'}`;
        setDiscoveredModels(prev => ({
          ...prev,
          [cacheKey]: FALLBACK_MODELS[providerType] || [],
        }));
      }
    } catch (error) {
      console.error('Failed to load embedding config:', error);
    }
  }

  /**
   * Discover available models for a provider type
   */
  async function discoverModelsForProvider(type: string, url?: string) {
    // For OpenAI, use static models (no discovery needed)
    if (type === 'openai') {
      setDiscoveredModels(prev => ({ ...prev, openai: FALLBACK_MODELS.openai }));
      return;
    }

    // Check if we already discovered models for this provider with this URL
    const cacheKey = `${type}-${url || 'default'}`;
    if (discoveredModels[cacheKey]) {
      return;
    }

    setIsDiscovering(true);
    try {
      const searchParams = new URLSearchParams({
        discover: 'true',
        providerType: type,
      });
      if (url) {
        searchParams.append('baseUrl', url);
      }

      const response = await fetch(`/api/settings/embeddings?${searchParams.toString()}`);
      const data = await response.json();

      if (data.models && data.models.length > 0) {
        setDiscoveredModels(prev => ({ ...prev, [cacheKey]: data.models }));
      } else {
        // Use fallback models
        setDiscoveredModels(prev => ({ ...prev, [cacheKey]: FALLBACK_MODELS[type] || [] }));
      }
    } catch (error) {
      console.error('Failed to discover models:', error);
      // Use fallback models on error
      setDiscoveredModels(prev => ({ ...prev, [cacheKey]: FALLBACK_MODELS[type] || [] }));
    } finally {
      setIsDiscovering(false);
    }
  }

  // Set default base URLs when provider type changes (use ref to prevent loops)
  useEffect(() => {
    if (providerType === 'ollama' && baseUrl !== 'http://localhost:11434') {
      setBaseUrl('http://localhost:11434');
    } else if (providerType === 'openai' && baseUrl !== 'https://api.openai.com/v1') {
      setBaseUrl('https://api.openai.com/v1');
    }
  }, [providerType]);

  // Pre-populate with static models when provider type or baseUrl changes
  useEffect(() => {
    const cacheKey = `${providerType}-${baseUrl || 'default'}`;
    const models = FALLBACK_MODELS[providerType] || [];

    if (models.length > 0 && !discoveredModels[cacheKey]) {
      setDiscoveredModels(prev => ({ ...prev, [cacheKey]: models }));
    }

    // Update model if not set or not in the current list
    if (!model || !models.find(m => m.name === model)) {
      if (models.length > 0) {
        setModel(models[0].name);
      }
    }
    // NOTE: No auto-discovery - user clicks "Refresh" button to discover models
  }, [providerType, baseUrl]);

  // NOTE: Removed auto-discovery on baseUrl change to prevent SSR crashes
  // User can manually click "Refresh" to discover models

  function getProviderTypeInfo(type: string) {
    return PROVIDER_TYPES.find((t) => t.value === type) || PROVIDER_TYPES[3];
  }

  async function handleSave() {
    startTransition(async () => {
      try {
        setSaveStatus('saving');

        const body: Record<string, unknown> = {
          providerType,
          model,
          enabled,
        };

        if (providerType === 'ollama' || providerType === 'custom' || providerType === 'openrouter') {
          if (baseUrl.trim()) {
            body.baseUrl = baseUrl.trim();
          }
        }

        if (providerType !== 'ollama' && selectedProviderId && selectedProviderId !== 'manual') {
          body.providerId = selectedProviderId;
        } else if (providerType !== 'ollama' && apiKey.trim()) {
          body.apiKey = apiKey.trim();
        }

        const response = await fetch('/api/settings/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to save configuration');
        }

        const result = await response.json();
        setConfig(result.config);
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (error) {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    });
  }

  async function handleTest() {
    setTestStatus('testing');
    setTestMessage('');

    try {
      const body: Record<string, unknown> = {
        providerType,
        model,
      };

      if (providerType === 'ollama' || providerType === 'custom' || providerType === 'openrouter') {
        if (baseUrl.trim()) {
          body.baseUrl = baseUrl.trim();
        }
      }

      if (providerType !== 'ollama' && selectedProviderId) {
        body.providerId = selectedProviderId;
      } else if (providerType !== 'ollama' && apiKey.trim()) {
        body.apiKey = apiKey.trim();
      }

      const response = await fetch('/api/settings/embeddings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (result.success) {
        setTestStatus('success');
        setTestMessage(`Embedding generated successfully! Dimension: ${result.dimension}`);
      } else {
        setTestStatus('error');
        setTestMessage(result.error || 'Test failed');
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage('Connection test failed');
    }
  }

  function getModelDimension(modelName: string): number | undefined {
    const cacheKey = `${providerType}-${baseUrl || 'default'}`;
    const models = discoveredModels[cacheKey] || FALLBACK_MODELS[providerType] || [];
    const found = models.find(m => m.name === modelName);
    return found?.dimension;
  }

  // Get available providers for the selected provider type
  const getCompatibleProviders = () => {
    if (providerType === 'openai') {
      return providers.filter(p => p.providerType === 'openai' && p.isEnabled && p.hasApiKey);
    }
    if (providerType === 'custom' || providerType === 'openrouter') {
      // For custom providers, API key is not required
      return providers.filter(p => (p.providerType === 'custom' || p.providerType === 'openrouter') && p.isEnabled);
    }
    return [];
  };

  const compatibleProviders = getCompatibleProviders();
  const cacheKey = `${providerType}-${baseUrl || 'default'}`;
  const currentModels = discoveredModels[cacheKey] || FALLBACK_MODELS[providerType] || [];
  const typeInfo = getProviderTypeInfo(providerType);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Embedding Provider</CardTitle>
            <CardDescription>
              Configure the AI provider for document embeddings
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
      <CardContent className="space-y-6">
        {/* Current configuration display */}
        {config && (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
            <span className="text-sm text-muted-foreground">Current:</span>
            <Badge className={typeInfo.color}>{config.providerType}</Badge>
            <span className="text-sm font-medium">{config.model}</span>
            {config.enabled ? (
              <Badge variant="secondary" className="bg-green-950 text-green-400 border-green-800">Enabled</Badge>
            ) : (
              <Badge variant="secondary">Disabled</Badge>
            )}
          </div>
        )}

        {/* Provider Type Selection */}
        <div className="space-y-2">
          <Label htmlFor="embedding-provider-type">Provider Type</Label>
          <Select
            value={providerType}
            onValueChange={(value) => setProviderType(value as typeof providerType)}
          >
            <SelectTrigger id="embedding-provider-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${type.color}`} />
                    {type.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {providerType === 'ollama' && 'Local Ollama instance for embeddings'}
            {providerType === 'openai' && 'OpenAI embedding API'}
            {providerType === 'openrouter' && 'OpenRouter aggregation service'}
            {providerType === 'custom' && 'Custom OpenAI-compatible embedding endpoint'}
          </p>
        </div>

        {/* Model Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="embedding-model">Embedding Model</Label>
            <div className="flex items-center gap-2">
              {isDiscovering && (
                <span className="text-xs text-muted-foreground">Discovering models...</span>
              )}
              {(providerType === 'ollama' || providerType === 'custom' || providerType === 'openrouter') && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => discoverModelsForProvider(providerType, baseUrl)}
                  disabled={isDiscovering || !baseUrl}
                >
                  Refresh
                </Button>
              )}
            </div>
          </div>
          <Select
            value={model}
            onValueChange={setModel}
            disabled={isDiscovering || currentModels.length === 0}
          >
            <SelectTrigger id="embedding-model">
              <SelectValue placeholder={isDiscovering ? 'Discovering models...' : 'Select model'} />
            </SelectTrigger>
            <SelectContent>
              {currentModels.map((m) => (
                <SelectItem key={m.name} value={m.name}>
                  <div className="flex flex-col">
                    <span>{m.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Dimension: {m.dimension}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {getModelDimension(model) && (
            <p className="text-xs text-muted-foreground">
              Embedding dimension: {getModelDimension(model)}
            </p>
          )}
          {currentModels.length === 0 && !isDiscovering && (
            <p className="text-xs text-muted-foreground">
              No models discovered. Enter a valid base URL and click Refresh.
            </p>
          )}
        </div>

        {/* Provider Selection (for OpenAI, Custom, OpenRouter) */}
        {providerType !== 'ollama' && compatibleProviders.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="embedding-provider">Use Existing Provider</Label>
            <Select
              value={selectedProviderId}
              onValueChange={(value) => {
                setSelectedProviderId(value);
                setApiKey(''); // Clear manual API key when using a provider
              }}
            >
              <SelectTrigger id="embedding-provider">
                <SelectValue placeholder="Select a configured provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual API Key</SelectItem>
                {compatibleProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProviderId && selectedProviderId !== 'manual' && (
              <p className="text-xs text-muted-foreground">
                Using API key from selected provider
              </p>
            )}
          </div>
        )}

        {/* API Key Input (for OpenAI, Custom, OpenRouter when not using a provider) */}
        {providerType !== 'ollama' && (!selectedProviderId || selectedProviderId === 'manual') && (
          <div className="space-y-2">
            <Label htmlFor="embedding-api-key">
              API Key {providerType === 'custom' ? '(optional)' : ''}
            </Label>
            <Input
              id="embedding-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={providerType === 'custom' ? 'Leave blank if not required' : 'sk-...'}
            />
            <p className="text-xs text-muted-foreground">
              {providerType === 'custom'
                ? 'Some local providers like LM Studio don\'t require an API key'
                : 'Enter API key manually or select an existing provider above'
              }
            </p>
          </div>
        )}

        {/* Base URL (for Ollama, Custom) */}
        {(providerType === 'ollama' || providerType === 'custom' || providerType === 'openrouter') && (
          <div className="space-y-2">
            <Label htmlFor="embedding-base-url">
              {providerType === 'ollama' ? 'Ollama Host URL' : 'Base URL'}
            </Label>
            <Input
              id="embedding-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                providerType === 'ollama'
                  ? 'http://localhost:11434'
                  : 'https://api.example.com/v1'
              }
            />
          </div>
        )}

        {/* Enable/Disable */}
        <div className="flex items-center gap-3">
          <Switch
            id="embedding-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          <Label htmlFor="embedding-enabled">Enable embeddings</Label>
        </div>

        {/* Test Result */}
        {testStatus !== 'idle' && (
          <div
            className={`text-sm p-3 rounded-md ${
              testStatus === 'testing'
                ? 'bg-blue-950 border border-blue-800 text-blue-200'
                : testStatus === 'success'
                ? 'bg-green-950 border border-green-800 text-green-200'
                : 'bg-red-950 border border-red-800 text-red-200'
            }`}
          >
            {testStatus === 'testing' ? 'Testing connection...' : testMessage}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testStatus === 'testing' || isPending}
          >
            {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
