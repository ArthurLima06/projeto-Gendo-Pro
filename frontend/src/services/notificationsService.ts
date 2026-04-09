import { api, type ApiResponse } from "./api";

export interface Notification {
  id: string;
  title: string;
  description: string;
  date: string;
  read: boolean;
  linkedDate?: string;
}

export async function getNotifications(): Promise<ApiResponse<Notification[]>> {
  return api.get<Notification[]>("/notifications");
}

export async function markNotificationRead(
  id: string
): Promise<ApiResponse<{ success: boolean }>> {
  return api.put<{ success: boolean }>(`/notifications/${id}/read`, {});
}

export async function markAllNotificationsRead(): Promise<ApiResponse<{ success: boolean }>> {
  return api.post<{ success: boolean }>("/notifications/mark-all-read", {});
}
