'use client';

import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface DynamicIconProps {
  name: string;
  className?: string;
  size?: number;
}

/**
 * Dynamically render a lucide-react icon from its name string.
 * This allows icon names to be stored as strings in agent metadata
 * and rendered dynamically in the UI.
 */
export function DynamicIcon({ name, className, size = 16 }: DynamicIconProps) {
  // Try to get the icon from lucide-react
  const IconComponent = (LucideIcons as unknown as Record<string, LucideIcon>)[name];

  // If icon exists, render it
  if (IconComponent) {
    return <IconComponent className={className} width={size} height={size} />;
  }

  // Fallback: render a default icon
  const DefaultIcon = LucideIcons.Bot;
  return <DefaultIcon className={className} width={size} height={size} />;
}

/**
 * Get all available icon names from lucide-react for reference
 */
export function getAvailableIconNames(): string[] {
  return Object.keys(LucideIcons).filter(
    key => typeof (LucideIcons as Record<string, unknown>)[key] === 'function'
  );
}
