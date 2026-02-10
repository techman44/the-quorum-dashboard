'use client';

import { useState, useEffect, useTransition } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  FileText,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Settings,
  FolderOpen,
} from 'lucide-react';

interface ObsidianVault {
  name: string;
  path: string;
  isDefault: boolean;
}

interface ObsidianSettings {
  enabled: boolean;
  vaultPath: string;
  syncSchedule: string;
  autoSync: boolean;
  syncOnStart: boolean;
}

interface SyncStatus {
  vault: string;
  syncedNotes: number;
  vaultNotes: number;
  needsSync: boolean;
}

interface SearchResult {
  note: string;
  line: string;
  context: string;
}

export function ObsidianSettings() {
  const [settings, setSettings] = useState<ObsidianSettings>({
    enabled: false,
    vaultPath: '',
    syncSchedule: '0 */6 * * *',
    autoSync: true,
    syncOnStart: true,
  });

  const [vaults, setVaults] = useState<ObsidianVault[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    added?: number;
    updated?: number;
  } | null>(null);
  const [obsidianCliInstalled, setObsidianCliInstalled] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Load vaults on mount
  useEffect(() => {
    fetchVaults();
    fetchSyncStatus();
    fetchSettings();
  }, []);

  async function fetchVaults() {
    try {
      const res = await fetch('/api/obsidian/vaults');
      const data = await res.json();
      setVaults(data.vaults || []);
      setObsidianCliInstalled(data.obsidianCliInstalled || false);

      // Set default vault path if not set
      if (!settings.vaultPath && data.vaults?.length > 0) {
        const defaultVault = data.vaults.find((v: ObsidianVault) => v.isDefault) || data.vaults[0];
        setSettings((prev) => ({ ...prev, vaultPath: defaultVault.path }));
      }
    } catch (error) {
      console.error('Failed to fetch vaults:', error);
    }
  }

  async function fetchSyncStatus() {
    try {
      const res = await fetch('/api/obsidian/sync');
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
    }
  }

  async function fetchSettings() {
    try {
      const res = await fetch('/api/settings/obsidian');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch Obsidian settings:', error);
    }
  }

  async function handleSaveSettings() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/settings/obsidian', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        });

        if (res.ok) {
          setSyncResult({ success: true, message: 'Settings saved successfully' });
          setTimeout(() => setSyncResult(null), 3000);
        } else {
          setSyncResult({ success: false, message: 'Failed to save settings' });
        }
      } catch (error) {
        setSyncResult({ success: false, message: 'Failed to save settings' });
      }
    });
  }

  async function handleSync() {
    setIsSyncing(true);
    setSyncResult(null);

    try {
      const res = await fetch('/api/obsidian/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault: settings.vaultPath, limit: 100 }),
      });

      const data = await res.json();

      if (res.ok) {
        setSyncResult({
          success: true,
          message: `Synced ${data.result.added + data.result.updated} notes (${data.result.added} new, ${data.result.updated} updated)`,
          added: data.result.added,
          updated: data.result.updated,
        });
        fetchSyncStatus();
      } else {
        setSyncResult({
          success: false,
          message: data.error || 'Sync failed',
        });
      }
    } catch (error) {
      setSyncResult({
        success: false,
        message: 'Sync failed',
      });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;

    setIsSearching(true);

    try {
      const res = await fetch(`/api/obsidian/search-content?q=${encodeURIComponent(searchQuery)}&vault=${encodeURIComponent(settings.vaultPath || '')}`);
      const data = await res.json();
      setSearchResults(data.matches || []);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-500" />
              Obsidian Integration
            </CardTitle>
            <CardDescription>
              Connect your Obsidian vault for AI-powered search and sync
            </CardDescription>
          </div>
          {obsidianCliInstalled ? (
            <Badge className="bg-emerald-600">obsidian-cli installed</Badge>
          ) : (
            <Badge variant="destructive">obsidian-cli not found</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="settings">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="settings">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="sync">
              <RefreshCw className="w-4 h-4 mr-2" />
              Sync
            </TabsTrigger>
            <TabsTrigger value="search">
              <Search className="w-4 h-4 mr-2" />
              Search
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                id="obsidian-enabled"
                checked={settings.enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, enabled: checked }))
                }
              />
              <Label htmlFor="obsidian-enabled">Enable Obsidian Integration</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vault-path">Vault Path</Label>
              <div className="flex gap-2">
                <Input
                  id="vault-path"
                  value={settings.vaultPath}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, vaultPath: e.target.value }))
                  }
                  placeholder="/path/to/obsidian/vault"
                />
                <Select
                  value={vaults.find((v) => v.path === settings.vaultPath)?.name || ''}
                  onValueChange={(value) => {
                    const vault = vaults.find((v) => v.name === value);
                    if (vault) {
                      setSettings((prev) => ({ ...prev, vaultPath: vault.path }));
                    }
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select vault" />
                  </SelectTrigger>
                  <SelectContent>
                    {vaults.map((vault) => (
                      <SelectItem key={vault.path} value={vault.name}>
                        {vault.name} {vault.isDefault && '(default)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Your Obsidian vault directory. Notes will be indexed and searchable.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sync-schedule">Sync Schedule (cron)</Label>
              <Input
                id="sync-schedule"
                value={settings.syncSchedule}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, syncSchedule: e.target.value }))
                }
                placeholder="0 */6 * * *"
              />
              <p className="text-xs text-muted-foreground">
                How often to sync notes from your vault. Default: every 6 hours.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch
                  id="auto-sync"
                  checked={settings.autoSync}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, autoSync: checked }))
                  }
                />
                <Label htmlFor="auto-sync">Auto-sync on schedule</Label>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="sync-on-start"
                  checked={settings.syncOnStart}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, syncOnStart: checked }))
                  }
                />
                <Label htmlFor="sync-on-start">Sync on dashboard start</Label>
              </div>
            </div>

            {syncResult && (
              <div
                className={`flex items-center gap-2 p-3 rounded-md ${
                  syncResult.success
                    ? 'bg-green-950 border border-green-800 text-green-200'
                    : 'bg-red-950 border border-red-800 text-red-200'
                }`}
              >
                {syncResult.success ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span className="text-sm">{syncResult.message}</span>
              </div>
            )}

            <Button onClick={handleSaveSettings} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </TabsContent>

          {/* Sync Tab */}
          <TabsContent value="sync" className="space-y-4">
            {syncStatus && (
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border bg-muted/50 p-4 text-center">
                  <p className="text-2xl font-bold">{syncStatus.vaultNotes}</p>
                  <p className="text-xs text-muted-foreground">Vault Notes</p>
                </div>
                <div className="rounded-lg border bg-muted/50 p-4 text-center">
                  <p className="text-2xl font-bold">{syncStatus.syncedNotes}</p>
                  <p className="text-xs text-muted-foreground">Synced Notes</p>
                </div>
                <div className="rounded-lg border bg-muted/50 p-4 text-center">
                  <p className="text-2xl font-bold">
                    {syncStatus.needsSync ? syncStatus.vaultNotes - syncStatus.syncedNotes : 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Pending Sync</p>
                </div>
              </div>
            )}

            {syncStatus?.needsSync && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
                Your vault has notes that haven't been synced yet. Click sync to index them.
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={handleSync} disabled={isSyncing || !settings.vaultPath}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Notes'}
              </Button>
              <Button variant="outline" onClick={fetchSyncStatus}>
                Refresh Status
              </Button>
            </div>

            {syncResult && syncResult.success && (
              <div className="text-sm text-muted-foreground">
                Synced {syncResult.added || 0} new notes, updated {syncResult.updated || 0} existing notes.
              </div>
            )}
          </TabsContent>

          {/* Search Tab */}
          <TabsContent value="search" className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search note contents..."
                disabled={!settings.vaultPath}
              />
              <Button onClick={handleSearch} disabled={isSearching || !settings.vaultPath}>
                <Search className="w-4 h-4 mr-2" />
                {isSearching ? 'Searching...' : 'Search'}
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/30 max-h-[400px] overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {searchQuery ? 'No results found' : 'Enter a search query to find notes'}
                </div>
              ) : (
                <div className="divide-y">
                  {searchResults.map((result, index) => (
                    <div key={index} className="p-3 hover:bg-muted/50">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        {result.note}
                      </div>
                      <p
                        className="text-sm text-muted-foreground mt-1"
                        dangerouslySetInnerHTML={{ __html: result.context }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
