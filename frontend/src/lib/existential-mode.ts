const EXISTENTIAL_MODE_EMAIL = "np0069@uah.edu";
export const USER_EMAIL_STORAGE_KEY = "akd.user.email";
export const THEME_SYNC_EVENT = "akd:theme-sync";

export function normalizeEmail(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function replaceAdminLabel(value: string): string {
  return value.replace(/\badmin\b/gi, (match) => {
    if (match === match.toUpperCase()) return "EXISTENTIAL MODE";
    if (match[0] === match[0].toUpperCase()) return "Existential Mode";
    return "existential mode";
  });
}

export function isExistentialModeUser(email: string | null | undefined): boolean {
  return normalizeEmail(email) === EXISTENTIAL_MODE_EMAIL;
}

export function syncExistentialModeAttribute(email: string | null | undefined): void {
  if (typeof document === "undefined") return;
  if (isExistentialModeUser(email)) {
    document.documentElement.setAttribute("data-existential-mode", "true");
    return;
  }
  document.documentElement.removeAttribute("data-existential-mode");
}

export function formatRoleNameForViewer(roleName: string, viewerEmail: string | null | undefined): string {
  if (!isExistentialModeUser(viewerEmail)) return roleName;
  return replaceAdminLabel(roleName);
}

export function formatRoleSlugForViewer(roleSlug: string, viewerEmail: string | null | undefined): string {
  if (!isExistentialModeUser(viewerEmail)) return roleSlug;
  return roleSlug.replace(/admin/g, "existential_mode");
}
