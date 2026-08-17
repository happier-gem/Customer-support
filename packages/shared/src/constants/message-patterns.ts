/** TCP message patterns shared between the gateway and the auth-service microservice. */
export const AUTH_PATTERNS = {
  REGISTER: 'auth.register',
  REGISTER_CUSTOMER: 'auth.register-customer',
  VERIFY_EMAIL: 'auth.verify-email',
  RESEND_OTP: 'auth.resend-otp',
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
  REVOKE: 'invitations.revoke',
  RESEND: 'invitations.resend',
} as const;

/** TCP message patterns for the Phase 4 ticketing system, served by the auth-service. */
export const TICKET_PATTERNS = {
  CREATE: 'tickets.create',
  LIST: 'tickets.list',
  GET_BY_ID: 'tickets.get-by-id',
  UPDATE: 'tickets.update',
  UPDATE_STATUS: 'tickets.update-status',
  ASSIGN: 'tickets.assign',
  ASSIGN_SELF: 'tickets.assign-self',
  HISTORY: 'tickets.history',
  CREATE_ATTACHMENT: 'tickets.attachments.create',
  GET_ATTACHMENT: 'tickets.attachments.get',
  CREATE_MESSAGE: 'tickets.messages.create',
} as const;

/** TCP message patterns for the Phase 5 feedback system, served by the auth-service. */
export const FEEDBACK_PATTERNS = {
  CREATE_FORM: 'feedback.forms.create',
  LIST_FORMS: 'feedback.forms.list',
  GET_FORM: 'feedback.forms.get',
  UPDATE_FORM: 'feedback.forms.update',
  UPDATE_FORM_STATUS: 'feedback.forms.update-status',
  DELETE_FORM: 'feedback.forms.delete',
  CREATE_QUESTION: 'feedback.forms.questions.create',
  UPDATE_QUESTION: 'feedback.forms.questions.update',
  DELETE_QUESTION: 'feedback.forms.questions.delete',
  CREATE_RESPONSE: 'feedback.forms.responses.create',
  LIST_RESPONSES: 'feedback.forms.responses.list',
  GET_RESPONSE: 'feedback.responses.get',
} as const;

/** TCP message patterns for the Phase 6 subscription system, served by the auth-service. */
export const SUBSCRIPTION_PATTERNS = {
  GET: 'subscription.get',
  LIST_PLANS: 'subscription.plans.list',
  CHANGE_PLAN: 'subscription.change-plan',
} as const;

/** TCP message patterns for the Phase 7 analytics dashboard, served by the auth-service. */
export const ANALYTICS_PATTERNS = {
  OVERVIEW: 'analytics.overview',
} as const;

/** TCP message patterns for the Phase 8 notification system, served by the auth-service. */
export const NOTIFICATION_PATTERNS = {
  LIST: 'notifications.list',
  UNREAD_COUNT: 'notifications.unread-count',
  MARK_READ: 'notifications.mark-read',
  MARK_ALL_READ: 'notifications.mark-all-read',
  DELETE: 'notifications.delete',
} as const;

/** TCP message patterns for the Phase 9 Platform Admin area, served by the auth-service. */
export const ADMIN_PATTERNS = {
  LIST_ORGANIZATIONS: 'admin.organizations.list',
  GET_ORGANIZATION: 'admin.organizations.get',
  SET_ORGANIZATION_SUSPENDED: 'admin.organizations.set-suspended',
  PLATFORM_STATS: 'admin.stats',
  LIST_PLANS: 'admin.plans.list',
  UPDATE_PLAN_LIMITS: 'admin.plans.update-limits',
} as const;
