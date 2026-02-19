import { apiUrlWithWorkspace } from "./client";

export const exportApi = {
  htmlUrl: (runIds: number[]) => apiUrlWithWorkspace(`/api/export/html?run_ids=${runIds.join(",")}`),
  csvUrl: (runIds: number[]) => apiUrlWithWorkspace(`/api/export/csv?run_ids=${runIds.join(",")}`),
  jsonUrl: (runIds: number[]) => apiUrlWithWorkspace(`/api/export/json?run_ids=${runIds.join(",")}`),
  accuracyChartUrl: (runIds: number[]) => apiUrlWithWorkspace(`/api/charts/accuracy?run_ids=${runIds.join(",")}`),
};
