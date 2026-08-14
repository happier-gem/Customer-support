import type { NotificationType } from '../constants/notification';

/**
 * A single persisted notification, scoped to exactly one recipient in exactly one
 * organization (both enforced server-side — see NotificationsService). At most one of
 * `ticketId` / `invitationId` / `feedbackFormId` is ever set, depending on `type`; the
 * related resource may since have been deleted, so the frontend must treat these as
 * "navigate if present and still resolvable", never assume they exist.
 */
export interface NotificationDto {
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

export interface UnreadCountDto {
  count: number;
}
