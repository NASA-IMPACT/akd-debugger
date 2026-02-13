import { apiFetch, apiUpload } from "./client";
import type { GradeOut, GradeCreate } from "../types";

export interface GradeImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

export const gradesApi = {
  upsert: (resultId: number, body: GradeCreate) =>
    apiFetch<GradeOut>(`/api/grades/results/${resultId}/grade`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  importCsv: (runId: number, file: File, mapping: Record<string, string | null>) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));
    return apiUpload<GradeImportResult>(`/api/grades/runs/${runId}/import-csv`, fd);
  },
};
