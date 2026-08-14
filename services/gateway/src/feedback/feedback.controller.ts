import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateFeedbackFormDto,
  CreateFeedbackQuestionDto,
  FeedbackFormDetailDto,
  FeedbackFormQueryDto,
  FeedbackFormSummaryDto,
  FeedbackQuestionDto,
  FeedbackResponseDto,
  FeedbackResponseQueryDto,
  FEEDBACK_PATTERNS,
  PaginatedResult,
  ROLES,
  SubmitFeedbackResponseDto,
  UpdateFeedbackFormDto,
  UpdateFeedbackFormStatusDto,
  UpdateFeedbackQuestionDto,
} from '@app/shared';
import { AuthGatewayService } from '../auth/auth-gateway.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

/**
 * Every route is behind JwtAuthGuard + RolesGuard, so `user` is always
 * derived from a verified access token. `authContext` forwarded to
 * auth-service is always built from `user` — a form/response id in the URL
 * only selects *which* record; tenant/ownership authorization is re-checked
 * server-side in FeedbackService against `authContext.organizationId`,
 * never against anything the client sent (mirrors tickets/tickets.controller.ts).
 */
@Controller('feedback')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeedbackController {
  constructor(private readonly authGateway: AuthGatewayService) {}

  @Get('forms')
  @Roles(ROLES.TENANT_OWNER, ROLES.SUPPORT_AGENT, ROLES.CUSTOMER)
  async listForms(@Query() query: FeedbackFormQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<PaginatedResult<FeedbackFormSummaryDto>>(FEEDBACK_PATTERNS.LIST_FORMS, {
      authContext: user,
      ...query,
    });
  }

  @Post('forms')
  @Roles(ROLES.TENANT_OWNER)
  async createForm(@Body() dto: CreateFeedbackFormDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<FeedbackFormDetailDto>(FEEDBACK_PATTERNS.CREATE_FORM, { authContext: user, ...dto });
  }

  @Get('forms/:id')
  @Roles(ROLES.TENANT_OWNER, ROLES.SUPPORT_AGENT, ROLES.CUSTOMER)
  async getForm(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<FeedbackFormDetailDto>(FEEDBACK_PATTERNS.GET_FORM, { authContext: user, formId: id });
  }

  @Patch('forms/:id')
  @Roles(ROLES.TENANT_OWNER)
  async updateForm(@Param('id') id: string, @Body() dto: UpdateFeedbackFormDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<FeedbackFormDetailDto>(FEEDBACK_PATTERNS.UPDATE_FORM, {
      authContext: user,
      formId: id,
      ...dto,
    });
  }

  @Patch('forms/:id/status')
  @Roles(ROLES.TENANT_OWNER)
  async updateFormStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackFormStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authGateway.send<FeedbackFormDetailDto>(FEEDBACK_PATTERNS.UPDATE_FORM_STATUS, {
      authContext: user,
      formId: id,
      status: dto.status,
    });
  }

  @Delete('forms/:id')
  @Roles(ROLES.TENANT_OWNER)
  async deleteForm(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<{ message: string }>(FEEDBACK_PATTERNS.DELETE_FORM, { authContext: user, formId: id });
  }

  @Post('forms/:id/questions')
  @Roles(ROLES.TENANT_OWNER)
  async createQuestion(
    @Param('id') id: string,
    @Body() dto: CreateFeedbackQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authGateway.send<FeedbackQuestionDto>(FEEDBACK_PATTERNS.CREATE_QUESTION, {
      authContext: user,
      formId: id,
      ...dto,
    });
  }

  @Patch('forms/:id/questions/:questionId')
  @Roles(ROLES.TENANT_OWNER)
  async updateQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateFeedbackQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authGateway.send<FeedbackQuestionDto>(FEEDBACK_PATTERNS.UPDATE_QUESTION, {
      authContext: user,
      formId: id,
      questionId,
      ...dto,
    });
  }

  @Delete('forms/:id/questions/:questionId')
  @Roles(ROLES.TENANT_OWNER)
  async deleteQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authGateway.send<{ message: string }>(FEEDBACK_PATTERNS.DELETE_QUESTION, {
      authContext: user,
      formId: id,
      questionId,
    });
  }

  @Post('forms/:id/responses')
  @Roles(ROLES.CUSTOMER)
  async submitResponse(
    @Param('id') id: string,
    @Body() dto: SubmitFeedbackResponseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authGateway.send<FeedbackResponseDto>(FEEDBACK_PATTERNS.CREATE_RESPONSE, {
      authContext: user,
      formId: id,
      ...dto,
    });
  }

  @Get('forms/:id/responses')
  @Roles(ROLES.TENANT_OWNER, ROLES.SUPPORT_AGENT)
  async listResponses(
    @Param('id') id: string,
    @Query() query: FeedbackResponseQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authGateway.send<PaginatedResult<FeedbackResponseDto>>(FEEDBACK_PATTERNS.LIST_RESPONSES, {
      authContext: user,
      formId: id,
      ...query,
    });
  }

  @Get('responses/:id')
  @Roles(ROLES.TENANT_OWNER, ROLES.SUPPORT_AGENT, ROLES.CUSTOMER)
  async getResponse(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<FeedbackResponseDto>(FEEDBACK_PATTERNS.GET_RESPONSE, {
      authContext: user,
      responseId: id,
    });
  }
}
