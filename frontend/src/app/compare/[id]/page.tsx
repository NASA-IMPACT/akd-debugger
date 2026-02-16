"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ResultOut, RunDetailOut } from "@/lib/types";
import { comparisonsApi } from "@/lib/api/comparisons";
import { analyticsApi } from "@/lib/api/analytics";
import { resultsApi } from "@/lib/api/results";
import { runsApi } from "@/lib/api/runs";
import { exportApi } from "@/lib/api/export";
import { PageHeader } from "@/components/layout/page-header";
import { GradingView } from "@/components/grading/grading-view";
import { CompareDashboard } from "@/components/dashboard/compare-dashboard";
import { QueryComparisonMatrix } from "@/components/dashboard/query-comparison-matrix";
import { ConfigView } from "@/components/runs/config-view";
import { TraceComparePanel } from "@/components/tool-calls/trace-compare-panel";
import { AgentDropdown } from "@/components/grading/agent-dropdown";
import { cn } from "@/lib/utils";
import { GitCompareArrows } from "lucide-react";

type Mode = "grading" | "dashboard" | "compare" | "config" | "traces";

export default function CompareDetailPage() {
  const params = useParams();
  const comparisonId = Number(params.id);
  const [mode, setMode] = useState<Mode>("grading");

  const {
    data: comparison,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["comparison", comparisonId],
    queryFn: () => comparisonsApi.get(comparisonId),
    enabled: !isNaN(comparisonId),
  });

  const runIds = comparison?.run_ids || [];
  const { data: compareAnalytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["compare-analytics", runIds.join(",")],
    queryFn: () => analyticsApi.compare(runIds),
    enabled: mode === "compare" && runIds.length > 1,
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="Compare Runs" />
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <div className="skeleton h-5 w-48 mx-auto mb-2" />
          <div className="skeleton h-4 w-32 mx-auto" />
        </div>
      </>
    );
  }

  if (isError || !comparison) {
    return (
      <>
        <PageHeader title="Compare Runs" />
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <GitCompareArrows
            size={40}
            className="mx-auto text-muted-light mb-3"
          />
          <p className="text-muted text-sm">Comparison not found.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={comparison.name || `Comparison #${comparison.id}`}
        subtitle={
          <div className="text-sm text-muted mt-1">
            Dataset: {comparison.suite_name} &bull; {comparison.run_count} runs
          </div>
        }
      />

      <div className="flex gap-1 mb-4 bg-[var(--surface-hover)] border border-border rounded-lg p-1 w-fit">
        {(
          ["grading", "dashboard", "compare", "traces", "config"] as Mode[]
        ).map((m) => (
          <button
            key={m}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              mode === m
                ? "bg-[var(--surface-hover)] text-foreground"
                : "text-muted hover:text-foreground hover:bg-[var(--surface)]",
            )}
            onClick={() => setMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {mode === "grading" && (
        <>
          <GradingView runIds={runIds} compare />
          <ExportBar runIds={runIds} />
        </>
      )}
      {mode === "dashboard" && (
        <>
          <CompareDashboard runIds={runIds} />
          <ExportBar runIds={runIds} />
        </>
      )}
      {mode === "compare" && (
        <>
          {analyticsLoading ? (
            <div className="text-center py-8 text-muted">
              Loading comparison matrix...
            </div>
          ) : (
            <QueryComparisonMatrix
              runs={compareAnalytics?.runs || []}
              queryGrades={compareAnalytics?.query_grades || []}
            />
          )}
          <TraceComparisonCard runIds={runIds} />
          <ExportBar runIds={runIds} />
        </>
      )}
      {mode === "traces" && (
        <div className="bg-card rounded-lg border border-border p-8 text-center text-sm text-muted">
          Trace comparison has been moved to the Compare tab (below Query
          Comparison Matrix).
        </div>
      )}
      {mode === "config" && <ConfigView runIds={runIds} />}
    </>
  );
}

interface GradingData {
  runs: RunDetailOut[];
  results: Record<number, ResultOut[]>;
  versionsByBaseResult: Record<number, ResultOut[]>;
}

function TraceComparisonCard({ runIds }: { runIds: number[] }) {
  const qKey = ["grading", runIds.join(",")];
  const { data, isLoading } = useQuery<GradingData>({
    queryKey: qKey,
    queryFn: async () => {
      const fetchedRuns: RunDetailOut[] = [];
      const fetchedResults: Record<number, ResultOut[]> = {};
      const fetchedVersions: Record<number, ResultOut[]> = {};
      await Promise.all(
        runIds.map(async (id) => {
          const [run, res] = await Promise.all([
            runsApi.get(id),
            resultsApi.listFamilies(id),
          ]);
          fetchedRuns.push(run);
          fetchedResults[id] = res.results;
          Object.assign(fetchedVersions, res.versions_by_base_result);
        }),
      );
      const runMap = Object.fromEntries(fetchedRuns.map((r) => [r.id, r]));
      const orderedRuns = runIds.map((id) => runMap[id]).filter(Boolean);
      return {
        runs: orderedRuns,
        results: fetchedResults,
        versionsByBaseResult: fetchedVersions,
      };
    },
    staleTime: 30_000,
  });

  const runs = data?.runs ?? [];
  const results = data?.results;

  // Build allResults: queryId → runId → ResultOut
  const { allResults, queryIds } = useMemo(() => {
    const all: Record<number, Record<number, ResultOut>> = {};
    const scopedResults = results ?? {};
    for (const rid of runIds) {
      (scopedResults[rid] || []).forEach((r) => {
        if (!all[r.query_id]) all[r.query_id] = {};
        all[r.query_id][rid] = r;
      });
    }
    const qids = Object.keys(all)
      .map(Number)
      .sort((a, b) => a - b);
    return { allResults: all, queryIds: qids };
  }, [runIds, results]);

  const [selectedQueryIdx, setSelectedQueryIdx] = useState(0);
  const [leftIdx, setLeftIdx] = useState(0);
  const [rightIdx, setRightIdx] = useState(Math.min(1, runIds.length - 1));

  if (isLoading) {
    return <div className="text-center py-8 text-muted">Loading traces...</div>;
  }

  if (queryIds.length === 0) {
    return (
      <div className="text-center py-8 text-muted">No results available.</div>
    );
  }

  const activeQueryId = queryIds[selectedQueryIdx] ?? queryIds[0];
  const qResults = allResults[activeQueryId] || {};
  const leftRun = runs[leftIdx];
  const rightRun = runs[rightIdx];
  const leftResult = leftRun ? qResults[leftRun.id] : undefined;
  const rightResult = rightRun ? qResults[rightRun.id] : undefined;

  // Build resultsByRun for AgentDropdown (needs single result per run for selected query)
  const resultsByRun: Record<number, ResultOut> = {};
  for (const run of runs) {
    if (qResults[run.id]) resultsByRun[run.id] = qResults[run.id];
  }

  return (
    <div
      className="bg-card rounded-lg border border-border flex flex-col mb-6"
      style={{ height: "70vh" }}
    >
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 flex-wrap">
        <label className="text-sm font-medium text-muted shrink-0">
          Query:
        </label>
        <select
          className="px-2 py-1 border border-border rounded-md text-sm bg-card text-foreground outline-none focus:border-brand"
          value={selectedQueryIdx}
          onChange={(e) => setSelectedQueryIdx(Number(e.target.value))}
        >
          {queryIds.map((qid, i) => {
            const firstResult = Object.values(allResults[qid])[0];
            const label = firstResult?.query?.query_text
              ? `#${firstResult.query.ordinal}: ${firstResult.query.query_text.slice(0, 60)}${firstResult.query.query_text.length > 60 ? "..." : ""}`
              : `Query ${qid}`;
            return (
              <option key={qid} value={i}>
                {label}
              </option>
            );
          })}
        </select>
        {runs.length > 2 && (
          <>
            <div className="w-40">
              <AgentDropdown
                runs={runs}
                resultsByRun={resultsByRun}
                selectedIdx={leftIdx}
                onChange={setLeftIdx}
              />
            </div>
            <span className="text-muted text-sm">vs</span>
            <div className="w-40">
              <AgentDropdown
                runs={runs}
                resultsByRun={resultsByRun}
                selectedIdx={rightIdx}
                onChange={setRightIdx}
              />
            </div>
          </>
        )}
      </div>

      <TraceComparePanel
        left={{
          label: leftRun?.label ?? "Left",
          toolCalls: leftResult?.tool_calls ?? null,
          reasoning: leftResult?.reasoning ?? null,
        }}
        right={{
          label: rightRun?.label ?? "Right",
          toolCalls: rightResult?.tool_calls ?? null,
          reasoning: rightResult?.reasoning ?? null,
        }}
        queryLabel={`Query #${allResults[activeQueryId] ? (Object.values(allResults[activeQueryId])[0]?.query?.ordinal ?? activeQueryId) : activeQueryId}`}
      />
    </div>
  );
}

function ExportBar({ runIds }: { runIds: number[] }) {
  return (
    <div className="flex gap-2 mt-6 pt-4 border-t border-border">
      <a
        href={exportApi.htmlUrl(runIds)}
        target="_blank"
        className="px-4 py-2 bg-card border border-border rounded-md font-medium text-sm hover:bg-[var(--surface-hover)] no-underline text-foreground transition-colors"
      >
        Share as HTML
      </a>
      <a
        href={exportApi.csvUrl(runIds)}
        className="px-4 py-2 bg-card border border-border rounded-md font-medium text-sm hover:bg-[var(--surface-hover)] no-underline text-foreground transition-colors"
      >
        Export CSV
      </a>
      <a
        href={exportApi.jsonUrl(runIds)}
        className="px-4 py-2 bg-card border border-border rounded-md font-medium text-sm hover:bg-[var(--surface-hover)] no-underline text-foreground transition-colors"
      >
        Export JSON
      </a>
    </div>
  );
}
