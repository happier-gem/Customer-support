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
