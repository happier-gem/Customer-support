export interface JwtAccessPayload {
  sub: string;
  email: string;
  organizationId: string;
  role: string;
  type: 'access';
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  organizationId: string;
  role: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  role: string;
  emailVerified: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Normalized error shape sent back over the TCP transport from auth-service to the gateway. */
export interface RpcErrorPayload {
  statusCode: number;
  message: string | string[];
  error?: string;
}
