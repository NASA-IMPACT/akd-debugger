"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ResultOut,
  RunDetailOut,
  GradeValue,
  ToolCall,
} from "@/lib/types";
import { resultsApi } from "@/lib/api/results";
import { runsApi } from "@/lib/api/runs";
import { gradesApi } from "@/lib/api/grades";
import { computeGradeGroups, computeCompareGradeGroups } from "./grade-summary";
import type { GradeGroup } from "./grade-summary";
import { GradingCard } from "./grading-card";
import { CompareCard } from "./compare-card";
import { buildQueryNavItems, buildSingleRunNavItems } from "./query-nav";
import { ToolModal } from "@/components/tool-calls/tool-modal";
import { RefreshCw, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface SingleProps {
  runId: number;
  compare?: false;
}

interface CompareProps {
  runIds: number[];
  compare: true;
}

type Props = SingleProps | CompareProps;

interface ToolModalState {
  toolCalls: ToolCall[];
  idx: number;
  queryLabel: string;
  runLabel: string;
}

interface GradingData {
  runs: RunDetailOut[];
  results: Record<number, ResultOut[]>;
  versionsByBaseResult: Record<number, ResultOut[]>;
}

// --- localStorage cache helpers ---
function cacheKey(runIds: number[]) {
  return `grading-${runIds.join(",")}`;
}

function loadCache(runIds: number[]): GradingData | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(runIds));
    if (!raw) return undefined;
    return JSON.parse(raw) as GradingData;
  } catch {
    return undefined;
  }
}

function saveCache(runIds: number[], data: GradingData) {
  try {
    localStorage.setItem(cacheKey(runIds), JSON.stringify(data));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function GradingView(props: Props) {
  const isCompare = "compare" in props && props.compare;
  const runIds = isCompare ? props.runIds : [props.runId];
  const queryClient = useQueryClient();

  const [toolModal, _setToolModal] = useState<ToolModalState | null>(null);
  const toolModalRef = useRef<ToolModalState | null>(null);
  const setToolModal = useCallback((v: ToolModalState | null) => {
    toolModalRef.current = v;
    _setToolModal(v);
  }, []);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [lastFullyGradedQuery, setLastFullyGradedQuery] = useState<
    number | null
  >(null);
  const [activeQueryId, setActiveQueryId] = useState<number | null>(null);
  const [retryingResultIds, setRetryingResultIds] = useState<Set<number>>(
    new Set(),
  );
  const visibleQueries = useRef<Set<number>>(new Set());
  const isNavigating = useRef(false);
  const navTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Fetch all results and runs — data lives in React Query cache
  const qKey = ["grading", runIds.join(",")];
  const { data, isLoading, isFetching, isError } = useQuery<GradingData>({
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
      // Sort runs to match runIds order
      const runMap = Object.fromEntries(fetchedRuns.map((r) => [r.id, r]));
      const orderedRuns = runIds.map((id) => runMap[id]).filter(Boolean);
      const result = {
        runs: orderedRuns,
        results: fetchedResults,
        versionsByBaseResult: fetchedVersions,
      };
      saveCache(runIds, result);
      return result;
    },
    placeholderData: () => loadCache(runIds),
    staleTime: 30_000, // keep fresh for 30s before background refetch
  });

  const runs = data?.runs ?? [];
  const results = data?.results ?? {};
  const versionsByBaseResult = data?.versionsByBaseResult ?? {};
  const versionsByResultId = useMemo(() => {
    const byId: Record<number, ResultOut[]> = {};
    Object.values(versionsByBaseResult).forEach((family) => {
      family.forEach((version) => {
        byId[version.id] = family;
      });
    });
    return byId;
  }, [versionsByBaseResult]);

  // Compute data for compare mode
  const { allResults, queryIds: compareQueryIds } = useMemo(() => {
    if (!isCompare)
      return {
        allResults: {} as Record<number, Record<number, ResultOut>>,
        queryIds: [] as number[],
      };
    const all: Record<number, Record<number, ResultOut>> = {};
    for (const rid of runIds) {
      (results[rid] || []).forEach((r) => {
        if (!all[r.query_id]) all[r.query_id] = {};
        all[r.query_id][rid] = r;
      });
    }
    const qids = Object.keys(all)
      .map(Number)
      .sort((a, b) => a - b);
    return { allResults: all, queryIds: qids };
  }, [isCompare, runIds, results]);

  // Sorted results and query IDs for single-run mode
  const singleSortedResults = useMemo(() => {
    if (isCompare) return [];
    return (results[runIds[0]] || [])
      .slice()
      .sort((a, b) => a.query_id - b.query_id);
  }, [isCompare, results, runIds]);

  const gradeMutation = useMutation({
    mutationFn: ({
      resultId,
      grade,
    }: {
      resultId: number;
      grade: GradeValue;
    }) => gradesApi.upsert(resultId, { grade }),
    onSuccess: (gradeOut, { resultId }) => {
      // Optimistic update in React Query cache
      queryClient.setQueryData<GradingData>(qKey, (prev) => {
        if (!prev) return prev;
        const nextResults = { ...prev.results };
        for (const rid of runIds) {
          nextResults[rid] = (nextResults[rid] || []).map((r) =>
            r.id === resultId ? { ...r, grade: gradeOut } : r,
          );
        }
        const updated = { ...prev, results: nextResults };
        saveCache(runIds, updated);
        return updated;
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (resultId: number) => resultsApi.retry(resultId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
    },
  });

  const handleRetry = useCallback(
    (resultId: number) => {
      setRetryingResultIds((prev) => new Set(prev).add(resultId));
      retryMutation.mutate(resultId, {
        onSettled: () => {
          setRetryingResultIds((prev) => {
            const next = new Set(prev);
            next.delete(resultId);
            return next;
          });
        },
      });
    },
    [retryMutation],
  );

  const acceptVersionMutation = useMutation({
    mutationFn: ({
      resultId,
      versionId,
    }: {
      resultId: number;
      versionId: number;
    }) => resultsApi.acceptVersion(resultId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
    },
  });

  const ignoreVersionMutation = useMutation({
    mutationFn: ({
      resultId,
      versionId,
    }: {
      resultId: number;
      versionId: number;
    }) => resultsApi.deleteVersion(resultId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
    },
  });

  const handleGrade = useCallback(
    (resultId: number, grade: GradeValue, queryId?: number) => {
      // For single-run mode, find the queryId from the result
      let resolvedQueryId = queryId;
      if (resolvedQueryId == null && !isCompare) {
        const r = singleSortedResults.find((res) => res.id === resultId);
        if (r) resolvedQueryId = r.query_id;
      }
      gradeMutation.mutate(
        { resultId, grade },
        {
          onSuccess: () => {
            if (resolvedQueryId != null) {
              setTimeout(() => setLastFullyGradedQuery(resolvedQueryId!), 0);
            }
          },
        },
      );
    },
    [gradeMutation, isCompare, singleSortedResults],
  );

  const handleOpenToolModal = useCallback(
    (resultId: number, idx: number, runLabel?: string) => {
      for (const rid of runIds) {
        const runResults = results[rid] || [];
        const r =
          runResults.find((res) => res.id === resultId) ||
          runResults
            .flatMap((res) => versionsByResultId[res.id] || [res])
            .find((res) => res.id === resultId);
        if (r?.tool_calls?.length) {
          setToolModal({
            toolCalls: r.tool_calls,
            idx,
            queryLabel: `Q${r.query?.ordinal || r.query_id}`,
            runLabel: runLabel || "",
          });
          return;
        }
      }
    },
    [runIds, results, versionsByResultId],
  );

  const singleQueryIds = useMemo(
    () => singleSortedResults.map((r) => r.query_id),
    [singleSortedResults],
  );

  // Unified queryIds for both modes
  const queryIds = isCompare ? compareQueryIds : singleQueryIds;

  // Auto-scroll to next ungraded query card
  useEffect(() => {
    if (lastFullyGradedQuery == null) return;
    setLastFullyGradedQuery(null);

    if (isCompare) {
      const qResults = allResults[lastFullyGradedQuery];
      if (!qResults) return;
      const allGraded = runIds.every((rid) => qResults[rid]?.grade?.grade);
      if (!allGraded) return;

      const idx = compareQueryIds.indexOf(lastFullyGradedQuery);
      for (let i = idx + 1; i < compareQueryIds.length; i++) {
        const nextQid = compareQueryIds[i];
        const nextResults = allResults[nextQid];
        if (!nextResults) continue;
        const hasUngraded = runIds.some(
          (rid) => !nextResults[rid]?.grade?.grade,
        );
        if (hasUngraded) {
          const el = cardRefs.current[nextQid];
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
    } else {
      // Single-run: scroll to next ungraded
      const idx = singleSortedResults.findIndex(
        (r) => r.query_id === lastFullyGradedQuery,
      );
      for (let i = idx + 1; i < singleSortedResults.length; i++) {
        if (!singleSortedResults[i].grade?.grade) {
          const el = cardRefs.current[singleSortedResults[i].query_id];
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
    }
  }, [
    lastFullyGradedQuery,
    isCompare,
    allResults,
    runIds,
    compareQueryIds,
    singleSortedResults,
  ]);

  // IntersectionObserver to track visible query card
  useEffect(() => {
    if (queryIds.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isNavigating.current) return; // skip during click-navigation
        entries.forEach((entry) => {
          const qid = Number(entry.target.getAttribute("data-query-id"));
          if (isNaN(qid)) return;
          if (entry.isIntersecting) {
            visibleQueries.current.add(qid);
          } else {
            visibleQueries.current.delete(qid);
          }
        });
        const visible = [...visibleQueries.current].filter((q) =>
          queryIds.includes(q),
        );
        if (visible.length > 0) {
          visible.sort((a, b) => queryIds.indexOf(a) - queryIds.indexOf(b));
          setActiveQueryId(visible[0]);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    Object.entries(cardRefs.current).forEach(([qidStr, el]) => {
      if (el) {
        el.setAttribute("data-query-id", qidStr);
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, [queryIds]);

  // Keyboard shortcut: 't' opens tool calls for the active query
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key !== "t" && e.key !== "T") return;

      // Toggle: close if already open
      if (toolModalRef.current) {
        setToolModal(null);
        return;
      }

      if (activeQueryId == null) return;

      if (isCompare) {
        const qResults = allResults[activeQueryId];
        if (!qResults) return;
        for (const rid of runIds) {
          const r = qResults[rid];
          if (r?.tool_calls?.length) {
            const run = runs.find((ru) => ru.id === rid);
            setToolModal({
              toolCalls: r.tool_calls,
              idx: 0,
              queryLabel: `Q${r.query?.ordinal || r.query_id}`,
              runLabel: run?.label || "",
            });
            return;
          }
        }
      } else {
        const r = singleSortedResults.find(
          (res) => res.query_id === activeQueryId,
        );
        if (r?.tool_calls?.length) {
          setToolModal({
            toolCalls: r.tool_calls,
            idx: 0,
            queryLabel: `Q${r.query?.ordinal || r.query_id}`,
            runLabel: runs[0]?.label || "",
          });
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeQueryId, isCompare, allResults, runIds, runs, singleSortedResults]);

  const queryNavItems = useMemo(() => {
    if (isCompare)
      return buildQueryNavItems(compareQueryIds, allResults, runIds);
    return buildSingleRunNavItems(singleSortedResults);
  }, [isCompare, compareQueryIds, allResults, runIds, singleSortedResults]);

  const handleNavNavigate = useCallback((queryId: number) => {
    // Immediately jump the sidebar highlight — lock observer so intermediate cards don't flicker
    setActiveQueryId(queryId);
    isNavigating.current = true;
    clearTimeout(navTimer.current);

    const el = cardRefs.current[queryId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Unlock observer after scroll settles
    navTimer.current = setTimeout(() => {
      isNavigating.current = false;
    }, 800);
  }, []);

  // Keyboard shortcut: '.' scroll to top
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key !== ".") return;
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Keyboard shortcut: 'y' correct, 'p' partial, 'n' wrong — grade active query
  useEffect(() => {
    const gradeMap: Record<string, GradeValue> = {
      y: "correct",
      c: "correct",
      p: "partial",
      w: "wrong",
      n: "wrong",
    };
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      const grade = gradeMap[e.key];
      if (!grade || activeQueryId == null) return;

      if (isCompare) {
        const qResults = allResults[activeQueryId];
        if (!qResults) return;
        // Grade first ungraded run, or first run if all graded
        for (const rid of runIds) {
          const r = qResults[rid];
          if (r && !r.grade?.grade) {
            handleGrade(r.id, grade, activeQueryId);
            return;
          }
        }
        // All graded — re-grade the first run
        const firstResult = qResults[runIds[0]];
        if (firstResult) handleGrade(firstResult.id, grade, activeQueryId);
      } else {
        const r = singleSortedResults.find(
          (res) => res.query_id === activeQueryId,
        );
        if (r) handleGrade(r.id, grade);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    activeQueryId,
    isCompare,
    allResults,
    runIds,
    singleSortedResults,
    handleGrade,
  ]);

  // Keyboard shortcut: 'k' next query, 'j' previous query
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key !== "k" && e.key !== "j") return;
      if (activeQueryId == null || queryIds.length === 0) return;
      const idx = queryIds.indexOf(activeQueryId);
      const next = e.key === "k" ? idx + 1 : idx - 1;
      if (next >= 0 && next < queryIds.length) {
        handleNavNavigate(queryIds[next]);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeQueryId, queryIds, handleNavNavigate]);

  // Grade summary
  const gradeGroups = useMemo(() => {
    if (isCompare) {
      return computeCompareGradeGroups(allResults, runs, queryIds);
    }
    const runResults = results[runIds[0]] || [];
    return computeGradeGroups(runResults, runs[0]?.label || "Results");
  }, [isCompare, allResults, runs, queryIds, results, runIds]);

  const totalResults = isCompare
    ? queryIds.length * runs.length
    : (results[runIds[0]] || []).length;
  const graded = gradeGroups.reduce(
    (sum, g) => sum + g.correct + g.partial + g.wrong,
    0,
  );
  const pct = totalResults ? Math.round((graded / totalResults) * 100) : 0;

  const handleSync = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qKey });
  }, [queryClient, qKey]);

  // --- Skeleton loading ---
  if (isLoading && !data) {
    return <GradingSkeleton cardCount={isCompare ? 4 : 6} />;
  }

  // --- Error state ---
  if (isError && !data) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive font-medium mb-2">
          Failed to load results
        </p>
        <button
          onClick={handleSync}
          className="text-sm text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <FloatingGradeBar
        graded={graded}
        total={totalResults}
        pct={pct}
        isFetching={isFetching}
        onSync={handleSync}
        navItems={queryNavItems}
        activeQueryId={activeQueryId}
        onNavigate={handleNavNavigate}
      />

      {isCompare
        ? queryIds.map((qid) => {
            const firstResult = Object.values(allResults[qid])[0];
            return (
              <div
                key={qid}
                ref={(el) => {
                  cardRefs.current[qid] = el;
                }}
                className="scroll-mt-20"
              >
                <CompareCard
                  queryId={qid}
                  query={
                    firstResult?.query || {
                      id: qid,
                      suite_id: 0,
                      ordinal: qid,
                      tag: null,
                      query_text: "",
                      expected_answer: "",
                      comments: null,
                    }
                  }
                  runs={runs}
                  resultsByRun={allResults[qid]}
                  onGrade={handleGrade}
                  onOpenToolModal={(resultId, idx, runLabel) =>
                    handleOpenToolModal(resultId, idx, runLabel)
                  }
                  versionsByResultId={versionsByResultId}
                  onRetry={handleRetry}
                  onAcceptVersion={(resultId, versionId) =>
                    acceptVersionMutation.mutate({ resultId, versionId })
                  }
                  onIgnoreVersion={(resultId, versionId) =>
                    ignoreVersionMutation.mutate({ resultId, versionId })
                  }
                  isActive={activeQueryId === qid}
                  isRetrying={Object.values(allResults[qid] || {}).some((res) =>
                    retryingResultIds.has(res.id),
                  )}
                />
              </div>
            );
          })
        : singleSortedResults.map((r) => (
            <div
              key={r.id}
              ref={(el) => {
                cardRefs.current[r.query_id] = el;
              }}
              className="scroll-mt-20"
            >
              <GradingCard
                result={r}
                onGrade={handleGrade}
                onOpenToolModal={handleOpenToolModal}
                versions={versionsByResultId[r.id] || [r]}
                onRetry={handleRetry}
                onAcceptVersion={(resultId, versionId) =>
                  acceptVersionMutation.mutate({ resultId, versionId })
                }
                onIgnoreVersion={(resultId, versionId) =>
                  ignoreVersionMutation.mutate({ resultId, versionId })
                }
                isRetrying={retryingResultIds.has(r.id)}
              />
            </div>
          ))}

      {toolModal && (
        <ToolModal
          toolCalls={toolModal.toolCalls}
          initialIdx={toolModal.idx}
          queryLabel={toolModal.queryLabel}
          runLabel={toolModal.runLabel}
          onClose={() => setToolModal(null)}
        />
      )}
    </>
  );
}

// --- Floating grade bar ---
interface NavItem {
  queryId: number;
  ordinal: number;
  gradedCount: number;
  totalRuns: number;
}

function FloatingGradeBar({
  graded,
  total,
  pct,
  isFetching,
  onSync,
  navItems,
  activeQueryId,
  onNavigate,
}: {
  graded: number;
  total: number;
  pct: number;
  isFetching: boolean;
  onSync: () => void;
  navItems: NavItem[];
  activeQueryId: number | null;
  onNavigate: (queryId: number) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const navScrollRef = useRef<HTMLDivElement>(null);
  const activeNavRef = useRef<HTMLButtonElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-56px 0px 0px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll active nav item into view
  useEffect(() => {
    if (!activeNavRef.current || !navScrollRef.current) return;
    const container = navScrollRef.current;
    const item = activeNavRef.current;
    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (
      itemRect.left < containerRect.left ||
      itemRect.right > containerRect.right
    ) {
      item.scrollIntoView({
        block: "nearest",
        inline: "center",
        behavior: "smooth",
      });
    }
  }, [activeQueryId]);

  return (
    <>
      <div ref={sentinelRef} className="h-0 w-full" />
      <div
        className={cn(
          "z-40 flex justify-center mb-4 transition-all duration-300 ease-out",
          pinned ? "fixed bottom-4 left-1/2 -translate-x-1/2 w-full px-4" : "",
        )}
      >
        <div
          className={cn(
            "glass-opaque rounded-2xl overflow-hidden flex flex-col w-full max-w-3xl",
            pinned ? "shadow-xl" : "shadow-md",
          )}
        >
          {/* Single row: scrollable query pills | fixed stats */}
          <div className="flex items-center">
            {/* Scrollable query nav */}
            {navItems.length > 0 && (
              <div
                ref={navScrollRef}
                className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-hidden min-w-0 flex-1"
              >
                {navItems.map((item) => {
                  const isActive = item.queryId === activeQueryId;
                  const allDone = item.gradedCount === item.totalRuns;
                  const someDone = item.gradedCount > 0;
                  return (
                    <button
                      key={item.queryId}
                      ref={isActive ? activeNavRef : undefined}
                      onClick={() => onNavigate(item.queryId)}
                      className={cn(
                        "shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors",
                        isActive
                          ? "bg-primary/20 text-primary"
                          : allDone
                            ? "text-brand-dark hover:bg-white/10"
                            : "text-muted-light hover:bg-white/10",
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          allDone
                            ? "bg-brand-dark"
                            : someDone
                              ? "bg-yellow-400"
                              : "bg-muted-light",
                        )}
                      />
                      {item.ordinal}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Fixed stats + actions */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-l border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="font-semibold">
                  {graded}/{total}
                </span>
                <span className="text-muted-light">{pct}%</span>
              </div>
              <div className="w-16 h-1.5 bg-border/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                title="Scroll to top"
                className="p-1 rounded text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
              >
                <ArrowUp size={12} />
              </button>
              <button
                onClick={onSync}
                title="Refresh"
                className={cn(
                  "p-1 rounded text-muted-light hover:text-primary hover:bg-primary/10 transition-colors",
                  isFetching && "animate-spin-slow",
                )}
              >
                <RefreshCw size={12} />
              </button>
            </div>
          </div>

          {/* Progress bar along the bottom edge */}
          <div className="h-[3px] bg-border/40">
            <div
              className="h-full bg-brand rounded-r-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

// --- Skeleton component ---
function GradingSkeleton({ cardCount }: { cardCount: number }) {
  return (
    <div>
      {/* Progress bar skeleton */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-2 w-48 rounded-full" />
        <div className="skeleton h-4 w-8" />
      </div>

      {/* Grade summary skeleton */}
      <div className="bg-card rounded-lg px-8 py-4 mb-6 flex justify-center gap-6">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface)]"
          >
            <div className="skeleton h-4 w-20" />
            <div className="skeleton h-5 w-7 rounded-xl" />
            <div className="skeleton h-5 w-7 rounded-xl" />
            <div className="skeleton h-5 w-7 rounded-xl" />
            <div className="skeleton h-5 w-7 rounded-xl" />
          </div>
        ))}
      </div>

      {/* Card skeletons */}
      {[...Array(cardCount)].map((_, i) => (
        <div key={i} className="bg-card rounded-lg p-6 px-8 mb-6">
          {/* Header */}
          <div className="border-b-2 border-border pb-3 mb-4">
            <div className="skeleton h-5 w-32" />
          </div>
          {/* Query text */}
          <div className="p-3 bg-[var(--surface)] rounded-lg border-l-4 border-brand/30 mb-4 space-y-2">
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-3/4" />
          </div>
          {/* Expected answer */}
          <div className="mb-4 space-y-2">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-3 w-2/3" />
          </div>
          {/* Tab bar */}
          <div className="flex bg-[var(--surface-hover)] rounded-t-lg gap-1 px-2 py-2">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="skeleton h-6 w-24 rounded" />
            ))}
          </div>
          {/* Content */}
          <div className="p-4 space-y-3">
            <div className="bg-[var(--surface)] border-2 border-border rounded-lg p-4 space-y-2">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-5/6" />
              <div className="skeleton h-3 w-4/6" />
            </div>
            <div className="flex gap-2">
              <div className="skeleton h-8 w-20 rounded-lg" />
              <div className="skeleton h-8 w-20 rounded-lg" />
              <div className="skeleton h-8 w-20 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
