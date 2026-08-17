export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : (data?.message ?? "Something went wrong. Please try again.");
    throw new ApiError(message, res.status);
  }

  return data as T;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  role: string;
  emailVerified: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: PublicUser;
}

export interface RefreshResponse {
  accessToken?: string;
  message?: string;
}

export type PlanType = "FREE" | "STARTER" | "PRO";

export interface PlanLimits {
  teamMembers: number | null;
  monthlyTickets: number | null;
  feedbackForms: number | null;
}

export interface SubscriptionPlan {
  plan: PlanType;
  limits: PlanLimits;
}

export interface AdminOrganization {
  id: string;
  name: string;
  plan: PlanType;
  timezone: string;
  isSuspended: boolean;
  activeMemberCount: number;
  ticketCount: number;
  feedbackFormCount: number;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface AdminOrganizationListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  plan?: PlanType;
  status?: "ACTIVE" | "SUSPENDED";
}

export interface PlatformStats {
  organizations: { total: number; active: number; suspended: number };
  plans: Record<PlanType, number>;
  usage: { ticketsThisMonth: number; feedbackForms: number; activeTeamMembers: number };
}

export type NotificationType =
  | "TICKET_CREATED"
  | "TICKET_ASSIGNED"
  | "TICKET_STATUS_CHANGED"
  | "TICKET_RESOLVED"
  | "TICKET_CLOSED"
  | "TEAM_INVITATION_ACCEPTED"
  | "TEAM_MEMBER_ROLE_CHANGED"
  | "TEAM_MEMBER_REMOVED"
  | "FEEDBACK_SUBMITTED"
  | "PLAN_LIMIT_REACHED";

export interface Notification {
  id: string;
  organizationId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  readAt: string | null;
  ticketId: string | null;
  invitationId: string | null;
  feedbackFormId: string | null;
  createdAt: string;
}

export interface NotificationListParams {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

function buildQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, string | number | undefined>)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function authHeader(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export const api = {
  login: (body: { email: string; password: string }) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  refresh: () => request<RefreshResponse>("/auth/refresh", { method: "POST" }),

  logout: () => request<{ message: string }>("/auth/logout", { method: "POST" }),

  me: (accessToken: string) => request<PublicUser>("/auth/me", { headers: authHeader(accessToken) }),

  getPlatformStats: (accessToken: string) =>
    request<PlatformStats>("/admin/stats", { headers: authHeader(accessToken) }),

  listOrganizations: (accessToken: string, params: AdminOrganizationListParams = {}) =>
    request<Paginated<AdminOrganization>>(`/admin/organizations${buildQuery(params)}`, {
      headers: authHeader(accessToken),
    }),

  getOrganization: (accessToken: string, id: string) =>
    request<AdminOrganization>(`/admin/organizations/${encodeURIComponent(id)}`, { headers: authHeader(accessToken) }),

  suspendOrganization: (accessToken: string, id: string) =>
    request<AdminOrganization>(`/admin/organizations/${encodeURIComponent(id)}/suspend`, {
      method: "PATCH",
      headers: authHeader(accessToken),
    }),

  activateOrganization: (accessToken: string, id: string) =>
    request<AdminOrganization>(`/admin/organizations/${encodeURIComponent(id)}/activate`, {
      method: "PATCH",
      headers: authHeader(accessToken),
    }),

  listPlans: (accessToken: string) => request<SubscriptionPlan[]>("/admin/plans", { headers: authHeader(accessToken) }),

  updatePlanLimits: (accessToken: string, plan: PlanType, limits: PlanLimits) =>
    request<SubscriptionPlan>(`/admin/plans/${encodeURIComponent(plan)}`, {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(limits),
    }),

  listNotifications: (accessToken: string, params: NotificationListParams = {}) =>
    request<Paginated<Notification>>(`/notifications${buildQuery(params)}`, { headers: authHeader(accessToken) }),

  getUnreadNotificationCount: (accessToken: string) =>
    request<{ count: number }>("/notifications/unread-count", { headers: authHeader(accessToken) }),

  markNotificationRead: (accessToken: string, id: string) =>
    request<Notification>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
      headers: authHeader(accessToken),
    }),

  markAllNotificationsRead: (accessToken: string) =>
    request<{ count: number }>("/notifications/read-all", { method: "PATCH", headers: authHeader(accessToken) }),
};
