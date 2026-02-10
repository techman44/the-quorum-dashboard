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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Puzzle,
  Settings as SettingsIcon,
  CheckCircle2,
  AlertCircle,
  FileText,
  Mail,
  Send,
  Workflow,
  Calendar,
  Database,
  MessageSquare,
  Zap,
  Clock,
  Loader2,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Icon mapping for skills
const iconMap: Record<string, React.ElementType> = {
  'file-text': FileText,
  'mail': Mail,
  'send': Send,
  'workflow': Workflow,
  'calendar': Calendar,
  'database': Database,
  'message-square': MessageSquare,
  'zap': Zap,
  'clock': Clock,
  puzzle: Puzzle,
};

interface SkillSetting {
  key: string;
  label: string;
  type: 'text' | 'password' | 'boolean' | 'number' | 'select' | 'path' | 'cron';
  description?: string;
  defaultValue?: unknown;
  required?: boolean;
  options?: { label: string; value: string | number | boolean }[];
  placeholder?: string;
}

interface Skill {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  category: string;
  enabled: boolean;
  capabilities: string[];
  settingDefinitions: SkillSetting[];
  requiredTools: string[];
  agentAccess: string[];
  isConfigured: boolean;
  hasErrors?: boolean;
  tags: string[];
  updatedAt?: string;
}

interface CategorySkills {
  category: string;
  skills: Skill[];
}

const CATEGORIES = [
  { id: 'storage', name: 'Storage', icon: Database, color: 'text-blue-500' },
  { id: 'communication', name: 'Communication', icon: MessageSquare, color: 'text-green-500' },
  { id: 'automation', name: 'Automation', icon: Workflow, color: 'text-purple-500' },
  { id: 'integration', name: 'Integrations', icon: Zap, color: 'text-yellow-500' },
  { id: 'productivity', name: 'Productivity', icon: Calendar, color: 'text-orange-500' },
  { id: 'monitoring', name: 'Monitoring', icon: Clock, color: 'text-pink-500' },
];

interface SkillsManagementProps {
  initialSkills?: Skill[];
}

export function SkillsManagement({ initialSkills }: SkillsManagementProps) {
  const [skills, setSkills] = useState<Skill[]>(initialSkills || []);
  const [isLoading, setIsLoading] = useState(!initialSkills);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsValues, setSettingsValues] = useState<Record<string, unknown>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const { success, error: toastError } = useToast();

  useEffect(() => {
    if (!initialSkills) {
      fetchSkills();
    }
  }, []);

  async function fetchSkills() {
    setIsLoading(true);
    try {
      const res = await fetch('/api/skills?includeDisabled=true');
      const data = await res.json();
      setSkills(data.skills || []);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
      toastError('Failed to load skills', 'Could not load skills from server.');
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleSkillEnabled(skillId: string, enabled: boolean) {
    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });

      if (res.ok) {
        setSkills(prev =>
          prev.map(s =>
            s.id === skillId ? { ...s, enabled } : s
          )
        );
        success(
          enabled ? 'Skill enabled' : 'Skill disabled',
          `${skills.find(s => s.id === skillId)?.name} has been ${enabled ? 'enabled' : 'disabled'}.`
        );
      }
    } catch (err) {
      console.error('Failed to toggle skill:', err);
      toastError('Failed to update skill', 'Could not update skill state.');
    }
  }

  function openSkillSettings(skill: Skill) {
    setSelectedSkill(skill);
    // Initialize settings values with defaults
    const values: Record<string, unknown> = {};
    for (const setting of skill.settingDefinitions) {
      values[setting.key] = setting.defaultValue ?? '';
    }
    setSettingsValues(values);
    setIsDialogOpen(true);
  }

  async function saveSkillSettings() {
    if (!selectedSkill) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/skills/${selectedSkill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: settingsValues,
        }),
      });

      if (res.ok) {
        success('Settings saved', `${selectedSkill.name} settings have been saved.`);
        setIsDialogOpen(false);
        fetchSkills(); // Refresh to get updated isConfigured state
      } else {
        const data = await res.json();
        toastError('Failed to save settings', data.error || 'Could not save skill settings.');
      }
    } catch (err) {
      console.error('Failed to save skill settings:', err);
      toastError('Failed to save settings', 'Could not save skill settings.');
    } finally {
      setIsSaving(false);
    }
  }

  function renderSettingInput(setting: SkillSetting) {
    const value = settingsValues[setting.key];

    switch (setting.type) {
      case 'boolean':
        return (
          <div className="flex items-center gap-3">
            <Switch
              id={setting.key}
              checked={value === true}
              onCheckedChange={(checked) =>
                setSettingsValues(prev => ({ ...prev, [setting.key]: checked }))
              }
            />
            <Label htmlFor={setting.key}>{setting.label}</Label>
          </div>
        );

      case 'select':
        return (
          <div className="space-y-2">
            <Label htmlFor={setting.key}>{setting.label}</Label>
            <Select
              value={String(value ?? setting.defaultValue ?? '')}
              onValueChange={(val) =>
                setSettingsValues(prev => ({ ...prev, [setting.key]: val }))
              }
            >
              <SelectTrigger id={setting.key}>
                <SelectValue placeholder={setting.placeholder || `Select ${setting.label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {setting.options?.map((opt) => (
                  <SelectItem key={String(opt.value)} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {setting.description && (
              <p className="text-xs text-muted-foreground">{setting.description}</p>
            )}
          </div>
        );

      case 'password':
        return (
          <div className="space-y-2">
            <Label htmlFor={setting.key}>
              {setting.label}
              {setting.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={setting.key}
              type="password"
              value={String(value ?? '')}
              onChange={(e) =>
                setSettingsValues(prev => ({ ...prev, [setting.key]: e.target.value }))
              }
              placeholder={setting.placeholder}
            />
            {setting.description && (
              <p className="text-xs text-muted-foreground">{setting.description}</p>
            )}
          </div>
        );

      case 'path':
        return (
          <div className="space-y-2">
            <Label htmlFor={setting.key}>
              {setting.label}
              {setting.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <div className="flex gap-2">
              <Input
                id={setting.key}
                type="text"
                value={String(value ?? '')}
                onChange={(e) =>
                  setSettingsValues(prev => ({ ...prev, [setting.key]: e.target.value }))
                }
                placeholder={setting.placeholder}
                className="font-mono text-sm"
              />
            </div>
            {setting.description && (
              <p className="text-xs text-muted-foreground">{setting.description}</p>
            )}
          </div>
        );

      default:
        return (
          <div className="space-y-2">
            <Label htmlFor={setting.key}>
              {setting.label}
              {setting.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={setting.key}
              type={setting.type === 'number' ? 'number' : 'text'}
              value={String(value ?? '')}
              onChange={(e) =>
                setSettingsValues(prev => ({
                  ...prev,
                  [setting.key]: setting.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                }))
              }
              placeholder={setting.placeholder}
            />
            {setting.description && (
              <p className="text-xs text-muted-foreground">{setting.description}</p>
            )}
          </div>
        );
    }
  }

  // Group skills by category
  const groupedSkills = skills.reduce((acc, skill) => {
    if (!acc[skill.category]) {
      acc[skill.category] = [];
    }
    acc[skill.category].push(skill);
    return acc;
  }, {} as Record<string, Skill[]>);

  // Filter by selected category
  const filteredCategories = selectedCategory === 'all'
    ? Object.entries(groupedSkills)
    : Object.entries(groupedSkills).filter(([cat]) => cat === selectedCategory);

  const IconComponent = selectedSkill ? iconMap[selectedSkill.icon] || Puzzle : Puzzle;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Puzzle className="w-5 h-5 text-purple-500" />
              Skills Management
            </CardTitle>
            <CardDescription>
              Manage integration skills that agents can use
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchSkills} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Category filter tabs */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mb-6">
          <TabsList className="flex flex-wrap h-auto gap-2 bg-muted p-2">
            <TabsTrigger value="all" className="data-[state=active]:bg-background">
              All Skills
            </TabsTrigger>
            {CATEGORIES.map((cat) => (
              <TabsTrigger
                key={cat.id}
                value={cat.id}
                className="data-[state=active]:bg-background flex items-center gap-1.5"
              >
                <cat.icon className="w-3.5 h-3.5" />
                {cat.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Skills grid */}
        <div className="space-y-6">
          {filteredCategories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Puzzle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No skills found in this category</p>
            </div>
          ) : (
            filteredCategories.map(([category, categorySkills]) => {
              const categoryInfo = CATEGORIES.find(c => c.id === category);
              const CategoryIcon = categoryInfo?.icon || Puzzle;

              return (
                <div key={category} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CategoryIcon className={`w-4 h-4 ${categoryInfo?.color || 'text-gray-500'}`} />
                    <h3 className="text-sm font-semibold">{categoryInfo?.name || category}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {categorySkills.length}
                    </Badge>
                  </div>

                  <div className="grid gap-3">
                    {categorySkills.map((skill) => {
                      const SkillIcon = iconMap[skill.icon] || Puzzle;

                      return (
                        <div
                          key={skill.id}
                          className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                            skill.enabled ? 'bg-background' : 'bg-muted/50 opacity-75'
                          }`}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <div className={`p-2 rounded-md ${skill.enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                              <SkillIcon className={`w-5 h-5 ${skill.enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                            </div>

                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{skill.name}</h4>
                                {skill.enabled && skill.isConfigured && (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                )}
                                {skill.enabled && !skill.isConfigured && (
                                  <AlertCircle className="w-4 h-4 text-amber-500" />
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{skill.description}</p>

                              <div className="flex items-center gap-2 mt-1">
                                {skill.capabilities.slice(0, 3).map((cap) => (
                                  <Badge key={cap} variant="outline" className="text-xs">
                                    {cap}
                                  </Badge>
                                ))}
                                {skill.capabilities.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{skill.capabilities.length - 3}
                                  </Badge>
                                )}
                              </div>

                              {skill.agentAccess.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Available to: {skill.agentAccess.join(', ')}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Switch
                              checked={skill.enabled}
                              onCheckedChange={(checked) => toggleSkillEnabled(skill.id, checked)}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openSkillSettings(skill)}
                            >
                              Configure
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Skill Settings Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <IconComponent className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedSkill?.name}
                    {selectedSkill?.isConfigured && (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    )}
                  </DialogTitle>
                  <DialogDescription>{selectedSkill?.description}</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {selectedSkill?.settingDefinitions && selectedSkill.settingDefinitions.length > 0 ? (
                selectedSkill.settingDefinitions.map((setting) => (
                  <div key={setting.key}>
                    {renderSettingInput(setting)}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No configurable settings for this skill.
                </p>
              )}

              {selectedSkill?.requiredTools && selectedSkill.requiredTools.length > 0 && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Required tools
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    This skill requires: {selectedSkill.requiredTools.join(', ')}
                  </p>
                </div>
              )}

              {selectedSkill?.capabilities && selectedSkill.capabilities.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Capabilities</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedSkill.capabilities.map((cap) => (
                      <Badge key={cap} variant="secondary" className="text-xs">
                        {cap}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              {selectedSkill?.settingDefinitions && selectedSkill.settingDefinitions.length > 0 && (
                <Button onClick={saveSkillSettings} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save Settings
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
