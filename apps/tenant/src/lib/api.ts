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
  // Leave FormData bodies alone: the browser sets the multipart boundary
  // itself, and overriding it with "application/json" would corrupt the upload.
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isFormData && !headers["Content-Type"]) {
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
  refreshToken: string;
  user: PublicUser;
}

export interface RefreshResponse {
  accessToken?: string;
  refreshToken?: string;
  message?: string;
}

export interface Organization {
  id: string;
  name: string;
  logoUrl: string | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  createdAt: string;
}

export interface InvitationPreview {
  organizationName: string;
  email: string;
  role: string;
  expiresAt: string;
}

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_FOR_CUSTOMER" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

/** Mirrors packages/shared/src/constants/ticket.ts TICKET_STATUS_TRANSITIONS, kept in sync manually per this app's no-shared-import convention. */
export const NEXT_STATUSES: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["WAITING_FOR_CUSTOMER", "RESOLVED"],
  WAITING_FOR_CUSTOMER: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: [],
};

export interface TicketPerson {
  id: string;
  name: string;
  email: string;
}

export interface Ticket {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  customer: TicketPerson;
  assignedAgent: TicketPerson | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface TicketAttachment {
  id: string;
  ticketId: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: TicketPerson;
  createdAt: string;
}

export interface TicketHistoryEntry {
  id: string;
  ticketId: string;
  action: string;
  actor: TicketPerson;
  previousStatus: TicketStatus | null;
  newStatus: TicketStatus | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TicketDetail extends Ticket {
  attachments: TicketAttachment[];
  history: TicketHistoryEntry[];
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface TicketListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
}

export type FeedbackCategory = "SUPPORT" | "PRODUCT" | "SERVICE" | "GENERAL" | "OTHER";
export type FeedbackFormStatus = "ACTIVE" | "INACTIVE";
export type FeedbackQuestionType = "RATING" | "TEXT";

export interface FeedbackQuestion {
  id: string;
  formId: string;
  type: FeedbackQuestionType;
  label: string;
  required: boolean;
  order: number;
  maxLength: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackFormSummary {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  category: FeedbackCategory;
  status: FeedbackFormStatus;
  questionCount: number;
  responseCount: number;
  createdBy: TicketPerson;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackFormDetail extends FeedbackFormSummary {
  questions: FeedbackQuestion[];
}

export interface FeedbackAnswer {
  id: string;
  questionId: string;
  questionLabel: string;
  questionType: FeedbackQuestionType;
  ratingValue: number | null;
  textValue: string | null;
}

export interface FeedbackResponse {
  id: string;
  formId: string;
  organizationId: string;
  anonymous: boolean;
  customer: TicketPerson | null;
  answers: FeedbackAnswer[];
  createdAt: string;
}

export interface FeedbackFormListParams {
  page?: number;
  limit?: number;
  category?: FeedbackCategory;
  status?: FeedbackFormStatus;
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
  register: (body: { organizationName: string; name: string; email: string; password: string }) =>
    request<{ message: string; organizationId: string; userId: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  verifyEmail: (token: string) =>
    request<{ message: string }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  login: (body: { email: string; password: string }) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  refresh: () => request<RefreshResponse>("/auth/refresh", { method: "POST" }),

  logout: () => request<{ message: string }>("/auth/logout", { method: "POST" }),

  forgotPassword: (email: string) =>
    request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    }),

  me: (accessToken: string) =>
    request<PublicUser>("/auth/me", { headers: authHeader(accessToken) }),

  getOrganization: (accessToken: string) =>
    request<Organization>("/organizations/me", { headers: authHeader(accessToken) }),

  updateOrganization: (accessToken: string, body: { name?: string; timezone?: string }) =>
    request<Organization>("/organizations/me", {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  uploadLogo: (accessToken: string, file: File) => {
    const formData = new FormData();
    formData.append("logo", file);
    return request<Organization>("/organizations/me/logo", {
      method: "POST",
      headers: authHeader(accessToken),
      body: formData,
    });
  },

  listMembers: (accessToken: string) =>
    request<Member[]>("/organizations/me/members", { headers: authHeader(accessToken) }),

  updateMemberRole: (accessToken: string, userId: string, role: string) =>
    request<Member>(`/organizations/me/members/${encodeURIComponent(userId)}/role`, {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify({ role }),
    }),

  removeMember: (accessToken: string, userId: string) =>
    request<{ message: string }>(`/organizations/me/members/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: authHeader(accessToken),
    }),

  listInvitations: (accessToken: string) =>
    request<Invitation[]>("/organizations/me/invitations", { headers: authHeader(accessToken) }),

  inviteMember: (accessToken: string, body: { email: string; role: string }) =>
    request<Invitation>("/organizations/me/invitations", {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  validateInvitation: (token: string) =>
    request<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`),

  acceptInvitation: (token: string, body: { name: string; password: string }) =>
    request<{ message: string; email: string }>(`/invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listTickets: (accessToken: string, params: TicketListParams) =>
    request<Paginated<Ticket>>(`/tickets${buildQuery(params)}`, { headers: authHeader(accessToken) }),

  getTicket: (accessToken: string, id: string) =>
    request<TicketDetail>(`/tickets/${encodeURIComponent(id)}`, { headers: authHeader(accessToken) }),

  updateStatus: (accessToken: string, id: string, statusValue: TicketStatus) =>
    request<Ticket>(`/tickets/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify({ status: statusValue }),
    }),

  assignTicket: (accessToken: string, id: string, agentId: string) =>
    request<Ticket>(`/tickets/${encodeURIComponent(id)}/assign`, {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify({ agentId }),
    }),

  uploadTicketAttachment: (accessToken: string, ticketId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<TicketAttachment>(`/tickets/${encodeURIComponent(ticketId)}/attachments`, {
      method: "POST",
      headers: authHeader(accessToken),
      body: formData,
    });
  },

  listFeedbackForms: (accessToken: string, params: FeedbackFormListParams = {}) =>
    request<Paginated<FeedbackFormSummary>>(`/feedback/forms${buildQuery(params)}`, { headers: authHeader(accessToken) }),

  createFeedbackForm: (accessToken: string, body: { title: string; description?: string; category?: FeedbackCategory }) =>
    request<FeedbackFormDetail>("/feedback/forms", {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  getFeedbackForm: (accessToken: string, id: string) =>
    request<FeedbackFormDetail>(`/feedback/forms/${encodeURIComponent(id)}`, { headers: authHeader(accessToken) }),

  updateFeedbackForm: (accessToken: string, id: string, body: { title?: string; description?: string; category?: FeedbackCategory }) =>
    request<FeedbackFormDetail>(`/feedback/forms/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  updateFeedbackFormStatus: (accessToken: string, id: string, status: FeedbackFormStatus) =>
    request<FeedbackFormDetail>(`/feedback/forms/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify({ status }),
    }),

  deleteFeedbackForm: (accessToken: string, id: string) =>
    request<{ message: string }>(`/feedback/forms/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeader(accessToken),
    }),

  createFeedbackQuestion: (
    accessToken: string,
    formId: string,
    body: { type: FeedbackQuestionType; label: string; required?: boolean; order?: number; maxLength?: number },
  ) =>
    request<FeedbackQuestion>(`/feedback/forms/${encodeURIComponent(formId)}/questions`, {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  updateFeedbackQuestion: (
    accessToken: string,
    formId: string,
    questionId: string,
    body: { label?: string; required?: boolean; order?: number; maxLength?: number },
  ) =>
    request<FeedbackQuestion>(`/feedback/forms/${encodeURIComponent(formId)}/questions/${encodeURIComponent(questionId)}`, {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  deleteFeedbackQuestion: (accessToken: string, formId: string, questionId: string) =>
    request<{ message: string }>(
      `/feedback/forms/${encodeURIComponent(formId)}/questions/${encodeURIComponent(questionId)}`,
      { method: "DELETE", headers: authHeader(accessToken) },
    ),

  listFeedbackResponses: (accessToken: string, formId: string, params: { page?: number; limit?: number } = {}) =>
    request<Paginated<FeedbackResponse>>(`/feedback/forms/${encodeURIComponent(formId)}/responses${buildQuery(params)}`, {
      headers: authHeader(accessToken),
    }),
};
