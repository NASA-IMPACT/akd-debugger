import { apiFetch } from "./client";
import type { RunAnalyticsOut, CompareAnalyticsOut } from "../types";

export const analyticsApi = {
  run: (runId: number) =>
    apiFetch<RunAnalyticsOut>(`/api/analytics/runs/${runId}`),

  compare: (runIds: number[]) =>
    apiFetch<CompareAnalyticsOut>(`/api/analytics/compare?run_ids=${runIds.join(",")}`),
};
