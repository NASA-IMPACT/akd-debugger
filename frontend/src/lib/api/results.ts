import { apiFetch } from "./client";
import type { ResultListOut, ResultOut } from "../types";

export const resultsApi = {
  list: (runId: number) =>
    apiFetch<ResultOut[]>(`/api/results?run_id=${runId}`),

  listFamilies: (runId: number) =>
    apiFetch<ResultListOut>(`/api/results/families?run_id=${runId}`),

  get: (id: number) =>
    apiFetch<ResultOut>(`/api/results/${id}`),

  retry: (resultId: number) =>
    apiFetch<ResultOut>(`/api/results/${resultId}/retry`, { method: "POST" }),

  acceptVersion: (resultId: number, versionId: number) =>
    apiFetch<ResultOut>(`/api/results/${resultId}/versions/${versionId}/accept`, {
      method: "POST",
    }),

  deleteVersion: (resultId: number, versionId: number) =>
    apiFetch<void>(`/api/results/${resultId}/versions/${versionId}`, {
      method: "DELETE",
    }),
};
