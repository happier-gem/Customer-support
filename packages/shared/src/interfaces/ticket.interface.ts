import type { TicketHistoryAction, TicketPriority, TicketStatus } from '../constants/ticket';

export interface TicketPersonSummary {
  id: string;
  name: string;
  email: string;
}

export interface TicketDto {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  customer: TicketPersonSummary;
  assignedAgent: TicketPersonSummary | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface TicketAttachmentDto {
  id: string;
  ticketId: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: TicketPersonSummary;
  createdAt: string;
}

export interface TicketHistoryDto {
  id: string;
  ticketId: string;
  action: TicketHistoryAction;
  actor: TicketPersonSummary;
  previousStatus: TicketStatus | null;
  newStatus: TicketStatus | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TicketDetailDto extends TicketDto {
  attachments: TicketAttachmentDto[];
  history: TicketHistoryDto[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}
