const ORG_KEY = "akd.active_org_id";
const PROJECT_KEY = "akd.active_project_id";

type WorkspaceSnapshot = {
  organizationId: string | null;
  projectId: string | null;
};

const EMPTY_WORKSPACE: WorkspaceSnapshot = { organizationId: null, projectId: null };
let activeWorkspace: WorkspaceSnapshot = EMPTY_WORKSPACE;
let hydrated = false;

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function normalizeId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? trimmed : null;
}

function readWorkspaceFromStorage(): WorkspaceSnapshot {
  if (!canUseStorage()) return EMPTY_WORKSPACE;
  return {
    organizationId: normalizeId(window.localStorage.getItem(ORG_KEY)),
    projectId: normalizeId(window.localStorage.getItem(PROJECT_KEY)),
  };
}

function writeWorkspaceToStorage(snapshot: WorkspaceSnapshot): void {
  if (!canUseStorage()) return;
  if (snapshot.organizationId) window.localStorage.setItem(ORG_KEY, snapshot.organizationId);
  else window.localStorage.removeItem(ORG_KEY);
  if (snapshot.projectId) window.localStorage.setItem(PROJECT_KEY, snapshot.projectId);
  else window.localStorage.removeItem(PROJECT_KEY);
}

function ensureHydrated(): void {
  if (hydrated) return;
  activeWorkspace = readWorkspaceFromStorage();
  hydrated = true;
}

export function getActiveWorkspace(): WorkspaceSnapshot {
  ensureHydrated();
  return { ...activeWorkspace };
}

export function setActiveWorkspace(next: WorkspaceSnapshot): void {
  ensureHydrated();
  activeWorkspace = {
    organizationId: normalizeId(next.organizationId),
    projectId: normalizeId(next.projectId),
  };
  writeWorkspaceToStorage(activeWorkspace);
}

export function clearActiveWorkspace(): void {
  setActiveWorkspace(EMPTY_WORKSPACE);
}

export function getActiveOrganizationId(): string | null {
  return getActiveWorkspace().organizationId;
}

export function getActiveProjectId(): string | null {
  return getActiveWorkspace().projectId;
}

export function setActiveOrganizationId(value: string | null): void {
  const workspace = getActiveWorkspace();
  setActiveWorkspace({ ...workspace, organizationId: value });
}

export function setActiveProjectId(value: string | null): void {
  const workspace = getActiveWorkspace();
  setActiveWorkspace({ ...workspace, projectId: value });
}
