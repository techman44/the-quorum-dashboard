"use client";

import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { fetchAgent, type UIAgent } from "@/lib/use-agents";

export interface DocumentAnalysis {
  id: string;
  event_type: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  agent_name: string;
}

interface AnalysisModalProps {
  analysis: DocumentAnalysis | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnalysisModal({
  analysis,
  open,
  onOpenChange,
}: AnalysisModalProps) {
  const [agent, setAgent] = useState<UIAgent | null>(null);

  useEffect(() => {
    if (analysis?.agent_name) {
      fetchAgent(analysis.agent_name).then(setAgent);
    }
  }, [analysis?.agent_name]);

  if (!analysis) return null;

  const agentColor = agent?.color ?? "#6B7280";
  const agentDisplayName = agent?.displayName ?? analysis.agent_name;

  function formatTimestamp(date: Date) {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Simple markdown-like formatting
  function formatAnalysisText(text: string) {
    // Split into paragraphs
    const paragraphs = text.split(/\n\n+/);

    return paragraphs.map((paragraph, idx) => {
      // Check if it's a list item
      if (paragraph.trim().startsWith("- ") || paragraph.trim().startsWith("* ")) {
        const items = paragraph
          .split(/\n/)
          .filter((line) => line.trim().startsWith("- ") || line.trim().startsWith("* "));

        return (
          <ul key={idx} className="list-disc list-inside space-y-1 mb-4">
            {items.map((item, i) => (
              <li key={i} className="text-zinc-300">
                {item.replace(/^[-*]\s+/, "")}
              </li>
            ))}
          </ul>
        );
      }

      // Check if it's a heading
      if (paragraph.trim().startsWith("#")) {
        const level = paragraph.match(/^#+/)?.[0].length ?? 1;
        const text = paragraph.replace(/^#+\s+/, "");
        const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
        const sizes = {
          h1: "text-xl font-bold",
          h2: "text-lg font-semibold",
          h3: "text-base font-semibold",
        };

        return (
          <Tag
            key={idx}
            className={`${sizes[level === 1 ? "h1" : level === 2 ? "h2" : "h3"]} text-zinc-100 mt-6 mb-2`}
          >
            {text}
          </Tag>
        );
      }

      // Regular paragraph
      return (
        <p key={idx} className="text-zinc-300 mb-4 leading-relaxed">
          {paragraph}
        </p>
      );
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl bg-zinc-950 border-zinc-800 text-zinc-100 max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full shrink-0"
              style={{ backgroundColor: agentColor }}
            />
            <DialogTitle className="pr-6">{agentDisplayName}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-4">
          <span>Analysis for:</span>
          <span className="text-zinc-300 font-medium">
            {analysis.title}
          </span>
          <span className="mx-2">•</span>
          <span>{formatTimestamp(analysis.created_at)}</span>
        </div>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="prose prose-invert prose-sm max-w-none">
            {formatAnalysisText(analysis.description)}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
