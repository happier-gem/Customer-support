import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RpcAuthContext, TICKET_PATTERNS, TicketPriority, TicketStatus } from '@app/shared';
import { TicketsService, TicketListQuery } from './tickets.service';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';

@Controller()
@UseFilters(RpcExceptionFilter)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @MessagePattern(TICKET_PATTERNS.CREATE)
  create(
    @Payload()
    data: { authContext: RpcAuthContext; title: string; description: string; priority?: TicketPriority },
  ) {
    return this.ticketsService.create(data.authContext, data);
  }

  @MessagePattern(TICKET_PATTERNS.LIST)
  list(@Payload() data: { authContext: RpcAuthContext } & TicketListQuery) {
    const { authContext, ...query } = data;
    return this.ticketsService.list(authContext, query);
  }

  @MessagePattern(TICKET_PATTERNS.GET_BY_ID)
  getById(@Payload() data: { authContext: RpcAuthContext; ticketId: string }) {
    return this.ticketsService.getById(data.authContext, data.ticketId);
  }

  @MessagePattern(TICKET_PATTERNS.HISTORY)
  getHistory(@Payload() data: { authContext: RpcAuthContext; ticketId: string }) {
    return this.ticketsService.getHistory(data.authContext, data.ticketId);
  }

  @MessagePattern(TICKET_PATTERNS.UPDATE)
  update(
    @Payload()
    data: {
      authContext: RpcAuthContext;
      ticketId: string;
      title?: string;
      description?: string;
      priority?: TicketPriority;
    },
  ) {
    return this.ticketsService.update(data.authContext, data.ticketId, data);
  }

  @MessagePattern(TICKET_PATTERNS.UPDATE_STATUS)
  updateStatus(@Payload() data: { authContext: RpcAuthContext; ticketId: string; status: TicketStatus }) {
    return this.ticketsService.updateStatus(data.authContext, data.ticketId, data.status);
  }

  @MessagePattern(TICKET_PATTERNS.ASSIGN)
  assign(@Payload() data: { authContext: RpcAuthContext; ticketId: string; agentId: string }) {
    return this.ticketsService.assign(data.authContext, data.ticketId, data.agentId);
  }

  @MessagePattern(TICKET_PATTERNS.ASSIGN_SELF)
  assignSelf(@Payload() data: { authContext: RpcAuthContext; ticketId: string }) {
    return this.ticketsService.assignSelf(data.authContext, data.ticketId);
  }

  @MessagePattern(TICKET_PATTERNS.CREATE_ATTACHMENT)
  createAttachment(
    @Payload()
    data: {
      authContext: RpcAuthContext;
      ticketId: string;
      fileName: string;
      storedFileName: string;
      mimeType: string;
      size: number;
    },
  ) {
    return this.ticketsService.createAttachment(data.authContext, data.ticketId, data);
  }

  @MessagePattern(TICKET_PATTERNS.GET_ATTACHMENT)
  getAttachment(@Payload() data: { authContext: RpcAuthContext; ticketId: string; attachmentId: string }) {
    return this.ticketsService.getAttachment(data.authContext, data.ticketId, data.attachmentId);
  }

  @MessagePattern(TICKET_PATTERNS.CREATE_MESSAGE)
  createMessage(@Payload() data: { authContext: RpcAuthContext; ticketId: string; body: string }) {
    return this.ticketsService.createMessage(data.authContext, data.ticketId, data.body);
  }
}
