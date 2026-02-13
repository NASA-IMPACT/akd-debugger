import { apiFetch } from "./client";
import type { BrowseResult } from "../types";

export const browseApi = {
  list: (path = "~") =>
    apiFetch<BrowseResult>(`/api/browse?path=${encodeURIComponent(path)}`),
};
