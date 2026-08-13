const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
  refreshToken: string;
  user: PublicUser;
}

export interface RefreshResponse {
  accessToken?: string;
  refreshToken?: string;
  message?: string;
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
    request<PublicUser>("/auth/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
};
