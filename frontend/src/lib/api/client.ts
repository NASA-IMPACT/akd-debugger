import { getActiveWorkspace } from "@/lib/workspace";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const AUTH_REFRESH_PATH = "/api/auth/refresh";
const AUTH_ME_PATH = "/api/auth/me";
export const AUTH_UNAUTHORIZED_EVENT = "axiom:auth-unauthorized";
let refreshPromise: Promise<boolean> | null = null;

function workspaceHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const { organizationId: orgId, projectId } = getActiveWorkspace();
  if (orgId) headers["X-Org-Id"] = orgId;
  if (projectId) headers["X-Project-Id"] = projectId;
  return headers;
}

function withWorkspaceHeaders(initHeaders?: HeadersInit, includeJsonContentType = true): Headers {
  const headers = new Headers(initHeaders);
  if (includeJsonContentType && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const scopedHeaders = workspaceHeaders();
  for (const [key, value] of Object.entries(scopedHeaders)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return headers;
}

function canAttemptRefresh(path: string): boolean {
  if (path === AUTH_REFRESH_PATH) return false;
  if (!path.startsWith("/api/auth/")) return true;
  return path === AUTH_ME_PATH;
}

function shouldBroadcastUnauthorized(path: string): boolean {
  if (!path.startsWith("/api/auth/")) return true;
  return path === AUTH_ME_PATH;
}

async function attemptSessionRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}${AUTH_REFRESH_PATH}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function parseErrorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as Record<string, unknown>).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return res.statusText || `API error ${res.status}`;
}

async function fetchWithSessionRecovery(
  path: string,
  init?: RequestInit,
  includeJsonContentType: boolean = true
): Promise<Response> {
  const send = () =>
    fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...init,
      headers: withWorkspaceHeaders(init?.headers, includeJsonContentType),
    });

  let res = await send();
  if (res.status === 401 && canAttemptRefresh(path)) {
    const refreshed = await attemptSessionRefresh();
    if (refreshed) {
      res = await send();
    }
  }

  if (res.status === 401 && shouldBroadcastUnauthorized(path) && typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
  }
  return res;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithSessionRecovery(path, init, true);
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetchWithSessionRecovery(
    path,
    {
      method: "POST",
      body: formData,
    },
    false
  );
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return res.json();
}
