"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgents, type UIAgent } from "@/lib/use-agents";
import { DynamicIcon } from "@/components/dynamic-icon";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

function NavLink({
  href,
  icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-800 text-white"
          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
      }`}
    >
      <span className="w-5 text-center">{icon}</span>
      {label}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { agents, loading } = useAgents();

  // Filter agents for sidebar (exclude quorum which has its own link)
  const sidebarAgents = agents.filter(a => a.name !== 'quorum');

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* App Title */}
      <div className="flex items-center gap-2 px-4 py-5">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="text-zinc-300"
        >
          <path
            d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-lg font-semibold tracking-tight">
          The Quorum
        </span>
      </div>

      <Separator className="bg-zinc-800" />

      <ScrollArea className="flex-1 px-3 py-4">
        {/* The Quorum Council Link */}
        <Link
          href="/quorum"
          onClick={onNavigate}
          className={`mb-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
            pathname === "/quorum"
              ? "bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-amber-500/20 text-white"
              : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
          }`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 text-[10px] font-bold text-white">
            Q
          </span>
          The Quorum
        </Link>

        <Separator className="my-2 bg-zinc-800" />

        {/* Main Nav */}
        <nav className="flex flex-col gap-1">
          <NavLink
            href="/"
            active={pathname === "/"}
            onClick={onNavigate}
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            }
            label="Dashboard"
          />
          <NavLink
            href="/tasks"
            active={pathname === "/tasks"}
            onClick={onNavigate}
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            }
            label="Tasks"
          />
          <NavLink
            href="/observations"
            active={pathname === "/observations"}
            onClick={onNavigate}
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            }
            label="Observations"
          />
          <NavLink
            href="/documents"
            active={pathname === "/documents"}
            onClick={onNavigate}
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            }
            label="Documents"
          />
          <NavLink
            href="/settings"
            active={pathname === "/settings"}
            onClick={onNavigate}
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            }
            label="Settings"
          />
        </nav>

        <Separator className="my-4 bg-zinc-800" />

        {/* Agents Section */}
        <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Agents
        </div>
        <nav className="flex flex-col gap-1">
          {loading ? (
            <div className="px-3 py-2 text-sm text-zinc-500">Loading agents...</div>
          ) : sidebarAgents.length === 0 ? (
            <div className="px-3 py-2 text-sm text-zinc-500">No agents available</div>
          ) : (
            sidebarAgents.map((agent) => {
              const agentPath = `/agents/${agent.name}`;
              const isActive = pathname === agentPath;
              return (
                <div key={agent.name} className="flex items-center gap-1">
                  <Link
                    href={agentPath}
                    onClick={onNavigate}
                    className={`flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-zinc-800 text-white"
                        : agent.enabled
                        ? "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                        : "text-zinc-600 hover:bg-zinc-900 hover:text-zinc-400"
                    }`}
                  >
                    <DynamicIcon
                      name={agent.icon}
                      className="h-4 w-4"
                      size={16}
                    />
                    <span className="truncate">{agent.displayName}</span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-zinc-500 hover:text-zinc-200"
                    asChild
                  >
                    <Link
                      href={`/chat/${agent.name}`}
                      onClick={onNavigate}
                      title={`Chat with ${agent.displayName}`}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      </svg>
                    </Link>
                  </Button>
                </div>
              );
            })
          )}
        </nav>
      </ScrollArea>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-[260px] shrink-0 border-r border-zinc-800 md:block">
      <SidebarContent />
    </aside>
  );
}

export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-14 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-zinc-300 hover:text-white"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] p-0 bg-zinc-950 border-zinc-800">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <span className="text-sm font-semibold text-zinc-100">The Quorum</span>
    </header>
  );
}
