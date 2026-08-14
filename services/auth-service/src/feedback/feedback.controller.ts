import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { FEEDBACK_PATTERNS, FeedbackCategory, FeedbackFormStatus, FeedbackQuestionType, RpcAuthContext } from '@app/shared';
import { FeedbackAnswerInput, FeedbackFormListQuery, FeedbackResponseListQuery, FeedbackService } from './feedback.service';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';

@Controller()
@UseFilters(RpcExceptionFilter)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @MessagePattern(FEEDBACK_PATTERNS.CREATE_FORM)
  createForm(
    @Payload() data: { authContext: RpcAuthContext; title: string; description?: string; category?: FeedbackCategory },
  ) {
    return this.feedbackService.createForm(data.authContext, data);
  }

  @MessagePattern(FEEDBACK_PATTERNS.LIST_FORMS)
  listForms(@Payload() data: { authContext: RpcAuthContext } & FeedbackFormListQuery) {
    const { authContext, ...query } = data;
    return this.feedbackService.listForms(authContext, query);
  }

  @MessagePattern(FEEDBACK_PATTERNS.GET_FORM)
  getForm(@Payload() data: { authContext: RpcAuthContext; formId: string }) {
    return this.feedbackService.getFormById(data.authContext, data.formId);
  }

  @MessagePattern(FEEDBACK_PATTERNS.UPDATE_FORM)
  updateForm(
    @Payload()
    data: { authContext: RpcAuthContext; formId: string; title?: string; description?: string; category?: FeedbackCategory },
  ) {
    return this.feedbackService.updateForm(data.authContext, data.formId, data);
  }

  @MessagePattern(FEEDBACK_PATTERNS.UPDATE_FORM_STATUS)
  updateFormStatus(@Payload() data: { authContext: RpcAuthContext; formId: string; status: FeedbackFormStatus }) {
    return this.feedbackService.updateFormStatus(data.authContext, data.formId, data.status);
  }

  @MessagePattern(FEEDBACK_PATTERNS.DELETE_FORM)
  async deleteForm(@Payload() data: { authContext: RpcAuthContext; formId: string }) {
    await this.feedbackService.deleteForm(data.authContext, data.formId);
    return { message: 'Feedback form deleted.' };
  }

  @MessagePattern(FEEDBACK_PATTERNS.CREATE_QUESTION)
  createQuestion(
    @Payload()
    data: {
      authContext: RpcAuthContext;
      formId: string;
      type: FeedbackQuestionType;
      label: string;
      required?: boolean;
      order?: number;
      maxLength?: number;
    },
  ) {
    return this.feedbackService.createQuestion(data.authContext, data.formId, data);
  }

  @MessagePattern(FEEDBACK_PATTERNS.UPDATE_QUESTION)
  updateQuestion(
    @Payload()
    data: {
      authContext: RpcAuthContext;
      formId: string;
      questionId: string;
      label?: string;
      required?: boolean;
      order?: number;
      maxLength?: number;
    },
  ) {
    return this.feedbackService.updateQuestion(data.authContext, data.formId, data.questionId, data);
  }

  @MessagePattern(FEEDBACK_PATTERNS.DELETE_QUESTION)
  async deleteQuestion(@Payload() data: { authContext: RpcAuthContext; formId: string; questionId: string }) {
    await this.feedbackService.deleteQuestion(data.authContext, data.formId, data.questionId);
    return { message: 'Feedback question deleted.' };
  }

  @MessagePattern(FEEDBACK_PATTERNS.CREATE_RESPONSE)
  createResponse(
    @Payload() data: { authContext: RpcAuthContext; formId: string; anonymous?: boolean; answers: FeedbackAnswerInput[] },
  ) {
    return this.feedbackService.submitResponse(data.authContext, data.formId, data);
  }

  @MessagePattern(FEEDBACK_PATTERNS.LIST_RESPONSES)
  listResponses(@Payload() data: { authContext: RpcAuthContext; formId: string } & FeedbackResponseListQuery) {
    const { authContext, formId, ...query } = data;
    return this.feedbackService.listResponses(authContext, formId, query);
  }

  @MessagePattern(FEEDBACK_PATTERNS.GET_RESPONSE)
  getResponse(@Payload() data: { authContext: RpcAuthContext; responseId: string }) {
    return this.feedbackService.getResponseById(data.authContext, data.responseId);
  }
}
