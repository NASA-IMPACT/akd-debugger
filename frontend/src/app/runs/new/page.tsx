"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Copy, Expand } from "lucide-react";
import { suitesApi } from "@/lib/api/suites";
import { agentsApi } from "@/lib/api/agents";
import { runsApi } from "@/lib/api/runs";
import { copyMarkdownTable } from "@/lib/markdown-table";
import { PageHeader } from "@/components/layout/page-header";
import type { QueryOut, RunCreate, RunCostPreviewOut, RunCostPreviewRecordOut } from "@/lib/types";

type PickMode = "top" | "bottom" | "random";

export default function NewRunPage() {
  const router = useRouter();

  const [suiteId, setSuiteId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [label, setLabel] = useState("");
  const [tags, setTags] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [batchSize, setBatchSize] = useState("10");
  const [repeat, setRepeat] = useState("1");
  const [queryMode, setQueryMode] = useState<"all" | "select">("all");
  const [queries, setQueries] = useState<QueryOut[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pickN, setPickN] = useState("");
  const [pickMode, setPickMode] = useState<PickMode>("top");
  const pickDebounce = useRef<ReturnType<typeof setTimeout>>(null);
  const [costPreview, setCostPreview] = useState<RunCostPreviewOut | null>(
    null,
  );
  const [activePreviewId, setActivePreviewId] = useState<number | null>(null);
  const [showExistingDetails, setShowExistingDetails] = useState(false);
  const [showExistingFloating, setShowExistingFloating] = useState(false);
  const [copiedTable, setCopiedTable] = useState<"" | "cost" | "usage">("");

  const { data: suites = [] } = useQuery({
    queryKey: ["suites-list"],
    queryFn: () => suitesApi.list(),
  });
  const { data: agents = [] } = useQuery({
    queryKey: ["agents-list"],
    queryFn: () => agentsApi.list(),
  });
  const selectedSuiteNum = parseInt(suiteId, 10);
  const selectedAgentNum = parseInt(agentId, 10);
  const repeatNum = parseInt(repeat, 10) || 1;
  const selectedAgent = agents.find((a) => a.id === selectedAgentNum);
  const selectedSuite = suites.find((s) => s.id === selectedSuiteNum);
  const formatUsd = (amount: number) => `$${amount.toFixed(2)}`;

  const { data: previewRecords = [] } = useQuery({
    queryKey: ["cost-previews-existing", selectedSuiteNum, selectedAgentNum],
    queryFn: () => runsApi.listPreviewCosts(200),
    enabled: Number.isFinite(selectedSuiteNum) && Number.isFinite(selectedAgentNum),
  });

  const existingCompletedPreview = useMemo(() => {
    const filtered = previewRecords.filter(
      (p) =>
        p.suite_id === selectedSuiteNum &&
        p.agent_config_id === selectedAgentNum &&
        p.status === "completed",
    );
    if (filtered.length === 0) return null;
    return filtered.sort((a, b) => {
      const aTime = new Date(a.completed_at || a.created_at).getTime();
      const bTime = new Date(b.completed_at || b.created_at).getTime();
      return bTime - aTime;
    })[0];
  }, [previewRecords, selectedSuiteNum, selectedAgentNum]);

  const estimatedFromSample = useMemo(() => {
    if (!existingCompletedPreview) return 0;
    const totalQueries =
      selectedSuite?.query_count || existingCompletedPreview.total_query_count || 0;
    return existingCompletedPreview.sample_cost_usd * totalQueries * repeatNum;
  }, [existingCompletedPreview, selectedSuite?.query_count, repeatNum]);

  // Load queries when suite changes
  useEffect(() => {
    if (!suiteId) {
      queueMicrotask(() => {
        setQueries([]);
        setSelectedIds(new Set());
      });
      return;
    }
    suitesApi.get(parseInt(suiteId)).then((s) => {
      setQueries(s.queries || []);
      setSelectedIds(new Set((s.queries || []).map((q) => q.id)));
    });
  }, [suiteId]);

  const selectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(queries.map((q) => q.id)) : new Set());
      setPickN("");
    },
    [queries],
  );

  const applyPick = useCallback(
    (mode: PickMode, n: number) => {
      if (!n || n < 1) return;
      const count = Math.min(n, queries.length);
      if (mode === "top") {
        setSelectedIds(new Set(queries.slice(0, count).map((q) => q.id)));
      } else if (mode === "bottom") {
        setSelectedIds(new Set(queries.slice(-count).map((q) => q.id)));
      } else {
        const indices = new Set<number>();
        while (indices.size < count)
          indices.add(Math.floor(Math.random() * queries.length));
        setSelectedIds(new Set([...indices].map((i) => queries[i].id)));
      }
    },
    [queries],
  );

  const handlePickN = useCallback(
    (val: string) => {
      setPickN(val);
      if (pickDebounce.current) clearTimeout(pickDebounce.current);
      pickDebounce.current = setTimeout(() => {
        const n = parseInt(val);
        if (n > 0) applyPick(pickMode, n);
      }, 200);
    },
    [pickMode, applyPick],
  );

  const handlePickMode = useCallback(
    (mode: PickMode) => {
      setPickMode(mode);
      const n = parseInt(pickN);
      if (n > 0) applyPick(mode, n);
    },
    [pickN, applyPick],
  );

  const toggleQuery = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const createMutation = useMutation({
    mutationFn: (body: RunCreate) => runsApi.create(body),
    onSuccess: (runs) => {
      router.push(`/runs/${runs[0].id}`);
    },
    onError: (err: Error) => {
      alert(err.message || "Error creating run");
    },
  });

  const previewMutation = useMutation({
    mutationFn: (body: RunCreate) => runsApi.startPreviewCost(body),
    onSuccess: (preview) => {
      setActivePreviewId(preview.id);
    },
    onError: (err: Error) => {
      alert(err.message || "Error generating cost preview");
    },
  });

  const { data: polledPreview } = useQuery({
    queryKey: ["cost-preview-status-ready", activePreviewId],
    queryFn: () => runsApi.getPreviewCost(activePreviewId as number),
    enabled: activePreviewId !== null,
    refetchInterval: 2500,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    const preview = polledPreview as RunCostPreviewRecordOut | undefined;
    if (!preview) return;
    if (preview.status === "completed") {
      queueMicrotask(() => {
        setCostPreview(preview as unknown as RunCostPreviewOut);
        setActivePreviewId(null);
      });
    } else if (preview.status === "failed") {
      queueMicrotask(() => {
        alert(preview.error_message || "Cost preview failed");
        setActivePreviewId(null);
      });
    }
  }, [polledPreview]);

  const approveMutation = useMutation({
    mutationFn: (previewId: number) =>
      runsApi.approvePreviewAndStart(previewId),
    onSuccess: (runs) => {
      router.push(`/runs/${runs[0].id}`);
    },
    onError: (err: Error) => {
      alert(err.message || "Error starting run");
    },
  });

  const buildBody = (): RunCreate => {
    const body: RunCreate = {
      suite_id: parseInt(suiteId),
      agent_config_id: parseInt(agentId),
      label,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      batch_size: parseInt(batchSize),
      repeat: parseInt(repeat) || 1,
    };
    if (outputDir.trim()) body.output_dir = outputDir.trim();
    if (queryMode === "select") body.query_ids = [...selectedIds];
    return body;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (queryMode === "select" && selectedIds.size === 0) {
      alert("Select at least one query");
      return;
    }
    const body = buildBody();
    if (selectedAgent?.executor_type === "openai_agents") {
      previewMutation.mutate(body);
      return;
    }
    createMutation.mutate(body);
  };

  const copyExistingCostTable = async (preview: RunCostPreviewRecordOut) => {
    await copyMarkdownTable({
      headers: ["Cost Line", "Amount (USD)"],
      align: ["left", "right"],
      rows: [
        ["Input", (preview.cost_breakdown.input_cost_usd || 0).toFixed(2)],
        ["Cached Input", (preview.cost_breakdown.cached_input_cost_usd || 0).toFixed(2)],
        ["Output", (preview.cost_breakdown.output_cost_usd || 0).toFixed(2)],
        ["Reasoning", (preview.cost_breakdown.reasoning_output_cost_usd || 0).toFixed(2)],
        ["Web Search", (preview.cost_breakdown.web_search_cost_usd || 0).toFixed(2)],
        ["**Total (sample)**", `**${(preview.sample_cost_usd || 0).toFixed(2)}**`],
      ],
    });
    setCopiedTable("cost");
    setTimeout(() => setCopiedTable(""), 1200);
  };

  const copyExistingUsageTable = async (preview: RunCostPreviewRecordOut) => {
    await copyMarkdownTable({
      headers: ["Usage Metric", "Total"],
      align: ["left", "right"],
      rows: [
        ["Input tokens", Math.round(preview.usage_totals.input_tokens || 0)],
        ["Cached tokens", Math.round(preview.usage_totals.cached_tokens || 0)],
        ["Output tokens", Math.round(preview.usage_totals.output_tokens || 0)],
        ["Reasoning tokens", Math.round(preview.usage_totals.reasoning_tokens || 0)],
        ["Web search calls", Math.round(preview.usage_totals.web_search_calls || 0)],
        ["Sample size", preview.sample_size],
        ["Estimated calls", preview.estimated_total_calls],
      ],
    });
    setCopiedTable("usage");
    setTimeout(() => setCopiedTable(""), 1200);
  };

  const renderExistingPreviewTables = (preview: RunCostPreviewRecordOut) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-light uppercase tracking-wide">Cost Table</div>
        <button
          type="button"
          onClick={() => copyExistingCostTable(preview)}
          className="btn-subtle text-xs"
          title="Copy cost table (Markdown)"
          aria-label="Copy cost table"
        >
          {copiedTable === "cost" ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <div className="bg-[var(--surface-hover)] rounded-lg border border-border overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-black/5 text-muted-light uppercase tracking-wide">
            <tr>
              <th className="text-left p-2 font-semibold">Cost Line</th>
              <th className="text-right p-2 font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border/60">
              <td className="p-2">Input</td>
              <td className="p-2 text-right">{formatUsd(preview.cost_breakdown.input_cost_usd || 0)}</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="p-2">Cached Input</td>
              <td className="p-2 text-right">{formatUsd(preview.cost_breakdown.cached_input_cost_usd || 0)}</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="p-2">Output</td>
              <td className="p-2 text-right">{formatUsd(preview.cost_breakdown.output_cost_usd || 0)}</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="p-2">Reasoning</td>
              <td className="p-2 text-right">{formatUsd(preview.cost_breakdown.reasoning_output_cost_usd || 0)}</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="p-2">Web Search</td>
              <td className="p-2 text-right">{formatUsd(preview.cost_breakdown.web_search_cost_usd || 0)}</td>
            </tr>
            <tr className="border-t border-border/60 bg-black/5">
              <td className="p-2 font-semibold">Total (sample)</td>
              <td className="p-2 text-right font-semibold">{formatUsd(preview.sample_cost_usd)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-light uppercase tracking-wide">Usage Table</div>
        <button
          type="button"
          onClick={() => copyExistingUsageTable(preview)}
          className="btn-subtle text-xs"
          title="Copy usage table (Markdown)"
          aria-label="Copy usage table"
        >
          {copiedTable === "usage" ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <div className="bg-[var(--surface-hover)] rounded-lg border border-border overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-black/5 text-muted-light uppercase tracking-wide">
            <tr>
              <th className="text-left p-2 font-semibold">Usage Metric</th>
              <th className="text-right p-2 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border/60">
              <td className="p-2">Input tokens</td>
              <td className="p-2 text-right">{Math.round(preview.usage_totals.input_tokens || 0).toLocaleString()}</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="p-2">Cached tokens</td>
              <td className="p-2 text-right">{Math.round(preview.usage_totals.cached_tokens || 0).toLocaleString()}</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="p-2">Output tokens</td>
              <td className="p-2 text-right">{Math.round(preview.usage_totals.output_tokens || 0).toLocaleString()}</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="p-2">Reasoning tokens</td>
              <td className="p-2 text-right">{Math.round(preview.usage_totals.reasoning_tokens || 0).toLocaleString()}</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="p-2">Web search calls</td>
              <td className="p-2 text-right">{Math.round(preview.usage_totals.web_search_calls || 0).toLocaleString()}</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="p-2">Sample size</td>
              <td className="p-2 text-right">{preview.sample_size.toLocaleString()} queries</td>
            </tr>
            <tr className="border-t border-border/60">
              <td className="p-2">Estimated calls</td>
              <td className="p-2 text-right">{preview.estimated_total_calls.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="Start New Benchmark Run" backHref="/" />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <div className="bg-card rounded-lg border border-border p-6">
          <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-semibold text-sm text-muted mb-1">
              Dataset
            </label>
            <select
              className="w-full px-2.5 py-1.5 border border-border bg-[var(--surface-hover)] rounded-md text-[13px] text-foreground focus:border-brand outline-none"
              value={suiteId}
              onChange={(e) => setSuiteId(e.target.value)}
              required
            >
              <option value="">Select a dataset...</option>
              {suites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.query_count} queries)
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block font-semibold text-sm text-muted mb-1">
              Agent
            </label>
            <select
              className="w-full px-2.5 py-1.5 border border-border bg-[var(--surface-hover)] rounded-md text-[13px] text-foreground focus:border-brand outline-none"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              required
            >
              <option value="">Select an agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.model})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block font-semibold text-sm text-muted mb-1">
              Label
            </label>
            <input
              className="w-full px-2.5 py-1.5 border border-border bg-[var(--surface-hover)] rounded-md text-[13px] text-foreground focus:border-brand outline-none"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              placeholder="e.g. NC Run 3"
            />
          </div>

          <div className="mb-4">
            <label className="block font-semibold text-sm text-muted mb-1">
              Tags (comma-separated)
            </label>
            <input
              className="w-full px-2.5 py-1.5 border border-border bg-[var(--surface-hover)] rounded-md text-[13px] text-foreground focus:border-brand outline-none"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. astro-team, v1"
            />
          </div>

          <div className="mb-4">
            <label className="block font-semibold text-sm text-muted mb-1">
              Output Directory
            </label>
            <input
              className="w-full px-2.5 py-1.5 border border-border bg-[var(--surface-hover)] rounded-md text-[13px] text-foreground focus:border-brand outline-none"
              value={outputDir}
              onChange={(e) => setOutputDir(e.target.value)}
              placeholder="~/akd_data/<label>"
            />
            <span className="text-xs text-muted-light">
              Leave blank for default: ~/akd_data/&lt;label&gt;
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-semibold text-sm text-muted mb-1">
                Batch Size
              </label>
              <select
                className="w-full px-2.5 py-1.5 border border-border bg-[var(--surface-hover)] rounded-md text-[13px] text-foreground focus:border-brand outline-none"
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="15">15</option>
                <option value="20">20</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-sm text-muted mb-1">
                Repeat
              </label>
              <input
                type="number"
                className="w-full px-2.5 py-1.5 border border-border bg-[var(--surface-hover)] rounded-md text-[13px] text-foreground focus:border-brand outline-none"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                min={1}
                max={10}
              />
              <span className="text-xs text-muted-light">
                Run the benchmark N times (max 3 in parallel)
              </span>
            </div>
          </div>

          <div className="mb-4">
            <label className="block font-semibold text-sm text-muted mb-2">
              Queries
            </label>
            <div className="flex gap-4 mb-2">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="queryMode"
                  checked={queryMode === "all"}
                  onChange={() => setQueryMode("all")}
                />{" "}
                All
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="queryMode"
                  checked={queryMode === "select"}
                  onChange={() => setQueryMode("select")}
                />{" "}
                Select specific
              </label>
            </div>

            {queryMode === "select" && (
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-[var(--surface-hover)] rounded-lg border border-border">
                  <button
                    type="button"
                    className="btn-subtle text-xs font-semibold"
                    onClick={() => selectAll(true)}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="btn-subtle text-xs font-semibold"
                    onClick={() => selectAll(false)}
                  >
                    Deselect All
                  </button>
                  <span className="w-px h-6 bg-border" />
                  <span className="text-xs font-semibold text-muted">
                    Pick
                  </span>
                  <input
                    type="number"
                    className="w-16 px-2 py-1.5 border border-border bg-card rounded-md text-xs text-center"
                    value={pickN}
                    onChange={(e) => handlePickN(e.target.value)}
                    min={1}
                    placeholder="N"
                  />
                  <div className="flex border border-border rounded-md overflow-hidden">
                    {(["top", "bottom", "random"] as PickMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`btn-subtle text-xs font-semibold ${pickMode === m ? "btn-subtle-primary" : ""}`}
                        onClick={() => handlePickMode(m)}
                      >
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </div>
                  <span className="ml-auto text-xs text-muted-light">
                    {selectedIds.size} of {queries.length} selected
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-1 max-h-[300px] overflow-y-auto border border-border rounded-lg p-2 bg-[var(--surface-hover)]">
                  {queries.map((q) => (
                    <label
                      key={q.id}
                      className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-card cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(q.id)}
                        onChange={() => toggleQuery(q.id)}
                      />
                      <span className="font-semibold text-muted-light shrink-0">
                        Q{q.ordinal}:
                      </span>
                      <span className="truncate">{q.query_text}</span>
                    </label>
                  ))}
                  {queries.length === 0 && (
                    <div className="p-4 text-center text-muted-light text-sm">
                      Select a dataset first
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t border-border">
            <Link
              href="/"
              className="btn-subtle no-underline"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="btn-subtle btn-subtle-primary disabled:opacity-50"
              disabled={
                createMutation.isPending ||
                previewMutation.isPending ||
                approveMutation.isPending ||
                activePreviewId !== null
              }
            >
              {createMutation.isPending ||
              previewMutation.isPending ||
              approveMutation.isPending
                ? "Starting..."
                : "Start Run"}
            </button>
          </div>
          </form>
        </div>

        <aside className="bg-card rounded-lg border border-border p-4 xl:sticky xl:top-24">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">Existing Cost Preview</h3>
            <button
              type="button"
              onClick={() => setShowExistingFloating(true)}
              disabled={!existingCompletedPreview}
              title="Expand to floating view"
              className="btn-subtle h-7 w-7 p-0 disabled:cursor-not-allowed"
            >
              <Expand size={14} />
            </button>
          </div>
          {!suiteId || !agentId ? (
            <p className="text-sm text-muted">Select dataset and agent to see an existing cost breakdown.</p>
          ) : selectedAgent?.executor_type !== "openai_agents" ? (
            <p className="text-sm text-muted">Cost previews apply to `openai_agents` executors.</p>
          ) : !existingCompletedPreview ? (
            <p className="text-sm text-muted">No completed cost preview found for this dataset + agent pair.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="text-muted">
                <div>{selectedSuite?.name ?? `Dataset #${selectedSuiteNum}`}</div>
                <div>{selectedAgent?.name ?? `Agent #${selectedAgentNum}`}</div>
                <div className="mt-1">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      existingCompletedPreview.approved_at
                        ? "bg-[var(--tag-green-bg)] text-[var(--tag-green-text)]"
                        : "bg-[var(--grade-partial-bg)] text-[var(--grade-partial-text)]"
                    }`}
                  >
                    {existingCompletedPreview.approved_at ? "Approved" : "Not approved yet"}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg border border-border bg-[var(--surface-hover)]">
                  <div className="text-xs text-muted-light">Estimated total</div>
                  <div className="font-semibold">{formatUsd(estimatedFromSample)}</div>
                </div>
                <div className="p-2 rounded-lg border border-border bg-[var(--surface-hover)]">
                  <div className="text-xs text-muted-light">Sample cost</div>
                  <div className="font-semibold">{formatUsd(existingCompletedPreview.sample_cost_usd)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowExistingDetails((v) => !v)}
                  className="btn-subtle text-xs font-semibold"
                >
                  {showExistingDetails ? "Minimize details" : "Show details"}
                </button>
              </div>
              {showExistingDetails && renderExistingPreviewTables(existingCompletedPreview)}
              <div className="text-xs text-muted-light">
                Completed at: {existingCompletedPreview.completed_at ? new Date(existingCompletedPreview.completed_at).toLocaleString() : "—"}
              </div>
              <div className="text-xs text-muted-light">
                Approved at: {existingCompletedPreview.approved_at ? new Date(existingCompletedPreview.approved_at).toLocaleString() : "Not approved yet"}
              </div>
            </div>
          )}
        </aside>
      </div>

      {costPreview && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={(e) => e.target === e.currentTarget && setCostPreview(null)}
        >
          <div className="bg-card border border-border rounded-lg w-[92%] max-w-[560px] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold mb-2">Cost Preview</h3>
            <p className="text-sm text-muted mb-4">
              Sampled {costPreview.sample_size} random queries (ordinals:{" "}
              {costPreview.sampled_query_ordinals.join(", ")}) and estimated
              full run cost.
            </p>
            <div className="space-y-2 text-sm mb-4">
              <div>
                <strong>Model:</strong> {costPreview.model}
              </div>
              <div>
                <strong>Total queries:</strong> {costPreview.total_query_count}{" "}
                x repeat {costPreview.repeat} ={" "}
                {costPreview.estimated_total_calls} calls
              </div>
              <div>
                <strong>Sample cost:</strong> $
                {costPreview.sample_cost_usd.toFixed(6)} {costPreview.currency}
              </div>
              <div>
                <strong>Estimated total:</strong>{" "}
                <span className="font-bold">
                  ${(costPreview.sample_cost_usd * costPreview.total_query_count * costPreview.repeat).toFixed(2)}{" "}
                  {costPreview.currency}
                </span>
              </div>
              <div>
                <strong>Input tokens:</strong>{" "}
                {costPreview.usage_totals.input_tokens || 0}
              </div>
              <div>
                <strong>Output tokens:</strong>{" "}
                {costPreview.usage_totals.output_tokens || 0}
              </div>
              <div>
                <strong>Cached tokens:</strong>{" "}
                {costPreview.usage_totals.cached_tokens || 0}
              </div>
              <div>
                <strong>Reasoning tokens:</strong>{" "}
                {costPreview.usage_totals.reasoning_tokens || 0}
              </div>
              <div>
                <strong>Web search calls:</strong>{" "}
                {costPreview.usage_totals.web_search_calls || 0}
              </div>
              <div className="text-xs text-muted-light">
                Pricing version: {costPreview.pricing_version}
              </div>
            </div>
            {costPreview.missing_model_pricing && (
              <div className="mb-4 text-sm text-destructive">
                Pricing for this model is missing in `data/openai_pricing.json`.
                Update pricing first to continue.
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                className="btn-subtle"
                onClick={() => setCostPreview(null)}
              >
                Cancel
              </button>
              <button
                className="btn-subtle btn-subtle-primary disabled:opacity-50"
                disabled={
                  costPreview.missing_model_pricing || approveMutation.isPending
                }
                onClick={() => approveMutation.mutate(costPreview.id)}
              >
                {approveMutation.isPending
                  ? "Starting..."
                  : "Approve and Start"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(previewMutation.isPending || activePreviewId !== null) && !costPreview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-lg w-[92%] max-w-[520px] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold mb-2">Running Cost Preview</h3>
            <p className="text-sm text-muted">
              Running up to 3 random sample queries in parallel to estimate your
              full run cost.
            </p>
            <div className="mt-4 h-2 bg-[var(--surface-hover)] rounded-full overflow-hidden">
              <div className="h-full w-1/2 bg-brand rounded-full animate-pulse" />
            </div>
            <p className="mt-3 text-xs text-muted-light">
              This can take a few seconds depending on model latency and tool
              usage. You can leave this page and check it later in Cost Previews.
            </p>
          </div>
        </div>
      )}

      {showExistingFloating && existingCompletedPreview && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowExistingFloating(false)}
        >
          <div className="bg-card border border-border rounded-lg w-full max-w-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Cost + Usage Breakdown</h3>
              <button
                type="button"
                className="btn-subtle text-xs font-semibold"
                onClick={() => setShowExistingFloating(false)}
              >
                Close
              </button>
            </div>
            {renderExistingPreviewTables(existingCompletedPreview)}
          </div>
        </div>
      )}
    </>
  );
}
