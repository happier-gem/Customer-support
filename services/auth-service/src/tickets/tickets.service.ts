import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Ticket, TicketAttachment, TicketHistory, User } from '@prisma/client';
import {
  DEFAULT_TICKET_PRIORITY,
  NOTIFICATION_TYPES,
  PaginatedResult,
  ROLES,
  RpcAuthContext,
  TICKET_DEFAULT_PAGE_SIZE,
  TICKET_HISTORY_ACTIONS,
  TICKET_MAX_PAGE_SIZE,
  TICKET_STATUSES,
  TicketAttachmentDto,
  TicketDetailDto,
  TicketDto,
  TicketHistoryDto,
  TicketPriority,
  TicketStatus,
  isValidTicketStatusTransition,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';

type TicketWithParties = Ticket & {
  customer: Pick<User, 'id' | 'name' | 'email'>;
  assignedAgent: Pick<User, 'id' | 'name' | 'email'> | null;
};

type TicketAttachmentWithUploader = TicketAttachment & { uploadedBy: Pick<User, 'id' | 'name' | 'email'> };
type TicketHistoryWithActor = TicketHistory & { actor: Pick<User, 'id' | 'name' | 'email'> };

const PARTY_SELECT = { id: true, name: true, email: true } as const;

function toDto(ticket: TicketWithParties): TicketDto {
  return {
    id: ticket.id,
    organizationId: ticket.organizationId,
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority as TicketPriority,
    status: ticket.status as TicketStatus,
    customer: ticket.customer,
    assignedAgent: ticket.assignedAgent,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    resolvedAt: ticket.resolvedAt ? ticket.resolvedAt.toISOString() : null,
    closedAt: ticket.closedAt ? ticket.closedAt.toISOString() : null,
  };
}

function toAttachmentDto(attachment: TicketAttachmentWithUploader): TicketAttachmentDto {
  return {
    id: attachment.id,
    ticketId: attachment.ticketId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    uploadedBy: attachment.uploadedBy,
    createdAt: attachment.createdAt.toISOString(),
  };
}

function toHistoryDto(entry: TicketHistoryWithActor): TicketHistoryDto {
  return {
    id: entry.id,
    ticketId: entry.ticketId,
    action: entry.action as TicketHistoryDto['action'],
    actor: entry.actor,
    previousStatus: (entry.previousStatus as TicketStatus | null) ?? null,
    newStatus: (entry.newStatus as TicketStatus | null) ?? null,
    metadata: (entry.metadata as Record<string, unknown> | null) ?? null,
    createdAt: entry.createdAt.toISOString(),
  };
}

export interface TicketListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
}

/**
 * Owns all Phase 4 ticket data. Every query is scoped by
 * `authContext.organizationId` (from the caller's verified JWT, propagated
 * over RPC) — a client can never choose which tenant's tickets it sees by
 * supplying an id in a route, query, or body. A CUSTOMER is further
 * restricted to tickets where they are the customer; cross-tenant or
 * cross-customer lookups fail as "not found" rather than "forbidden" so a
 * caller can't use this service to probe which ticket ids exist elsewhere.
 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
  ) {}

  private readonly includeParties = {
    customer: { select: PARTY_SELECT },
    assignedAgent: { select: PARTY_SELECT },
  } satisfies Prisma.TicketInclude;

  async create(
    authContext: RpcAuthContext,
    dto: { title: string; description: string; priority?: TicketPriority },
  ): Promise<TicketDto> {
    if (authContext.role !== ROLES.CUSTOMER) {
      throw new ForbiddenException('Only a customer can create a ticket.');
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      // Must run first, inside this same transaction: the advisory lock it
      // takes on (org, MONTHLY_TICKETS) is held until commit, so a
      // concurrent create for the same org serializes behind it instead of
      // racing past a stale count (Part 29).
      await this.subscriptions.assertCanCreateTicket(tx, authContext.organizationId);

      const created = await tx.ticket.create({
        data: {
          organizationId: authContext.organizationId,
          customerId: authContext.userId,
          title: dto.title.trim(),
          description: dto.description.trim(),
          priority: dto.priority ?? DEFAULT_TICKET_PRIORITY,
          status: TICKET_STATUSES.OPEN,
        },
        include: this.includeParties,
      });

      await tx.ticketHistory.create({
        data: {
          ticketId: created.id,
          organizationId: created.organizationId,
          actorId: authContext.userId,
          action: TICKET_HISTORY_ACTIONS.CREATED,
          newStatus: TICKET_STATUSES.OPEN,
        },
      });

      // Step 12: a brand-new, unassigned ticket needs attention from whoever can triage
      // or pick it up — the tenant owner (who assigns) and every active support agent
      // (who can self-assign). Least privilege: never the org's other customers.
      const staff = await tx.user.findMany({
        where: {
          organizationId: created.organizationId,
          role: { in: [ROLES.TENANT_OWNER, ROLES.SUPPORT_AGENT] },
          isActive: true,
        },
        select: { id: true },
      });
      await this.notifications.notify(tx, {
        organizationId: created.organizationId,
        recipientIds: staff.map((u) => u.id),
        type: NOTIFICATION_TYPES.TICKET_CREATED,
        title: 'New ticket created',
        message: `A new ticket "${created.title}" was created.`,
        ticketId: created.id,
      });

      return created;
    });

    return toDto(ticket);
  }

  async list(authContext: RpcAuthContext, query: TicketListQuery): Promise<PaginatedResult<TicketDto>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, TICKET_MAX_PAGE_SIZE) : TICKET_DEFAULT_PAGE_SIZE;

    const where: Prisma.TicketWhereInput = { organizationId: authContext.organizationId };

    if (authContext.role === ROLES.CUSTOMER) {
      where.customerId = authContext.userId;
    }

    if (query.status) {
      where.status = query.status;
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.assigneeId && authContext.role !== ROLES.CUSTOMER) {
      where.assignedAgentId = query.assigneeId === 'me' ? authContext.userId : query.assigneeId;
    }
    if (query.search) {
      const search = query.search.trim();
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

    const [total, tickets] = await this.prisma.$transaction([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        include: this.includeParties,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: tickets.map(toDto),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** Tenant- and role-scoped ticket lookup shared by every single-ticket operation. */
  private async getAccessibleTicket(authContext: RpcAuthContext, ticketId: string): Promise<TicketWithParties> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, organizationId: authContext.organizationId },
      include: this.includeParties,
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (authContext.role === ROLES.CUSTOMER && ticket.customerId !== authContext.userId) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async getById(authContext: RpcAuthContext, ticketId: string): Promise<TicketDetailDto> {
    const ticket = await this.getAccessibleTicket(authContext, ticketId);

    const [attachments, history] = await this.prisma.$transaction([
      this.prisma.ticketAttachment.findMany({
        where: { ticketId: ticket.id },
        include: { uploadedBy: { select: PARTY_SELECT } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.ticketHistory.findMany({
        where: { ticketId: ticket.id },
        include: { actor: { select: PARTY_SELECT } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      ...toDto(ticket),
      attachments: attachments.map(toAttachmentDto),
      history: history.map(toHistoryDto),
    };
  }

  async getHistory(authContext: RpcAuthContext, ticketId: string): Promise<TicketHistoryDto[]> {
    const ticket = await this.getAccessibleTicket(authContext, ticketId);

    const history = await this.prisma.ticketHistory.findMany({
      where: { ticketId: ticket.id },
      include: { actor: { select: PARTY_SELECT } },
      orderBy: { createdAt: 'asc' },
    });

    return history.map(toHistoryDto);
  }

  async update(
    authContext: RpcAuthContext,
    ticketId: string,
    dto: { title?: string; description?: string; priority?: TicketPriority },
  ): Promise<TicketDto> {
    const ticket = await this.getAccessibleTicket(authContext, ticketId);

    const isCustomer = authContext.role === ROLES.CUSTOMER;
    if (isCustomer) {
      if (dto.priority !== undefined) {
        throw new ForbiddenException('Only a support agent or tenant owner can change ticket priority.');
      }
      if (ticket.status !== TICKET_STATUSES.OPEN) {
        throw new ForbiddenException('A ticket can only be edited by its customer while it is still open.');
      }
    }

    const data: Prisma.TicketUpdateInput = {};
    const changedFields: string[] = [];
    if (dto.title !== undefined) {
      data.title = dto.title.trim();
      changedFields.push('title');
    }
    if (dto.description !== undefined) {
      data.description = dto.description.trim();
      changedFields.push('description');
    }
    if (dto.priority !== undefined) {
      data.priority = dto.priority;
      changedFields.push('priority');
    }

    if (changedFields.length === 0) {
      return toDto(ticket);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.update({ where: { id: ticket.id }, data, include: this.includeParties });
      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          organizationId: ticket.organizationId,
          actorId: authContext.userId,
          action: TICKET_HISTORY_ACTIONS.UPDATED,
          metadata: { fields: changedFields },
        },
      });
      return result;
    });

    return toDto(updated);
  }

  async updateStatus(authContext: RpcAuthContext, ticketId: string, status: TicketStatus): Promise<TicketDto> {
    if (authContext.role !== ROLES.SUPPORT_AGENT && authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a support agent or tenant owner can change ticket status.');
    }

    const ticket = await this.getAccessibleTicket(authContext, ticketId);
    const currentStatus = ticket.status as TicketStatus;

    if (currentStatus === status) {
      return toDto(ticket);
    }

    if (!isValidTicketStatusTransition(currentStatus, status)) {
      throw new BadRequestException(`Cannot transition a ticket from ${currentStatus} to ${status}.`);
    }

    const data: Prisma.TicketUpdateInput = { status };
    if (status === TICKET_STATUSES.RESOLVED) {
      data.resolvedAt = new Date();
    } else if (status === TICKET_STATUSES.CLOSED) {
      data.closedAt = new Date();
    } else {
      // Moving off RESOLVED (e.g. reopening to IN_PROGRESS) means it's no longer resolved.
      data.resolvedAt = null;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.update({ where: { id: ticket.id }, data, include: this.includeParties });
      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          organizationId: ticket.organizationId,
          actorId: authContext.userId,
          action: TICKET_HISTORY_ACTIONS.STATUS_CHANGED,
          previousStatus: currentStatus,
          newStatus: status,
        },
      });

      // Step 12: the customer is who's "affected" by their own ticket's status moving —
      // never the actor here (only a SUPPORT_AGENT/TENANT_OWNER can reach this method, so
      // actorId !== ticket.customerId is guaranteed, but the check is kept for safety).
      // A dedicated type for RESOLVED/CLOSED lets the frontend distinguish "it's done" from
      // an ordinary in-progress transition without parsing metadata.
      if (ticket.customerId !== authContext.userId) {
        const type =
          status === TICKET_STATUSES.RESOLVED
            ? NOTIFICATION_TYPES.TICKET_RESOLVED
            : status === TICKET_STATUSES.CLOSED
              ? NOTIFICATION_TYPES.TICKET_CLOSED
              : NOTIFICATION_TYPES.TICKET_STATUS_CHANGED;
        await this.notifications.notify(tx, {
          organizationId: ticket.organizationId,
          recipientIds: [ticket.customerId],
          type,
          title: 'Ticket status updated',
          message: `Your ticket "${ticket.title}" is now ${status.replace(/_/g, ' ').toLowerCase()}.`,
          ticketId: ticket.id,
        });
      }

      return result;
    });

    return toDto(updated);
  }

  /** Verifies `agentId` is an active SUPPORT_AGENT in the caller's own organization. */
  private async getAssignableAgent(authContext: RpcAuthContext, agentId: string): Promise<User> {
    const agent = await this.prisma.user.findUnique({ where: { id: agentId } });
    if (!agent || agent.organizationId !== authContext.organizationId) {
      throw new NotFoundException('Agent not found');
    }
    if (agent.role !== ROLES.SUPPORT_AGENT) {
      throw new BadRequestException('Tickets can only be assigned to a support agent.');
    }
    if (!agent.isActive) {
      throw new BadRequestException('Cannot assign a ticket to an inactive agent.');
    }
    return agent;
  }

  private async assignTicketTo(
    authContext: RpcAuthContext,
    ticket: TicketWithParties,
    agent: User,
    metadata: Record<string, unknown>,
  ): Promise<TicketDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.update({
        where: { id: ticket.id },
        data: { assignedAgentId: agent.id },
        include: this.includeParties,
      });
      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          organizationId: ticket.organizationId,
          actorId: authContext.userId,
          action: TICKET_HISTORY_ACTIONS.ASSIGNED,
          metadata: { agentId: agent.id, agentName: agent.name, ...metadata },
        },
      });

      // Step 12/13: only notify the agent when someone *else* assigned them — an agent
      // who just picked up a ticket themselves (assignSelf) already knows.
      if (agent.id !== authContext.userId) {
        await this.notifications.notify(tx, {
          organizationId: ticket.organizationId,
          recipientIds: [agent.id],
          type: NOTIFICATION_TYPES.TICKET_ASSIGNED,
          title: 'Ticket assigned to you',
          message: `Ticket "${ticket.title}" was assigned to you.`,
          ticketId: ticket.id,
        });
      }

      return result;
    });

    return toDto(updated);
  }

  /** Part 10: a Tenant Owner assigns a ticket to a specific agent in their own organization. */
  async assign(authContext: RpcAuthContext, ticketId: string, agentId: string): Promise<TicketDto> {
    if (authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a tenant owner can assign tickets to an agent.');
    }

    const ticket = await this.getAccessibleTicket(authContext, ticketId);
    const agent = await this.getAssignableAgent(authContext, agentId);

    return this.assignTicketTo(authContext, ticket, agent, { assignedBy: 'owner' });
  }

  /** Part 11: a Support Agent picks up an unassigned ticket in their own organization. */
  async assignSelf(authContext: RpcAuthContext, ticketId: string): Promise<TicketDto> {
    if (authContext.role !== ROLES.SUPPORT_AGENT) {
      throw new ForbiddenException('Only a support agent can pick up a ticket.');
    }

    const ticket = await this.getAccessibleTicket(authContext, ticketId);
    if (ticket.assignedAgentId) {
      throw new BadRequestException('This ticket is already assigned.');
    }

    const agent = await this.getAssignableAgent(authContext, authContext.userId);

    return this.assignTicketTo(authContext, ticket, agent, { self: true });
  }

  async createAttachment(
    authContext: RpcAuthContext,
    ticketId: string,
    file: { fileName: string; storedFileName: string; mimeType: string; size: number },
  ): Promise<TicketAttachmentDto> {
    const ticket = await this.getAccessibleTicket(authContext, ticketId);

    const attachment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticketAttachment.create({
        data: {
          ticketId: ticket.id,
          organizationId: ticket.organizationId,
          uploadedById: authContext.userId,
          fileName: file.fileName,
          storedFileName: file.storedFileName,
          mimeType: file.mimeType,
          size: file.size,
        },
        include: { uploadedBy: { select: PARTY_SELECT } },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          organizationId: ticket.organizationId,
          actorId: authContext.userId,
          action: TICKET_HISTORY_ACTIONS.ATTACHMENT_ADDED,
          metadata: { fileName: file.fileName, attachmentId: created.id },
        },
      });

      return created;
    });

    return toAttachmentDto(attachment);
  }

  /** Resolves an attachment for download, re-verifying tenant/customer scope so a stored filename is never handed out cross-tenant. */
  async getAttachment(
    authContext: RpcAuthContext,
    ticketId: string,
    attachmentId: string,
  ): Promise<{ fileName: string; storedFileName: string; mimeType: string }> {
    await this.getAccessibleTicket(authContext, ticketId);

    const attachment = await this.prisma.ticketAttachment.findFirst({
      where: { id: attachmentId, ticketId, organizationId: authContext.organizationId },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return { fileName: attachment.fileName, storedFileName: attachment.storedFileName, mimeType: attachment.mimeType };
  }
}
