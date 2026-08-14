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
};
