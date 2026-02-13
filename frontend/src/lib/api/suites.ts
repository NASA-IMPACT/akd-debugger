import { apiFetch, apiUpload } from "./client";
import type { SuiteOut, SuiteDetailOut, SuiteCreate, SuiteUpdate, QueryOut, QueryCreate, CsvColumnMapping } from "../types";

export const suitesApi = {
  list: (tag?: string) =>
    apiFetch<SuiteOut[]>(`/api/suites${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`),

  get: (id: number) =>
    apiFetch<SuiteDetailOut>(`/api/suites/${id}`),

  create: (body: SuiteCreate) =>
    apiFetch<SuiteOut>("/api/suites", { method: "POST", body: JSON.stringify(body) }),

  update: (id: number, body: SuiteUpdate) =>
    apiFetch<SuiteOut>(`/api/suites/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  delete: (id: number) =>
    apiFetch<void>(`/api/suites/${id}`, { method: "DELETE" }),

  addQuery: (suiteId: number, body: QueryCreate) =>
    apiFetch<QueryOut>(`/api/suites/${suiteId}/queries`, { method: "POST", body: JSON.stringify(body) }),

  importCsv: (suiteId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiUpload<{ imported: number }>(`/api/suites/${suiteId}/import-csv`, form);
  },

  importCsvMapped: (suiteId: number, file: File, mapping: CsvColumnMapping) => {
    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    return apiUpload<{ imported: number }>(`/api/suites/${suiteId}/import-csv-mapped`, form);
  },
};
