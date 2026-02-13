import { apiUrl } from "./client";

export const exportApi = {
  htmlUrl: (runIds: number[]) => apiUrl(`/api/export/html?run_ids=${runIds.join(",")}`),
  csvUrl: (runIds: number[]) => apiUrl(`/api/export/csv?run_ids=${runIds.join(",")}`),
  jsonUrl: (runIds: number[]) => apiUrl(`/api/export/json?run_ids=${runIds.join(",")}`),
  accuracyChartUrl: (runIds: number[]) => apiUrl(`/api/charts/accuracy?run_ids=${runIds.join(",")}`),
};
