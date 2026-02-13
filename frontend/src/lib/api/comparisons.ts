import { apiFetch } from "./client";
import type { ComparisonOut, ComparisonCreate } from "../types";

export const comparisonsApi = {
  list: () =>
    apiFetch<ComparisonOut[]>("/api/comparisons"),

  get: (id: number) =>
    apiFetch<ComparisonOut>(`/api/comparisons/${id}`),

  create: (body: ComparisonCreate) =>
    apiFetch<ComparisonOut>("/api/comparisons", { method: "POST", body: JSON.stringify(body) }),

  delete: (id: number) =>
    apiFetch<void>(`/api/comparisons/${id}`, { method: "DELETE" }),
};
