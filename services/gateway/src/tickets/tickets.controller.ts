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
  constructor(private readonly authGateway: AuthGatewayService) {}

  @Post()
  @Roles(ROLES.CUSTOMER)
  async create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<TicketDto>(TICKET_PATTERNS.CREATE, { authContext: user, ...dto });
  }

  @Get()
  async list(@Query() query: TicketQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<PaginatedResult<TicketDto>>(TICKET_PATTERNS.LIST, { authContext: user, ...query });
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
    return this.authGateway.send<TicketDto>(TICKET_PATTERNS.UPDATE_STATUS, {
      authContext: user,
      ticketId: id,
      status: dto.status,
    });
  }

  @Post(':id/assign')
  @Roles(ROLES.TENANT_OWNER)
  async assign(@Param('id') id: string, @Body() dto: AssignTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<TicketDto>(TICKET_PATTERNS.ASSIGN, {
      authContext: user,
      ticketId: id,
      agentId: dto.agentId,
    });
  }

  @Post(':id/assign-self')
  @Roles(ROLES.SUPPORT_AGENT)
  async assignSelf(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<TicketDto>(TICKET_PATTERNS.ASSIGN_SELF, { authContext: user, ticketId: id });
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

    return this.authGateway.send<TicketAttachmentDto>(TICKET_PATTERNS.CREATE_ATTACHMENT, {
      authContext: user,
      ticketId: id,
      fileName: sanitizeDisplayFileName(file.originalname),
      storedFileName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
    });
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
