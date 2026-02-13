import { apiFetch } from "./client";
import type {
  RunDetailOut,
  RunOut,
  RunCreate,
  RunConfig,
  RunImport,
  RunCostPreviewOut,
  RunCostPreviewRecordOut,
  RunningJobsOut,
} from "../types";

export const runsApi = {
  list: (tag?: string) =>
    apiFetch<RunDetailOut[]>(`/api/runs${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`),

  get: (id: number) =>
    apiFetch<RunDetailOut>(`/api/runs/${id}`),

  listJobs: () =>
    apiFetch<RunningJobsOut>("/api/runs/jobs"),

  getConfig: (id: number) =>
    apiFetch<RunConfig>(`/api/runs/${id}/config`),

  listGroup: (runGroup: string) =>
    apiFetch<RunDetailOut[]>(`/api/runs/group/${encodeURIComponent(runGroup)}`),

  create: (body: RunCreate) =>
    apiFetch<RunOut[]>("/api/runs", { method: "POST", body: JSON.stringify(body) }),

  previewCost: (body: RunCreate) =>
    apiFetch<RunCostPreviewOut>("/api/runs/cost-preview", { method: "POST", body: JSON.stringify(body) }),

  startPreviewCost: (body: RunCreate) =>
    apiFetch<RunCostPreviewRecordOut>("/api/runs/cost-preview/start", { method: "POST", body: JSON.stringify(body) }),

  getPreviewCost: (previewId: number) =>
    apiFetch<RunCostPreviewRecordOut>(`/api/runs/cost-preview/${previewId}`),

  listPreviewCosts: (limit = 100) =>
    apiFetch<RunCostPreviewRecordOut[]>(`/api/runs/cost-preview?limit=${limit}`),

  retryPreviewCost: (previewId: number) =>
    apiFetch<RunCostPreviewRecordOut>(`/api/runs/cost-preview/${previewId}/retry`, { method: "POST" }),

  approvePreviewAndStart: (previewId: number) =>
    apiFetch<RunOut[]>(`/api/runs/cost-preview/${previewId}/approve-and-start`, { method: "POST" }),

  cancel: (id: number) =>
    apiFetch<RunOut>(`/api/runs/${id}/cancel`, { method: "POST" }),

  delete: (id: number, deleteData = false) =>
    apiFetch<void>(`/api/runs/${id}${deleteData ? "?delete_data=true" : ""}`, { method: "DELETE" }),

  deleteGroup: (runGroup: string, deleteData = false) =>
    apiFetch<void>(`/api/runs/group/${encodeURIComponent(runGroup)}${deleteData ? "?delete_data=true" : ""}`, { method: "DELETE" }),

  import: (body: RunImport) =>
    apiFetch<RunOut>("/api/runs/import", { method: "POST", body: JSON.stringify(body) }),
};
