import { request } from "./api/client";

export const NOTIFICATION_PAGE_SIZE = 20;

export interface InboxNotification {
  notificationId: string;
  workspaceId: string;
  linkId: string | null;
  kind: "expiry_24h" | "visits_80";
  title: string;
  summary: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationSettings {
  expiryEnabled: boolean;
  visitsEnabled: boolean;
}

export interface NotificationPage {
  items: InboxNotification[];
  pagination: { page: number; pageSize: number; total: number };
}

export const notificationsApi = {
  list: (page = 1, unread = false, signal?: AbortSignal) => request<NotificationPage>("/notifications", { signal, query: { page, pageSize: NOTIFICATION_PAGE_SIZE, ...(unread ? { unread: true } : {}) } }),
  unreadCount: (signal?: AbortSignal) => request<{ unreadCount: number }>("/notifications/unread-count", { signal }),
  markRead: (id: string) => request<void>(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }),
  readAll: () => request<{ markedCount: number }>("/notifications/read-all", { method: "POST" }),
  settings: (signal?: AbortSignal) => request<NotificationSettings>("/me/notification-settings", { signal }),
  updateSettings: (body: Partial<NotificationSettings>) => request<NotificationSettings>("/me/notification-settings", { method: "PATCH", body: JSON.stringify(body) }),
};
