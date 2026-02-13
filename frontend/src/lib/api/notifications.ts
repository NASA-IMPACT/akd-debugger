import { apiFetch } from "./client";
import type { AppNotificationOut } from "../types";

export const notificationsApi = {
  list: (params?: { unreadOnly?: boolean; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.unreadOnly) qs.set("unread_only", "true");
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return apiFetch<AppNotificationOut[]>(`/api/notifications${query ? `?${query}` : ""}`);
  },

  markRead: (id: number) => apiFetch<AppNotificationOut>(`/api/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => apiFetch<{ updated: number }>("/api/notifications/read-all", { method: "POST" }),
  deleteAll: () => apiFetch<{ deleted: number }>("/api/notifications", { method: "DELETE" }),
};
