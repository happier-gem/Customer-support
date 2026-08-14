import type { Role } from '../constants/roles';

export interface JwtAccessPayload {
  sub: string;
  email: string;
  organizationId: string;
  role: Role;
  type: 'access';
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  organizationId: string;
  role: Role;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  role: Role;
  emailVerified: boolean;
}

/**
 * The authenticated caller's identity, propagated from the gateway (which
 * derived it from a verified JWT) to internal microservices over RPC.
 * Internal services must authorize and scope queries using this trusted
 * context — never a client-supplied organizationId from a route/query/body.
 */
export interface RpcAuthContext {
  userId: string;
  email: string;
  organizationId: string;
  role: Role;
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
