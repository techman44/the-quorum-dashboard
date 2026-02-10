'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2 } from 'lucide-react';

interface Provider {
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

interface ProviderManagementProps {
  initialProviders: Provider[];
}

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI', color: 'bg-emerald-600', supportsOAuth: true },
  { value: 'anthropic', label: 'Anthropic', color: 'bg-orange-600', supportsOAuth: false },
  { value: 'google', label: 'Google', color: 'bg-blue-600', supportsOAuth: false },
  { value: 'openrouter', label: 'OpenRouter', color: 'bg-purple-600', supportsOAuth: false },
  { value: 'custom', label: 'Custom', color: 'bg-gray-600', supportsOAuth: false },
] as const;

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250514'],
  google: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  openrouter: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.0-flash'],
  custom: [],
};

export function ProviderManagement({ initialProviders }: ProviderManagementProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [providers, setProviders] = useState<Provider[]>(initialProviders);
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);

  // Form state
  const [providerType, setProviderType] = useState<'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom'>('openai');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [oauthStatus, setOAuthStatus] = useState<{ status: 'success' | 'error' | null; message: string }>({
    status: null,
    message: '',
  });
  const [showDeviceAuth, setShowDeviceAuth] = useState(false);
  const [deviceAuthCode, setDeviceAuthCode] = useState<{
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    deviceCodeId: string;
  } | null>(null);
  const [deviceAuthStatus, setDeviceAuthStatus] = useState<'pending' | 'complete' | 'error'>('pending');
  const [isPollingAuth, setIsPollingAuth] = useState(false);

  // PKCE OAuth flow state
  const [pkceAuthUrl, setPkceAuthUrl] = useState<string | null>(null);
  const [redirectUrlInput, setRedirectUrlInput] = useState('');
  const [isSubmittingCallback, setIsSubmittingCallback] = useState(false);

  // Handle OAuth callback status from URL
  useEffect(() => {
    const oauthStatus = searchParams.get('oauth_status');
    const oauthMessage = searchParams.get('oauth_message');

    if (oauthStatus && oauthMessage) {
      setOAuthStatus({
        status: oauthStatus as 'success' | 'error',
        message: decodeURIComponent(oauthMessage),
      });

      // Clear URL parameters
      router.replace('/settings', { scroll: false });

      // Auto-hide success message after 5 seconds
      if (oauthStatus === 'success') {
        setTimeout(() => setOAuthStatus({ status: null, message: '' }), 5000);
      }
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (editingProvider) {
      setProviderType(editingProvider.providerType);
      setName(editingProvider.name);
      setBaseUrl(editingProvider.baseUrl || '');
      setIsEnabled(editingProvider.isEnabled);
      setApiKey('');
      setTestStatus('idle');
      setTestMessage('');
    } else {
      resetForm();
    }
  }, [editingProvider, dialogOpen]);

  function resetForm() {
    setProviderType('openai');
    setName('');
    setApiKey('');
    setBaseUrl('');
    setIsEnabled(true);
    setTestStatus('idle');
    setTestMessage('');
  }

  async function handleSave() {
    if (!name.trim()) {
      setTestMessage('Name is required');
      setTestStatus('error');
      return;
    }

    startTransition(async () => {
      try {
        const url = editingProvider
          ? '/api/settings/providers'
          : '/api/settings/providers';

        const method = editingProvider ? 'PUT' : 'POST';

        const body: Record<string, unknown> = {
          providerType,
          name: name.trim(),
          isEnabled,
        };

        if (editingProvider) {
          body.id = editingProvider.id;
        }

        if (apiKey.trim()) {
          body.apiKey = apiKey.trim();
        }

        if (providerType === 'custom' || providerType === 'openrouter') {
          if (baseUrl.trim()) {
            body.baseUrl = baseUrl.trim();
          }
        }

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to save provider');
        }

        const result = await response.json();

        if (editingProvider) {
          setProviders(providers.map((p) =>
            p.id === editingProvider.id
              ? {
                  ...p,
                  name: result.name,
                  isEnabled: result.isEnabled,
                  baseUrl: result.baseUrl,
                  hasApiKey: result.hasApiKey,
                  updatedAt: new Date(),
                }
              : p
          ));
        } else {
          setProviders([
            {
              id: result.id,
              providerType: result.providerType,
              name: result.name,
              isEnabled: result.isEnabled,
              baseUrl: result.baseUrl,
              hasApiKey: result.hasApiKey,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...providers,
          ]);
        }

        setDialogOpen(false);
        setEditingProvider(null);
      } catch (error) {
        setTestStatus('error');
        setTestMessage(error instanceof Error ? error.message : 'Failed to save provider');
      }
    });
  }

  async function handleTest() {
    setTestStatus('testing');
    setTestMessage('');

    try {
      const body: Record<string, unknown> = {
        providerType,
        apiKey: apiKey.trim(),
      };

      if (providerType === 'custom' || providerType === 'openrouter') {
        if (baseUrl.trim()) {
          body.baseUrl = baseUrl.trim();
        }
      }

      if (editingProvider) {
        body.providerId = editingProvider.id;
        delete body.providerType;
        delete body.baseUrl;
      }

      const response = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (result.success) {
        setTestStatus('success');
        setTestMessage('Connection successful!');
      } else {
        setTestStatus('error');
        setTestMessage(result.error || 'Connection failed');
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage('Connection failed');
    }
  }

  async function handleToggleEnable(providerId: string, enabled: boolean) {
    startTransition(async () => {
      try {
        const response = await fetch('/api/settings/providers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: providerId, isEnabled: enabled }),
        });

        if (!response.ok) throw new Error('Failed to update provider');

        setProviders(providers.map((p) =>
          p.id === providerId ? { ...p, isEnabled: enabled } : p
        ));
      } catch (error) {
        console.error('Failed to toggle provider:', error);
      }
    });
  }

  async function handleDelete(providerId: string) {
    if (!confirm('Are you sure you want to delete this provider?')) return;

    startTransition(async () => {
      try {
        const response = await fetch(`/api/settings/providers?id=${providerId}`, {
          method: 'DELETE',
        });

        if (!response.ok) throw new Error('Failed to delete provider');

        setProviders(providers.filter((p) => p.id !== providerId));
      } catch (error) {
        console.error('Failed to delete provider:', error);
      }
    });
  }

  async function handleOAuthLogin(providerId?: string) {
    // Start the PKCE OAuth flow (simpler than device code)
    setOAuthStatus({ status: null, message: '' });
    setPkceAuthUrl(null);
    setRedirectUrlInput('');
    setShowDeviceAuth(true);
    setDeviceAuthStatus('pending');

    try {
      const response = await fetch('/api/auth/openai/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start OAuth flow');
      }

      const data = await response.json();
      setPkceAuthUrl(data.url);
    } catch (error) {
      setOAuthStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to start OAuth flow',
      });
      setShowDeviceAuth(false);
    }
  }

  async function handleSubmitRedirectUrl() {
    if (!redirectUrlInput.trim()) {
      setOAuthStatus({
        status: 'error',
        message: 'Please paste the redirect URL from your browser',
      });
      return;
    }

    setIsSubmittingCallback(true);

    try {
      const response = await fetch('/api/auth/openai/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectUrl: redirectUrlInput.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Authentication failed');
      }

      const result = await response.json();

      // Success! Refresh provider list
      if (result.provider) {
        setProviders(prev => {
          const existing = prev.find(p => p.id === result.provider.id);
          if (existing) {
            return prev.map(p => p.id === result.provider.id ? { ...p, ...result.provider } : p);
          }
          return [{ ...result.provider, createdAt: new Date(), updatedAt: new Date() }, ...prev];
        });
      }

      setDeviceAuthStatus('complete');
      setOAuthStatus({
        status: 'success',
        message: result.message || 'Successfully connected your ChatGPT account!',
      });

      // Close dialog after 2 seconds
      setTimeout(() => {
        setShowDeviceAuth(false);
        setPkceAuthUrl(null);
        setRedirectUrlInput('');
      }, 2000);
    } catch (error) {
      setOAuthStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Authentication failed',
      });
    } finally {
      setIsSubmittingCallback(false);
    }
  }

  function startPolling(deviceCodeId: string) {
    setIsPollingAuth(true);

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/auth/openai/device/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCodeId }),
        });

        if (!response.ok) {
          throw new Error('Polling failed');
        }

        const data = await response.json();

        if (data.status === 'complete') {
          // Success! Provider created/updated
          clearInterval(pollInterval);
          setIsPollingAuth(false);
          setDeviceAuthStatus('complete');
          setOAuthStatus({
            status: 'success',
            message: 'Successfully connected your ChatGPT account!',
          });

          // Refresh provider list
          if (data.provider) {
            setProviders(prev => {
              const existing = prev.find(p => p.id === data.provider.id);
              if (existing) {
                return prev.map(p => p.id === data.provider.id ? { ...p, ...data.provider } : p);
              }
              return [{ ...data.provider, createdAt: new Date(), updatedAt: new Date() }, ...prev];
            });
          }

          // Close dialog after 2 seconds
          setTimeout(() => {
            setShowDeviceAuth(false);
            setDeviceAuthCode(null);
          }, 2000);
        } else if (data.status === 'error' || data.status === 'expired') {
          clearInterval(pollInterval);
          setIsPollingAuth(false);
          setDeviceAuthStatus('error');
          setOAuthStatus({
            status: 'error',
            message: data.error || 'Authentication failed',
          });
        }
        // If status is 'pending', keep polling
      } catch (error) {
        clearInterval(pollInterval);
        setIsPollingAuth(false);
        setDeviceAuthStatus('error');
        setOAuthStatus({
          status: 'error',
          message: 'Failed to check authentication status',
        });
      }
    }, 3000); // Poll every 3 seconds

    // Auto-stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (isPollingAuth) {
        setIsPollingAuth(false);
        setDeviceAuthStatus('error');
        setOAuthStatus({
          status: 'error',
          message: 'Authentication timed out. Please try again.',
        });
      }
    }, 5 * 60 * 1000);
  }

  function getProviderTypeInfo(type: string) {
    return PROVIDER_TYPES.find((t) => t.value === type) || PROVIDER_TYPES[4];
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>AI Providers</CardTitle>
            <CardDescription>
              Manage API keys and OAuth connections for AI providers
            </CardDescription>
          </div>

          {/* Quick OAuth Login Button */}
          <Button
            variant="outline"
            onClick={() => handleOAuthLogin()}
            className="gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.0993 3.8558L12.6 8.3829l2.02-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4092-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
            </svg>
            Login with ChatGPT
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingProvider(null)}>
                Add API Key
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingProvider ? 'Edit Provider' : 'Add Provider'}
                </DialogTitle>
                <DialogDescription>
                  Configure an AI provider for agent model assignments
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="provider-type">Provider Type</Label>
                  <Select
                    value={providerType}
                    onValueChange={(value) =>
                      setProviderType(value as typeof providerType)
                    }
                    disabled={!!editingProvider}
                  >
                    <SelectTrigger id="provider-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDER_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My OpenAI Account"
                  />
                </div>

                {(providerType !== 'custom') && (
                  <div className="space-y-2">
                    <Label htmlFor="api-key">
                      API Key {editingProvider && '(leave blank to keep existing)'}
                    </Label>
                    <Input
                      id="api-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                    />
                  </div>
                )}

                {providerType === 'custom' && (
                  <div className="space-y-2">
                    <Label htmlFor="api-key">
                      API Key (optional)
                    </Label>
                    <Input
                      id="api-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Leave blank if not required"
                    />
                    <p className="text-xs text-muted-foreground">
                      Some local providers like LM Studio don't require an API key
                    </p>
                  </div>
                )}

                {(providerType === 'custom' || providerType === 'openrouter') && (
                  <div className="space-y-2">
                    <Label htmlFor="base-url">Base URL</Label>
                    <Input
                      id="base-url"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://api.example.com/v1"
                    />
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Switch
                    id="enabled"
                    checked={isEnabled}
                    onCheckedChange={setIsEnabled}
                  />
                  <Label htmlFor="enabled">Enabled</Label>
                </div>

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
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTest}
                  disabled={testStatus === 'testing' || isPending}
                >
                  {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                </Button>
                <Button onClick={handleSave} disabled={isPending}>
                  {isPending ? 'Saving...' : editingProvider ? 'Update' : 'Add'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {/* OAuth Status Message */}
        {oauthStatus.status && (
          <div
            className={`mb-4 flex items-center gap-3 p-4 rounded-md ${
              oauthStatus.status === 'success'
                ? 'bg-green-950 border border-green-800 text-green-200'
                : 'bg-red-950 border border-red-800 text-red-200'
            }`}
          >
            {oauthStatus.status === 'success' ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : null}
            <div className="flex-1">
              <p className="font-medium">
                {oauthStatus.status === 'success' ? 'OAuth Connected' : 'OAuth Error'}
              </p>
              <p className="text-sm opacity-90">{oauthStatus.message}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOAuthStatus({ status: null, message: '' })}
              className="text-current opacity-70 hover:opacity-100"
            >
              Dismiss
            </Button>
          </div>
        )}

        {providers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No AI providers configured. Add a provider to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((provider) => {
                const typeInfo = getProviderTypeInfo(provider.providerType);
                return (
                  <TableRow key={provider.id}>
                    <TableCell className="font-medium">{provider.name}</TableCell>
                    <TableCell>
                      <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={provider.isEnabled}
                        onCheckedChange={(checked) =>
                          handleToggleEnable(provider.id, checked)
                        }
                        size="sm"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {provider.hasApiKey ? (
                          <Badge variant="secondary">
                            {provider.hasOAuth ? 'ChatGPT Login' : 'API Key'}
                          </Badge>
                        ) : provider.providerType === 'custom' ? (
                          <Badge variant="outline">Not required</Badge>
                        ) : (
                          <Badge variant="outline">Not set</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {provider.providerType === 'openai' && (
                          <Button
                            size="sm"
                            variant={provider.hasOAuth ? 'secondary' : 'default'}
                            onClick={() => handleOAuthLogin(provider.id)}
                            title={provider.hasOAuth ? 'Reconnect with ChatGPT' : 'Connect with ChatGPT'}
                          >
                            {provider.hasOAuth ? 'Reconnect' : 'ChatGPT Login'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingProvider(provider);
                            setDialogOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(provider.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* PKCE OAuth Dialog */}
      <Dialog open={showDeviceAuth} onOpenChange={(open) => {
        if (!open) {
          setShowDeviceAuth(false);
          setPkceAuthUrl(null);
          setRedirectUrlInput('');
          setDeviceAuthStatus('pending');
          setIsSubmittingCallback(false);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect your ChatGPT account</DialogTitle>
            <DialogDescription>
              Use your existing ChatGPT subscription - no API keys or separate billing
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {deviceAuthStatus === 'complete' ? (
              // Success state
              <div className="rounded-lg bg-green-950 border border-green-800 p-6 text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400" />
                <h3 className="text-lg font-semibold text-green-200 mb-2">Successfully connected!</h3>
                <p className="text-sm text-green-200/80">Your ChatGPT account is now linked to the dashboard.</p>
              </div>
            ) : pkceAuthUrl ? (
              // Show auth URL and instructions
              <div className="space-y-4">
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    Click the button below to open OpenAI authorization
                  </p>
                  <Button
                    onClick={() => window.open(pkceAuthUrl, '_blank')}
                    className="w-full"
                    size="lg"
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.0993 3.8558L12.6 8.3829l2.02-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4092-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.77759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
                    </svg>
                    Open OpenAI Authorization
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    This will open auth.openai.com in a new tab
                  </p>
                </div>

                <div className="rounded-lg bg-muted p-4 text-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">1</div>
                    <p className="font-medium">Click the button above to open OpenAI</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">2</div>
                    <p className="font-medium">Sign in to your ChatGPT account</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">3</div>
                    <p className="font-medium">Click "Authorize" to grant access</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">4</div>
                    <p className="font-medium">Copy the URL from the browser address bar after authorization</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">5</div>
                    <p className="font-medium">Paste the URL below and click "Submit"</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="redirect-url">Redirect URL from browser</Label>
                  <Input
                    id="redirect-url"
                    placeholder="http://127.0.0.1:1455/auth/callback?code=..."
                    value={redirectUrlInput}
                    onChange={(e) => setRedirectUrlInput(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    After authorizing, copy the entire URL from your browser address bar
                  </p>
                </div>

                <Button
                  onClick={handleSubmitRedirectUrl}
                  disabled={!redirectUrlInput.trim() || isSubmittingCallback}
                  className="w-full"
                >
                  {isSubmittingCallback ? 'Connecting...' : 'Submit and Connect'}
                </Button>

                {oauthStatus.status === 'error' && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                    <p className="text-sm text-destructive">{oauthStatus.message}</p>
                  </div>
                )}
              </div>
            ) : (
              // Loading state
              <div className="text-center py-8">
                <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm text-muted-foreground">Initializing authentication...</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeviceAuth(false);
                setPkceAuthUrl(null);
                setRedirectUrlInput('');
                setDeviceAuthStatus('pending');
                setIsSubmittingCallback(false);
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
