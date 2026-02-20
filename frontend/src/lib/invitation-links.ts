export function withCurrentOrigin(inviteLink: string | null | undefined): string | null {
  if (!inviteLink) return null;
  if (typeof window === "undefined") return inviteLink;
  try {
    const url = new URL(inviteLink, window.location.origin);
    // Preserve token/path while using the current app origin.
    return `${window.location.origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return inviteLink;
  }
}
