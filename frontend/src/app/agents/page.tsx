"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTagFilter } from "@/providers/tag-filter-provider";
import { useWorkspace } from "@/providers/workspace-provider";
import { agentsApi } from "@/lib/api/agents";
import type { AgentOut } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { TagBadge } from "@/components/ui/tag-badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import {
  Bot, X, MoreHorizontal, Pencil, Copy, Trash2,
  Wrench, Cpu, Cog, Calendar, MessageSquareText,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getToolsList(a: AgentOut): string[] {
  if (!a.tools_config) return [];
  const tc = a.tools_config;
  const tools: string[] = [];
  if (Array.isArray(tc)) {
    tc.forEach((item: Record<string, unknown>) => {
      if (item.type === "web_search") tools.push("web_search");
      else if (Array.isArray(item.allowed_tools)) tools.push(...(item.allowed_tools as string[]));
      else if (item.name) tools.push(item.name as string);
    });
  } else if (tc.allowed_tools && Array.isArray(tc.allowed_tools)) {
    tools.push(...(tc.allowed_tools as string[]));
  }
  return tools;
}

function truncatePrompt(prompt: string | null, lines = 2): string {
  if (!prompt) return "";
  const split = prompt.split("\n").slice(0, lines);
  const text = split.join("\n");
  return text.length < prompt.length ? text + "..." : text;
}

// ---------------------------------------------------------------------------
// Agent Card (index-only, click navigates)
// ---------------------------------------------------------------------------

function AgentCard({ agent, onDelete }: { agent: AgentOut; onDelete: () => void }) {
  const router = useRouter();
  const tools = getToolsList(agent);
  const toolCount = tools.length;
  const hasPrompt = !!agent.system_prompt;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="bg-card rounded-lg border border-border p-5 transition-all hover:shadow-md hover:border-brand/30 cursor-pointer group"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-stop-propagation]")) return;
        router.push(`/agents/${agent.id}`);
      }}
    >
      {/* Top row: name + badges + menu */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-foreground truncate">{agent.name}</h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-[var(--tag-blue-bg)] text-[var(--tag-blue-text)]">
              <Cpu size={11} />
              {agent.model}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-[var(--tag-gray-bg)] text-[var(--tag-gray-text)]">
              <Cog size={11} />
              {agent.executor_type}
            </span>
          </div>

          {agent.tags && agent.tags.length > 0 && (
            <div className="flex gap-1 mt-1.5">
              {agent.tags.map((t) => (
                <TagBadge key={t} tag={t} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0" data-stop-propagation>
          <MoreMenu
            open={menuOpen}
            onToggle={() => setMenuOpen(!menuOpen)}
            onClose={() => setMenuOpen(false)}
            items={[
              { label: "View", icon: <Bot size={14} />, onClick: () => { setMenuOpen(false); router.push(`/agents/${agent.id}`); } },
              { label: "Edit", icon: <Pencil size={14} />, onClick: () => { setMenuOpen(false); router.push(`/agents/${agent.id}?edit=1`); } },
              { label: "Clone", icon: <Copy size={14} />, onClick: () => { setMenuOpen(false); router.push(`/agents/new?clone=${agent.id}`); } },
              { label: "Delete", icon: <Trash2 size={14} />, onClick: () => { setMenuOpen(false); onDelete(); }, destructive: true },
            ]}
          />
        </div>
      </div>

      {/* Info row */}
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2">
        <div className="min-w-0 space-y-2">
          {hasPrompt && (
            <div className="flex items-start gap-1.5">
              <MessageSquareText size={13} className="text-muted-light mt-0.5 shrink-0" />
              <p className="text-xs text-muted font-mono leading-relaxed line-clamp-2 whitespace-pre-wrap break-words">
                {truncatePrompt(agent.system_prompt, 2)}
              </p>
            </div>
          )}

          {toolCount > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Wrench size={13} className="text-muted-light shrink-0" />
              <span className="text-xs font-semibold text-muted">{toolCount} tools:</span>
              {tools.slice(0, 6).map((t, i) => (
                <span key={i} className="inline-block bg-[var(--tag-green-bg)] text-[var(--tag-green-text)] text-[10px] px-1.5 py-px rounded font-mono">
                  {t}
                </span>
              ))}
              {tools.length > 6 && (
                <span className="text-[10px] text-muted-light">+{tools.length - 6} more</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-end">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-light whitespace-nowrap">
            <Calendar size={11} />
            {formatDate(agent.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Index Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const { tag } = useTagFilter();
  const { organizationId, projectId, workspaceReady } = useWorkspace();
  const queryClient = useQueryClient();
  const [deleteModal, setDeleteModal] = useState<{ id: number; name: string } | null>(null);

  const { data: agents = [], isLoading, isError, error } = useQuery({
    queryKey: ["agents", organizationId, projectId, tag],
    queryFn: () => agentsApi.list(tag || undefined),
    enabled: workspaceReady,
  });
  const showLoading = !workspaceReady || isLoading;

  const deleteMutation = useMutation({
    mutationFn: (id: number) => agentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setDeleteModal(null);
    },
  });

  return (
    <>
      <PageHeader title="Agent Configurations">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{agents.length} agent{agents.length !== 1 ? "s" : ""}</span>
          <Link
            href="/agents/new"
            className="btn-subtle btn-subtle-primary no-underline"
          >
            + New Agent
          </Link>
        </div>
      </PageHeader>

      {showLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="skeleton h-5 w-40" />
                <div className="skeleton h-5 w-20 rounded-md" />
                <div className="skeleton h-5 w-24 rounded-md" />
              </div>
              <div className="skeleton h-3 w-3/4 mb-2" />
              <div className="skeleton h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="bg-card rounded-lg border border-border py-16 text-center">
          <p className="text-muted text-sm mb-3">
            Failed to load agents: {(error as Error).message}
          </p>
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-card rounded-lg border border-border py-16 text-center">
          <Bot size={40} className="mx-auto text-muted-light mb-3" />
          <p className="text-muted text-sm mb-3">No agents found. Create one to get started.</p>
          <Link
            href="/agents/new"
            className="btn-subtle btn-subtle-primary no-underline"
          >
            + New Agent
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              onDelete={() => setDeleteModal({ id: a.id, name: a.name })}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center modal-backdrop" onClick={(e) => e.target === e.currentTarget && setDeleteModal(null)}>
          <div className="bg-card border border-border rounded-xl w-[420px] p-6 shadow-2xl modal-content">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-foreground">Delete Agent</h3>
              <button className="p-1.5 rounded-lg text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors" onClick={() => setDeleteModal(null)}>
                <X size={18} />
              </button>
            </div>
            <p className="mb-6 text-foreground">
              Delete <strong>{deleteModal.name}</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button className="btn-subtle" onClick={() => setDeleteModal(null)}>Cancel</button>
              <button
                className="btn-subtle btn-subtle-danger"
                onClick={() => deleteMutation.mutate(deleteModal.id)}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// MoreMenu (reused inline)
// ---------------------------------------------------------------------------

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}

function MoreMenu({ open, onToggle, onClose, items }: { open: boolean; onToggle: () => void; onClose: () => void; items: MenuItem[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  return (
    <div className="relative" ref={ref} data-stop-propagation>
      <button
        className="p-1.5 rounded-lg text-muted-light opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-[var(--surface-hover)] transition-all duration-150"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-card border border-border rounded-lg shadow-lg z-20 py-1 modal-content">
          {items.map((item) => (
            <button
              key={item.label}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                item.destructive
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground hover:bg-[var(--surface-hover)]"
              }`}
              onClick={(e) => { e.stopPropagation(); item.onClick(); }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
