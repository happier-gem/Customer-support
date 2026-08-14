/** TCP message patterns shared between the gateway and the auth-service microservice. */
export const AUTH_PATTERNS = {
  REGISTER: 'auth.register',
  VERIFY_EMAIL: 'auth.verify-email',
  LOGIN: 'auth.login',
  REFRESH: 'auth.refresh',
  LOGOUT: 'auth.logout',
  FORGOT_PASSWORD: 'auth.forgot-password',
  RESET_PASSWORD: 'auth.reset-password',
  ME: 'auth.me',
} as const;

export const AUTH_SERVICE_CLIENT = 'AUTH_SERVICE_CLIENT';

/** TCP message patterns for organization (tenant) operations, served by the auth-service. */
export const ORG_PATTERNS = {
  GET_BY_ID: 'org.get-by-id',
  LIST: 'org.list',
  UPDATE: 'org.update',
  UPDATE_PROFILE: 'org.update-profile',
} as const;

/** TCP message patterns for team-member management, served by the auth-service. */
export const MEMBER_PATTERNS = {
  LIST: 'members.list',
  UPDATE_ROLE: 'members.update-role',
  REMOVE: 'members.remove',
} as const;

/** TCP message patterns for the invitation lifecycle, served by the auth-service. */
export const INVITATION_PATTERNS = {
  CREATE: 'invitations.create',
  LIST: 'invitations.list',
  VALIDATE: 'invitations.validate',
  ACCEPT: 'invitations.accept',
} as const;
