'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Mail,
  Calendar,
  Database,
  FileText,
  Users,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface GogAccount {
  email: string;
  services: string[];
  status?: 'authenticated' | 'expired' | 'error';
}

interface GogConfig {
  credentialsPath: string;
  configDir: string;
  accounts: string[];
  defaultAccount: string;
  enabledServices: string[];
}

interface GogStatus {
  installed: boolean;
  version?: string;
  error?: string;
}

const SERVICE_OPTIONS = [
  { value: 'gmail', label: 'Gmail', icon: Mail, color: 'bg-red-500' },
  { value: 'calendar', label: 'Calendar', icon: Calendar, color: 'bg-blue-500' },
  { value: 'drive', label: 'Drive', icon: Database, color: 'bg-yellow-500' },
  { value: 'contacts', label: 'Contacts', icon: Users, color: 'bg-green-500' },
  { value: 'sheets', label: 'Sheets', icon: FileText, color: 'bg-green-600' },
  { value: 'docs', label: 'Docs', icon: FileText, color: 'bg-blue-600' },
];

export function GogSettings() {
  const [status, setStatus] = useState<GogStatus | null>(null);
  const [accounts, setAccounts] = useState<GogAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  // Form state
  const [credentialsPath, setCredentialsPath] = useState('');
  const [configDir, setConfigDir] = useState('~/.config/gog');
  const [defaultAccount, setDefaultAccount] = useState('');

  // Add account form
  const [newAccountEmail, setNewAccountEmail] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>(['gmail']);

  // Test form
  const [testAccount, setTestAccount] = useState('');
  const [testService, setTestService] = useState('gmail');

  const { success, error: toastError } = useToast();

  useEffect(() => {
    checkStatus();
    loadAccounts();
  }, []);

  async function checkStatus() {
    try {
      const res = await fetch('/api/gog');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('Failed to check GOG status:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAccounts() {
    try {
      const res = await fetch('/api/gog?action=accounts');
      const data = await res.json();

      if (data.accounts) {
        setAccounts(data.accounts);
        if (data.accounts.length > 0 && !defaultAccount) {
          setDefaultAccount(data.accounts[0].email);
        }
      }
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  }

  async function setupCredentials() {
    setIsSaving(true);
    try {
      const res = await fetch('/api/gog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auth_setup',
          credentialsPath,
          configDir,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        success('Credentials configured', data.message || 'GOG credentials set up successfully');
        setShowSetup(false);
      } else {
        toastError('Setup failed', data.error || 'Failed to configure credentials');
      }
    } catch (err) {
      toastError('Setup failed', 'Failed to configure GOG credentials');
    } finally {
      setIsSaving(false);
    }
  }

  async function addAccount() {
    if (!newAccountEmail) {
      toastError('Email required', 'Please enter a Google account email');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/gog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auth_add',
          email: newAccountEmail,
          services: selectedServices.join(','),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        success('Account added', `Account ${newAccountEmail} added. Complete OAuth in browser if prompted.`);
        setNewAccountEmail('');
        setSelectedServices(['gmail']);
        setShowAddAccount(false);
        loadAccounts();
      } else {
        toastError('Failed to add account', data.error || 'Could not add account');
      }
    } catch (err) {
      toastError('Failed to add account', 'Could not add Google account');
    } finally {
      setIsSaving(false);
    }
  }

  async function testConnection() {
    if (!testAccount) {
      toastError('Account required', 'Please select an account to test');
      return;
    }

    setIsTesting(true);
    try {
      const res = await fetch(`/api/gog?action=test&account=${encodeURIComponent(testAccount)}&service=${testService}`);
      const data = await res.json();

      if (data.connected) {
        success('Connection successful', `Connected to ${testService} as ${testAccount}`);
      } else {
        toastError('Connection failed', data.error || 'Could not connect to Google service');
      }
    } catch (err) {
      toastError('Connection failed', 'Could not test connection');
    } finally {
      setIsTesting(false);
    }
  }

  async function removeAccount(email: string) {
    // This would need to be implemented on the backend
    toastError('Not implemented', 'Account removal must be done via CLI: gog auth remove ' + email);
  }

  function toggleService(service: string) {
    setSelectedServices(prev =>
      prev.includes(service)
        ? prev.filter(s => s !== service)
        : [...prev, service]
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-purple-500" />
              GOG - Google Workspace Integration
            </CardTitle>
            <CardDescription>
              Manage Gmail, Calendar, Drive, Contacts, Sheets, and Docs via gogcli
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={checkStatus} disabled={isLoading}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Installation Status */}
        <div className="mb-6">
          <div className="flex items-center gap-3 p-4 rounded-lg border">
            {status?.installed ? (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-500" />
            )}
            <div className="flex-1">
              <p className="font-medium">
                {status?.installed ? 'GOG CLI Installed' : 'GOG CLI Not Found'}
              </p>
              <p className="text-sm text-muted-foreground">
                {status?.installed
                  ? `Version: ${status.version || 'unknown'}`
                  : 'Install with: brew install steipete/tap/gogcli'
                }
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="accounts">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Accounts Tab */}
          <TabsContent value="accounts" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Configured Accounts</h3>
                <p className="text-sm text-muted-foreground">
                  {accounts.length} Google account{accounts.length !== 1 ? 's' : ''} configured
                </p>
              </div>
              <div className="flex gap-2">
                <Dialog open={showAddAccount} onOpenChange={setShowAddAccount}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Account
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Google Account</DialogTitle>
                      <DialogDescription>
                        Add a Google account to use with GOG services
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Google Account Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@gmail.com"
                          value={newAccountEmail}
                          onChange={(e) => setNewAccountEmail(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Services to Enable</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {SERVICE_OPTIONS.map((service) => {
                            const Icon = service.icon;
                            const isSelected = selectedServices.includes(service.value);
                            return (
                              <button
                                key={service.value}
                                type="button"
                                onClick={() => toggleService(service.value)}
                                className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
                                  isSelected
                                    ? 'bg-primary/10 border-primary'
                                    : 'bg-background hover:bg-muted'
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                                <span className="text-sm">{service.label}</span>
                                {isSelected && (
                                  <CheckCircle2 className="w-3 h-3 ml-auto text-primary" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowAddAccount(false)}>
                          Cancel
                        </Button>
                        <Button onClick={addAccount} disabled={isSaving || !newAccountEmail}>
                          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          Add Account
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {accounts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No Google accounts configured yet.</p>
                <p className="text-sm mt-1">Add an account to get started.</p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Services</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => (
                      <TableRow key={account.email}>
                        <TableCell className="font-medium">{account.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {account.services?.map((service) => {
                              const serviceInfo = SERVICE_OPTIONS.find(s => s.value === service);
                              if (!serviceInfo) return null;
                              const Icon = serviceInfo.icon;
                              return (
                                <Badge key={service} variant="secondary" className="text-xs">
                                  <Icon className="w-3 h-3 mr-1" />
                                  {serviceInfo.label}
                                </Badge>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {account.status === 'authenticated' ? (
                            <Badge className="bg-green-600 text-white">Active</Badge>
                          ) : account.status === 'expired' ? (
                            <Badge variant="destructive">Expired</Badge>
                          ) : (
                            <Badge variant="secondary">Unknown</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAccount(account.email)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Test Connection */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Test Connection</h4>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label htmlFor="test-account">Account</Label>
                  <Select value={testAccount} onValueChange={setTestAccount}>
                    <SelectTrigger id="test-account">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.email} value={account.email}>
                          {account.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label htmlFor="test-service">Service</Label>
                  <Select value={testService} onValueChange={setTestService}>
                    <SelectTrigger id="test-service">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_OPTIONS.map((service) => (
                        <SelectItem key={service.value} value={service.value}>
                          {service.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={testConnection} disabled={isTesting || !testAccount}>
                  {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Test
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Services Tab */}
          <TabsContent value="services" className="space-y-4">
            <div>
              <h3 className="font-medium mb-3">Available Services</h3>
              <div className="grid gap-3">
                {SERVICE_OPTIONS.map((service) => {
                  const Icon = service.icon;
                  const accountsWithService = accounts.filter(
                    (a) => a.services?.includes(service.value)
                  );

                  return (
                    <div
                      key={service.value}
                      className="flex items-center justify-between p-4 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-md ${service.color} text-white`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium">{service.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {accountsWithService.length > 0
                              ? `Available on ${accountsWithService.length} account(s)`
                              : 'Not configured on any account'}
                          </p>
                        </div>
                      </div>
                      {accountsWithService.length > 0 && (
                        <Badge variant="secondary">
                          {accountsWithService.map((a) => a.email).join(', ')}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                How services work
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                Each Google account can have different services enabled. Add services when
                configuring an account, or re-authenticate to add more services.
              </p>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <div className="space-y-4">
              <h3 className="font-medium">GOG Configuration</h3>

              <div className="space-y-2">
                <Label htmlFor="config-dir">Config Directory</Label>
                <Input
                  id="config-dir"
                  value={configDir}
                  onChange={(e) => setConfigDir(e.target.value)}
                  placeholder="~/.config/gog"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Directory where GOG stores OAuth tokens and configuration
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="default-account">Default Account</Label>
                <Select value={defaultAccount} onValueChange={setDefaultAccount}>
                  <SelectTrigger id="default-account">
                    <SelectValue placeholder="Select default account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.email} value={account.email}>
                        {account.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Default account to use for operations when not specified
                </p>
              </div>

              <Dialog open={showSetup} onOpenChange={setShowSetup}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <SettingsIcon className="w-4 h-4 mr-2" />
                    Configure Credentials
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Configure GOG Credentials</DialogTitle>
                    <DialogDescription>
                      Set up Google OAuth credentials for GOG
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="credentials-path">Client Secret Path</Label>
                      <Input
                        id="credentials-path"
                        value={credentialsPath}
                        onChange={(e) => setCredentialsPath(e.target.value)}
                        placeholder="/path/to/client_secret.json"
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Path to client_secret.json from Google Cloud Console
                      </p>
                    </div>

                    <div className="rounded-lg border border-blue-500/50 bg-blue-500/10 p-3">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                        Setup Instructions
                      </p>
                      <ol className="text-xs text-blue-600 dark:text-blue-500 mt-2 list-decimal list-inside space-y-1">
                        <li>Go to Google Cloud Console</li>
                        <li>Create OAuth 2.0 credentials</li>
                        <li>Download client_secret.json</li>
                        <li>Enter the path above</li>
                      </ol>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowSetup(false)}>
                        Cancel
                      </Button>
                      <Button onClick={setupCredentials} disabled={isSaving || !credentialsPath}>
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Configure
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
