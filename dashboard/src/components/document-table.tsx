"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { QuorumDocumentWithEmbedding } from "@/lib/types";
import { deleteDocumentAction, triggerEmbedding } from "@/lib/actions";
import { useAgents, getAgentByName, type UIAgent } from "@/lib/use-agents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnalysisModal, type DocumentAnalysis } from "@/components/analysis-modal";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DocumentTableProps {
  documents: QuorumDocumentWithEmbedding[];
}

interface DocumentWithAnalyses extends QuorumDocumentWithEmbedding {
  analyses: DocumentAnalysis[];
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? "h-4 w-4"}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        className="opacity-25"
      />
      <path
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        fill="currentColor"
        className="opacity-75"
      />
    </svg>
  );
}

const PAGE_SIZE = 50;

export function DocumentTable({ documents }: DocumentTableProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const { agents, loading: agentsLoading } = useAgents({ includeDisabled: false });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewDoc, setViewDoc] = useState<QuorumDocumentWithEmbedding | null>(
    null
  );
  const [viewAnalysis, setViewAnalysis] = useState<DocumentAnalysis | null>(null);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [embedding, setEmbedding] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [documentsWithAnalyses, setDocumentsWithAnalyses] = useState<DocumentWithAnalyses[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch analyses for all documents on mount and when documents change
  useEffect(() => {
    async function fetchAnalyses() {
      setLoadingAnalyses(true);
      try {
        // Only fetch analyses for visible page to improve performance
        const docsWithAnalyses = documents.map((doc) => ({ ...doc, analyses: [] }));
        setDocumentsWithAnalyses(docsWithAnalyses);
      } catch (err) {
        console.error("Failed to fetch analyses:", err);
        setDocumentsWithAnalyses(documents.map((doc) => ({ ...doc, analyses: [] })));
      } finally {
        setLoadingAnalyses(false);
      }
    }

    fetchAnalyses();
  }, [documents]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, typeFilter]);

  const docTypes = Array.from(new Set(documents.map((d) => d.doc_type))).sort();

  const filtered = useMemo(() => {
    return documentsWithAnalyses.filter((doc) => {
      const matchesSearch = doc.title
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesType = typeFilter === "all" || doc.doc_type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [documentsWithAnalyses, search, typeFilter]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  async function handleDelete(docId: string) {
    setDeleting(docId);
    try {
      await deleteDocumentAction(docId);
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  async function handleEmbed(docId: string) {
    setEmbedding(docId);
    try {
      const result = await triggerEmbedding(docId);
      if (!result.success) {
        console.error("Embedding failed:", result.error);
      }
      router.refresh();
    } finally {
      setEmbedding(null);
    }
  }

  async function handleTriggerAgent(docId: string, agentName: string) {
    setAnalyzing(docId);
    try {
      const res = await fetch("/api/documents/trigger-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: docId, agent: agentName }),
      });
      const data = await res.json();
      const agent = getAgentByName(agents, agentName);
      if (!res.ok) {
        console.error("Agent trigger failed:", data.error);
        error(
          "Analysis Failed",
          `Failed to trigger ${agent?.displayName ?? agentName}`
        );
      } else {
        const doc = documents.find((d) => d.id === docId);
        success(
          `${agent?.displayName ?? agentName} Complete`,
          doc?.title ? `Analyzed "${doc.title}"` : "Document analyzed successfully"
        );
        // Refresh analyses after successful trigger
        const res = await fetch(`/api/documents/analyses?document_id=${docId}`);
        if (res.ok) {
          const data = await res.json();
          setDocumentsWithAnalyses((prev) =>
            prev.map((d) => (d.id === docId ? { ...d, analyses: data.analyses ?? [] } : d))
          );
        }
      }
      router.refresh();
    } catch (err) {
      console.error("Agent trigger error:", err);
      error("Network Error", "Failed to communicate with the server");
    } finally {
      setAnalyzing(null);
    }
  }

  function handleViewAnalysis(analysis: DocumentAnalysis) {
    setViewAnalysis(analysis);
    setAnalysisModalOpen(true);
  }

  function formatDate(date: Date) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function truncateText(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  }

  const typeColors: Record<string, string> = {
    note: "bg-blue-900/50 text-blue-300 border-blue-700",
    file: "bg-zinc-800 text-zinc-300 border-zinc-600",
    report: "bg-purple-900/50 text-purple-300 border-purple-700",
    reflection: "bg-amber-900/50 text-amber-300 border-amber-700",
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="bg-zinc-900 border-zinc-700 text-zinc-100 pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-700 text-zinc-100">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-700">
            <SelectItem value="all" className="text-zinc-100">
              All types
            </SelectItem>
            {docTypes.map((t) => (
              <SelectItem key={t} value={t} className="text-zinc-100">
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">Title</TableHead>
              <TableHead className="text-zinc-400">Type</TableHead>
              <TableHead className="text-zinc-400">Tags</TableHead>
              <TableHead className="text-zinc-400">Created</TableHead>
              <TableHead className="text-zinc-400 w-[200px]">Analysis</TableHead>
              <TableHead className="text-zinc-400">Embedding</TableHead>
              <TableHead className="text-zinc-400 text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow className="border-zinc-800">
                <TableCell
                  colSpan={7}
                  className="text-center text-zinc-500 py-8"
                >
                  {documents.length === 0
                    ? "No documents yet. Upload one to get started."
                    : "No documents match your search."}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((doc) => (
                <TableRow key={doc.id} className="border-zinc-800">
                  <TableCell>
                    <button
                      onClick={() => setViewDoc(doc)}
                      className="text-left text-zinc-100 hover:text-white hover:underline font-medium max-w-[300px] truncate block"
                      title={doc.title}
                    >
                      {doc.title}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        typeColors[doc.doc_type] ??
                        "bg-zinc-800 text-zinc-300 border-zinc-600"
                      }
                    >
                      {doc.doc_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap max-w-[200px]">
                      {(doc.tags ?? []).slice(0, 3).map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="bg-zinc-900 text-zinc-400 border-zinc-700 text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {(doc.tags ?? []).length > 3 && (
                        <span className="text-xs text-zinc-500">
                          +{doc.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm">
                    {formatDate(doc.created_at)}
                  </TableCell>
                  <TableCell>
                    {loadingAnalyses ? (
                      <div className="flex items-center justify-center">
                        <Spinner className="h-3 w-3 text-zinc-600" />
                      </div>
                    ) : doc.analyses.length === 0 ? (
                      <span className="text-xs text-zinc-600 italic">No analyses</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {doc.analyses.slice(0, 2).map((analysis) => {
                          const agent = getAgentByName(agents, analysis.agent_name);
                          return (
                            <button
                              key={analysis.id}
                              onClick={() => handleViewAnalysis(analysis)}
                              className="flex items-start gap-2 text-left group hover:bg-zinc-900 rounded px-1.5 py-1 transition-colors"
                              title="Click to view full analysis"
                            >
                              <div
                                className="w-2 h-2 rounded-full shrink-0 mt-1"
                                style={{ backgroundColor: agent?.color ?? "#6B7280" }}
                              />
                              <span className="text-xs text-zinc-400 group-hover:text-zinc-300 line-clamp-2">
                                {truncateText(analysis.description, 80)}
                              </span>
                            </button>
                          );
                        })}
                        {doc.analyses.length > 2 && (
                          <span className="text-xs text-zinc-600 pl-4">
                            +{doc.analyses.length - 2} more
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {doc.has_embedding ? (
                      <span title="Embedded" className="text-green-400">
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
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    ) : (
                      <span title="Pending" className="text-amber-400">
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
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Embed button - only shown when no embedding */}
                      {!doc.has_embedding && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEmbed(doc.id)}
                          disabled={embedding === doc.id}
                          className="text-zinc-400 hover:text-blue-400 h-8 px-2 text-xs"
                          title="Generate embedding"
                        >
                          {embedding === doc.id ? (
                            <Spinner className="h-3 w-3" />
                          ) : (
                            <>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="mr-1"
                              >
                                <circle cx="12" cy="12" r="3" />
                                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                              </svg>
                              Embed
                            </>
                          )}
                        </Button>
                      )}

                      {/* Analyze dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={analyzing === doc.id}
                            className="text-zinc-400 hover:text-purple-400 h-8 px-2 text-xs"
                            title="Analyze with agent"
                          >
                            {analyzing === doc.id ? (
                              <Spinner className="h-3 w-3" />
                            ) : (
                              <>
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="mr-1"
                                >
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                                </svg>
                                Analyze
                              </>
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-zinc-900 border-zinc-700"
                        >
                          {agentsLoading ? (
                            <DropdownMenuItem disabled>
                              Loading agents...
                            </DropdownMenuItem>
                          ) : agents.length === 0 ? (
                            <DropdownMenuItem disabled>
                              No agents available
                            </DropdownMenuItem>
                          ) : (
                            agents.map((agent) => (
                              <DropdownMenuItem
                                key={agent.name}
                                onClick={() =>
                                  handleTriggerAgent(doc.id, agent.name)
                                }
                                className="text-zinc-100 focus:bg-zinc-800 cursor-pointer"
                              >
                                <span
                                  className="inline-block w-2 h-2 rounded-full mr-2 shrink-0"
                                  style={{ backgroundColor: agent.color }}
                                />
                                {agent.displayName}
                              </DropdownMenuItem>
                            ))
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(doc.id)}
                        disabled={deleting === doc.id}
                        className="text-zinc-500 hover:text-red-400 h-8 w-8 p-0"
                        title="Delete document"
                      >
                        {deleting === doc.id ? (
                          <Spinner className="h-4 w-4" />
                        ) : (
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
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-500">
          Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} document
          {filtered.length !== 1 ? "s" : ""} {filtered.length !== documents.length && `(total: ${documents.length})`}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 px-2 bg-zinc-900 border-zinc-700 text-zinc-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-zinc-400">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 px-2 bg-zinc-900 border-zinc-700 text-zinc-100"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Analysis Modal */}
      <AnalysisModal
        analysis={viewAnalysis}
        open={analysisModalOpen}
        onOpenChange={setAnalysisModalOpen}
      />

      {/* Content View Dialog */}
      <Dialog open={!!viewDoc} onOpenChange={(v) => !v && setViewDoc(null)}>
        <DialogContent className="sm:max-w-2xl bg-zinc-950 border-zinc-800 text-zinc-100 max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="pr-6">{viewDoc?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 flex-wrap">
            {viewDoc && (
              <Badge
                variant="outline"
                className={
                  typeColors[viewDoc.doc_type] ??
                  "bg-zinc-800 text-zinc-300 border-zinc-600"
                }
              >
                {viewDoc.doc_type}
              </Badge>
            )}
            {viewDoc?.tags?.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="bg-zinc-900 text-zinc-400 border-zinc-700 text-xs"
              >
                {tag}
              </Badge>
            ))}
            {viewDoc && (
              <span className="text-xs text-zinc-500 ml-auto self-center">
                {formatDate(viewDoc.created_at)}
                {viewDoc.has_embedding ? " -- Embedded" : " -- Not embedded"}
              </span>
            )}
          </div>
          <ScrollArea className="max-h-[50vh]">
            <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-mono bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              {viewDoc?.content}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
