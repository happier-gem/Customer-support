import { join } from 'path';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  AssignTicketDto,
  CreateTicketDto,
  ROLES,
  TICKET_PATTERNS,
  TicketAttachmentDto,
  TicketDetailDto,
  TicketDto,
  TicketHistoryDto,
  TicketQueryDto,
  UpdateTicketDto,
  UpdateTicketStatusDto,
  PaginatedResult,
} from '@app/shared';
import { AuthGatewayService } from '../auth/auth-gateway.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TicketsGateway } from '../realtime/tickets.gateway';
import { TICKET_ATTACHMENTS_DIR, sanitizeDisplayFileName, ticketAttachmentUploadOptions } from './ticket-attachment-upload.config';

/**
 * Every route is behind JwtAuthGuard + RolesGuard, so `user` is always
 * derived from a verified access token. `authContext` forwarded to
 * auth-service is always built from `user` — a ticket id in the URL only
 * selects *which* ticket; tenant/ownership authorization is re-checked
 * server-side in TicketsService against `authContext.organizationId`,
 * never against anything the client sent.
 */
@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.CUSTOMER, ROLES.SUPPORT_AGENT, ROLES.TENANT_OWNER)
export class TicketsController {
  constructor(
    private readonly authGateway: AuthGatewayService,
    private readonly ticketsGateway: TicketsGateway,
  ) {}

  /**
   * Broadcasts a live-update event for a ticket to both its organization's
   * staff room and its customer's private room — purely additive, called
   * only after the RPC mutation above has already succeeded, so a failed
   * write never produces a phantom event.
   */
  private broadcastTicketEvent(event: 'ticket:created' | 'ticket:updated', ticket: TicketDto): void {
    this.ticketsGateway.emitToOrg(ticket.organizationId, event, { ticket });
    this.ticketsGateway.emitToCustomer(ticket.customer.id, event, { ticket });
  }

  @Post()
  @Roles(ROLES.CUSTOMER)
  async create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthenticatedUser) {
    const ticket = await this.authGateway.send<TicketDto>(TICKET_PATTERNS.CREATE, { ...dto, authContext: user });
    this.broadcastTicketEvent('ticket:created', ticket);
    return ticket;
  }

  @Get()
  async list(@Query() query: TicketQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<PaginatedResult<TicketDto>>(TICKET_PATTERNS.LIST, { ...query, authContext: user });
  }

  @Get(':id')
  async getById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<TicketDetailDto>(TICKET_PATTERNS.GET_BY_ID, { authContext: user, ticketId: id });
  }

  @Get(':id/history')
  async getHistory(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<TicketHistoryDto[]>(TICKET_PATTERNS.HISTORY, { authContext: user, ticketId: id });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<TicketDto>(TICKET_PATTERNS.UPDATE, { authContext: user, ticketId: id, ...dto });
  }

  @Patch(':id/status')
  @Roles(ROLES.SUPPORT_AGENT, ROLES.TENANT_OWNER)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const ticket = await this.authGateway.send<TicketDto>(TICKET_PATTERNS.UPDATE_STATUS, {
      authContext: user,
      ticketId: id,
      status: dto.status,
    });
    this.broadcastTicketEvent('ticket:updated', ticket);
    return ticket;
  }

  @Post(':id/assign')
  @Roles(ROLES.TENANT_OWNER)
  async assign(@Param('id') id: string, @Body() dto: AssignTicketDto, @CurrentUser() user: AuthenticatedUser) {
    const ticket = await this.authGateway.send<TicketDto>(TICKET_PATTERNS.ASSIGN, {
      authContext: user,
      ticketId: id,
      agentId: dto.agentId,
    });
    this.broadcastTicketEvent('ticket:updated', ticket);
    return ticket;
  }

  @Post(':id/assign-self')
  @Roles(ROLES.SUPPORT_AGENT)
  async assignSelf(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const ticket = await this.authGateway.send<TicketDto>(TICKET_PATTERNS.ASSIGN_SELF, {
      authContext: user,
      ticketId: id,
    });
    this.broadcastTicketEvent('ticket:updated', ticket);
    return ticket;
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', ticketAttachmentUploadOptions))
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('No file was provided.');
    }

    const attachment = await this.authGateway.send<TicketAttachmentDto>(TICKET_PATTERNS.CREATE_ATTACHMENT, {
      authContext: user,
      ticketId: id,
      fileName: sanitizeDisplayFileName(file.originalname),
      storedFileName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
    });

    // TicketAttachmentDto doesn't carry the ticket's organizationId/customer id,
    // so this routes by the *uploader's* own identity rather than an extra RPC
    // round-trip: `user.organizationId` always matches the ticket's org (already
    // enforced server-side before the upload succeeds), and if the uploader is
    // the customer themselves, their own other sessions get the live update too.
    this.ticketsGateway.emitToOrg(user.organizationId, 'ticket:attachment-added', { ticketId: id, attachment });
    if (user.role === ROLES.CUSTOMER) {
      this.ticketsGateway.emitToCustomer(user.userId, 'ticket:attachment-added', { ticketId: id, attachment });
    }

    return attachment;
  }

  @Get(':id/attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const attachment = await this.authGateway.send<{ fileName: string; storedFileName: string; mimeType: string }>(
      TICKET_PATTERNS.GET_ATTACHMENT,
      { authContext: user, ticketId: id, attachmentId },
    );

    // `storedFileName` is always a server-generated name from the allow-listed
    // extension map (see ticket-attachment-upload.config.ts), so joining it
    // directly cannot escape TICKET_ATTACHMENTS_DIR.
    const filePath = join(TICKET_ATTACHMENTS_DIR, attachment.storedFileName);
    res.setHeader('Content-Type', attachment.mimeType);
    res.download(filePath, attachment.fileName);
  }
}
