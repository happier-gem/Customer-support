import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FeedbackAnswer, FeedbackForm, FeedbackQuestion, FeedbackResponse, Prisma, User } from '@prisma/client';
import {
  DEFAULT_FEEDBACK_CATEGORY,
  FEEDBACK_DEFAULT_PAGE_SIZE,
  FEEDBACK_DEFAULT_TEXT_MAX_LENGTH,
  FEEDBACK_FORM_STATUSES,
  FEEDBACK_MAX_PAGE_SIZE,
  FEEDBACK_QUESTION_TYPES,
  FEEDBACK_RATING_MAX,
  FEEDBACK_RATING_MIN,
  FeedbackAnswerDto,
  FeedbackCategory,
  FeedbackFormDetailDto,
  FeedbackFormStatus,
  FeedbackFormSummaryDto,
  FeedbackQuestionDto,
  FeedbackQuestionType,
  FeedbackResponseDto,
  PaginatedResult,
  ROLES,
  RpcAuthContext,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

const PARTY_SELECT = { id: true, name: true, email: true } as const;

type FormWithCreatorAndCounts = FeedbackForm & {
  createdBy: Pick<User, 'id' | 'name' | 'email'>;
  _count: { questions: number; responses: number };
};

type FormWithQuestionsAndCounts = FormWithCreatorAndCounts & { questions: FeedbackQuestion[] };

type AnswerWithQuestion = FeedbackAnswer & { question: Pick<FeedbackQuestion, 'id' | 'label' | 'type'> };

type ResponseWithAnswers = FeedbackResponse & {
  customer: Pick<User, 'id' | 'name' | 'email'>;
  answers: AnswerWithQuestion[];
};

const FORM_INCLUDE = {
  createdBy: { select: PARTY_SELECT },
  _count: { select: { questions: true, responses: true } },
} satisfies Prisma.FeedbackFormInclude;

const FORM_DETAIL_INCLUDE = {
  createdBy: { select: PARTY_SELECT },
  _count: { select: { questions: true, responses: true } },
  questions: { orderBy: { order: 'asc' } },
} satisfies Prisma.FeedbackFormInclude;

const RESPONSE_INCLUDE = {
  customer: { select: PARTY_SELECT },
  answers: { include: { question: { select: { id: true, label: true, type: true } } } },
} satisfies Prisma.FeedbackResponseInclude;

function toQuestionDto(question: FeedbackQuestion): FeedbackQuestionDto {
  return {
    id: question.id,
    formId: question.formId,
    type: question.type as FeedbackQuestionType,
    label: question.label,
    required: question.required,
    order: question.order,
    maxLength: question.maxLength,
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
  };
}

function toFormSummaryDto(form: FormWithCreatorAndCounts): FeedbackFormSummaryDto {
  return {
    id: form.id,
    organizationId: form.organizationId,
    title: form.title,
    description: form.description,
    category: form.category as FeedbackCategory,
    status: form.status as FeedbackFormStatus,
    questionCount: form._count.questions,
    responseCount: form._count.responses,
    createdBy: form.createdBy,
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
  };
}

function toFormDetailDto(form: FormWithQuestionsAndCounts): FeedbackFormDetailDto {
  return {
    ...toFormSummaryDto(form),
    questions: form.questions.map(toQuestionDto),
  };
}

/**
 * `anonymous` is masked here — the single place a FeedbackResponse becomes a
 * FeedbackResponseDto — so every endpoint that returns a response (owner
 * listing, agent listing, single-response lookup, even the submitting
 * customer's own view) gets the same masking with no way to bypass it via
 * another route.
 */
function toResponseDto(response: ResponseWithAnswers): FeedbackResponseDto {
  return {
    id: response.id,
    formId: response.formId,
    organizationId: response.organizationId,
    anonymous: response.anonymous,
    customer: response.anonymous ? null : response.customer,
    answers: response.answers.map(
      (answer): FeedbackAnswerDto => ({
        id: answer.id,
        questionId: answer.questionId,
        questionLabel: answer.question.label,
        questionType: answer.question.type as FeedbackQuestionType,
        ratingValue: answer.ratingValue,
        textValue: answer.textValue,
      }),
    ),
    createdAt: response.createdAt.toISOString(),
  };
}

export interface FeedbackFormListQuery {
  page?: number;
  limit?: number;
  category?: FeedbackCategory;
  status?: FeedbackFormStatus;
}

export interface FeedbackResponseListQuery {
  page?: number;
  limit?: number;
}

export interface FeedbackAnswerInput {
  questionId: string;
  ratingValue?: number;
  textValue?: string;
}

/**
 * Owns all Phase 5 feedback data. Every query is scoped by
 * `authContext.organizationId` (from the caller's verified JWT) — the same
 * discipline as TicketsService: a client can never choose which tenant's
 * forms/responses it sees or writes to by supplying an id in a route,
 * query, or body. Cross-tenant lookups fail as "not found" rather than
 * "forbidden" so a caller can't use this service to probe which ids exist
 * in another organization.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  // ---------------------------------------------------------------------
  // Forms
  // ---------------------------------------------------------------------

  async createForm(
    authContext: RpcAuthContext,
    dto: { title: string; description?: string; category?: FeedbackCategory },
  ): Promise<FeedbackFormDetailDto> {
    if (authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a tenant owner can create a feedback form.');
    }

    const form = await this.prisma.$transaction(async (tx) => {
      // See TicketsService.create: must run first, inside this transaction,
      // so the lock it holds serializes concurrent form creation for the
      // same org until commit.
      await this.subscriptions.assertCanCreateFeedbackForm(tx, authContext.organizationId);

      return tx.feedbackForm.create({
        data: {
          organizationId: authContext.organizationId,
          createdById: authContext.userId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          category: dto.category ?? DEFAULT_FEEDBACK_CATEGORY,
          status: FEEDBACK_FORM_STATUSES.INACTIVE,
        },
        include: FORM_DETAIL_INCLUDE,
      });
    });

    return toFormDetailDto(form);
  }

  async listForms(
    authContext: RpcAuthContext,
    query: FeedbackFormListQuery,
  ): Promise<PaginatedResult<FeedbackFormSummaryDto>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, FEEDBACK_MAX_PAGE_SIZE) : FEEDBACK_DEFAULT_PAGE_SIZE;

    const where: Prisma.FeedbackFormWhereInput = { organizationId: authContext.organizationId };

    // A customer only ever sees forms that are open for submission —
    // draft/deactivated forms are never listed to them, regardless of what
    // `status` they pass.
    if (authContext.role === ROLES.CUSTOMER) {
      where.status = FEEDBACK_FORM_STATUSES.ACTIVE;
    } else if (query.status) {
      where.status = query.status;
    }

    if (query.category) {
      where.category = query.category;
    }

    const [total, forms] = await this.prisma.$transaction([
      this.prisma.feedbackForm.count({ where }),
      this.prisma.feedbackForm.findMany({
        where,
        include: FORM_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: forms.map(toFormSummaryDto),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** Tenant-scoped form lookup shared by every single-form operation. A CUSTOMER may only ever resolve an ACTIVE form. */
  private async getAccessibleForm(authContext: RpcAuthContext, formId: string): Promise<FormWithQuestionsAndCounts> {
    const form = await this.prisma.feedbackForm.findFirst({
      where: { id: formId, organizationId: authContext.organizationId },
      include: FORM_DETAIL_INCLUDE,
    });

    if (!form) {
      throw new NotFoundException('Feedback form not found');
    }

    if (authContext.role === ROLES.CUSTOMER && form.status !== FEEDBACK_FORM_STATUSES.ACTIVE) {
      throw new NotFoundException('Feedback form not found');
    }

    return form;
  }

  async getFormById(authContext: RpcAuthContext, formId: string): Promise<FeedbackFormDetailDto> {
    return toFormDetailDto(await this.getAccessibleForm(authContext, formId));
  }

  /** Tenant Owner-only form lookup for mutation endpoints (update/delete/questions). */
  private async getOwnedForm(authContext: RpcAuthContext, formId: string): Promise<FeedbackForm> {
    if (authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a tenant owner can manage feedback forms.');
    }

    const form = await this.prisma.feedbackForm.findFirst({
      where: { id: formId, organizationId: authContext.organizationId },
    });

    if (!form) {
      throw new NotFoundException('Feedback form not found');
    }

    return form;
  }

  async updateForm(
    authContext: RpcAuthContext,
    formId: string,
    dto: { title?: string; description?: string; category?: FeedbackCategory },
  ): Promise<FeedbackFormDetailDto> {
    const form = await this.getOwnedForm(authContext, formId);

    const data: Prisma.FeedbackFormUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description.trim() || null;
    if (dto.category !== undefined) data.category = dto.category;

    const updated = await this.prisma.feedbackForm.update({
      where: { id: form.id },
      data,
      include: FORM_DETAIL_INCLUDE,
    });

    return toFormDetailDto(updated);
  }

  async updateFormStatus(authContext: RpcAuthContext, formId: string, status: FeedbackFormStatus): Promise<FeedbackFormDetailDto> {
    const form = await this.getOwnedForm(authContext, formId);

    const updated = await this.prisma.feedbackForm.update({
      where: { id: form.id },
      data: { status },
      include: FORM_DETAIL_INCLUDE,
    });

    return toFormDetailDto(updated);
  }

  /**
   * A form with existing responses can't be deleted outright — that would
   * silently destroy submitted feedback history (Part 11's "do not delete
   * historical feedback" applies just as much to deletion as to
   * deactivation). Deactivate it instead.
   */
  async deleteForm(authContext: RpcAuthContext, formId: string): Promise<void> {
    const form = await this.getOwnedForm(authContext, formId);

    const responseCount = await this.prisma.feedbackResponse.count({ where: { formId: form.id } });
    if (responseCount > 0) {
      throw new BadRequestException('Cannot delete a feedback form that already has responses. Deactivate it instead.');
    }

    await this.prisma.feedbackForm.delete({ where: { id: form.id } });
  }

  // ---------------------------------------------------------------------
  // Questions
  // ---------------------------------------------------------------------

  async createQuestion(
    authContext: RpcAuthContext,
    formId: string,
    dto: { type: FeedbackQuestionType; label: string; required?: boolean; order?: number; maxLength?: number },
  ): Promise<FeedbackQuestionDto> {
    const form = await this.getOwnedForm(authContext, formId);

    if (dto.type === FEEDBACK_QUESTION_TYPES.RATING && dto.maxLength !== undefined) {
      throw new BadRequestException('maxLength only applies to TEXT questions.');
    }

    let order = dto.order;
    if (order === undefined) {
      const last = await this.prisma.feedbackQuestion.findFirst({
        where: { formId: form.id },
        orderBy: { order: 'desc' },
      });
      order = last ? last.order + 1 : 0;
    }

    const question = await this.prisma.feedbackQuestion.create({
      data: {
        formId: form.id,
        organizationId: form.organizationId,
        type: dto.type,
        label: dto.label.trim(),
        required: dto.required ?? true,
        order,
        maxLength: dto.type === FEEDBACK_QUESTION_TYPES.TEXT ? (dto.maxLength ?? null) : null,
      },
    });

    return toQuestionDto(question);
  }

  private async getOwnedQuestion(authContext: RpcAuthContext, formId: string, questionId: string): Promise<FeedbackQuestion> {
    const form = await this.getOwnedForm(authContext, formId);

    const question = await this.prisma.feedbackQuestion.findFirst({
      where: { id: questionId, formId: form.id },
    });

    if (!question) {
      throw new NotFoundException('Feedback question not found');
    }

    return question;
  }

  async updateQuestion(
    authContext: RpcAuthContext,
    formId: string,
    questionId: string,
    dto: { label?: string; required?: boolean; order?: number; maxLength?: number },
  ): Promise<FeedbackQuestionDto> {
    const question = await this.getOwnedQuestion(authContext, formId, questionId);

    if (dto.maxLength !== undefined && question.type !== FEEDBACK_QUESTION_TYPES.TEXT) {
      throw new BadRequestException('maxLength only applies to TEXT questions.');
    }

    const data: Prisma.FeedbackQuestionUpdateInput = {};
    if (dto.label !== undefined) data.label = dto.label.trim();
    if (dto.required !== undefined) data.required = dto.required;
    if (dto.order !== undefined) data.order = dto.order;
    if (dto.maxLength !== undefined) data.maxLength = dto.maxLength;

    const updated = await this.prisma.feedbackQuestion.update({ where: { id: question.id }, data });
    return toQuestionDto(updated);
  }

  /** A question that already has submitted answers can't be removed, for the same historical-integrity reason as deleteForm. */
  async deleteQuestion(authContext: RpcAuthContext, formId: string, questionId: string): Promise<void> {
    const question = await this.getOwnedQuestion(authContext, formId, questionId);

    const answerCount = await this.prisma.feedbackAnswer.count({ where: { questionId: question.id } });
    if (answerCount > 0) {
      throw new BadRequestException('Cannot delete a question that already has submitted answers.');
    }

    await this.prisma.feedbackQuestion.delete({ where: { id: question.id } });
  }

  // ---------------------------------------------------------------------
  // Responses
  // ---------------------------------------------------------------------

  /**
   * Implements Part 16's full validation sequence: authenticate (guard) ->
   * resolve organizationId from the JWT-derived authContext -> load the
   * form scoped to that organization -> require ACTIVE -> validate every
   * answer against its question's live type/required/length rules,
   * rejecting unknown ids, cross-form ids, and malformed values -> persist
   * atomically. No partial/malformed response can ever be saved.
   */
  async submitResponse(
    authContext: RpcAuthContext,
    formId: string,
    dto: { anonymous?: boolean; answers: FeedbackAnswerInput[] },
  ): Promise<FeedbackResponseDto> {
    if (authContext.role !== ROLES.CUSTOMER) {
      throw new ForbiddenException('Only a customer can submit feedback.');
    }

    const form = await this.prisma.feedbackForm.findFirst({
      where: { id: formId, organizationId: authContext.organizationId },
      include: { questions: true },
    });

    if (!form) {
      throw new NotFoundException('Feedback form not found');
    }
    if (form.status !== FEEDBACK_FORM_STATUSES.ACTIVE) {
      throw new BadRequestException('This feedback form is not currently accepting responses.');
    }

    const questionsById = new Map(form.questions.map((q) => [q.id, q]));
    const seenQuestionIds = new Set<string>();

    const preparedAnswers = dto.answers.map((answer) => {
      const question = questionsById.get(answer.questionId);
      if (!question) {
        throw new BadRequestException(`Question ${answer.questionId} does not belong to this form.`);
      }
      if (seenQuestionIds.has(answer.questionId)) {
        throw new BadRequestException(`Duplicate answer submitted for question ${answer.questionId}.`);
      }
      seenQuestionIds.add(answer.questionId);

      if (question.type === FEEDBACK_QUESTION_TYPES.RATING) {
        if (answer.textValue !== undefined) {
          throw new BadRequestException(`Question "${question.label}" expects a rating, not text.`);
        }
        if (answer.ratingValue === undefined) {
          if (question.required) {
            throw new BadRequestException(`Question "${question.label}" requires a rating.`);
          }
          return { questionId: question.id, ratingValue: null, textValue: null };
        }
        if (
          !Number.isInteger(answer.ratingValue) ||
          answer.ratingValue < FEEDBACK_RATING_MIN ||
          answer.ratingValue > FEEDBACK_RATING_MAX
        ) {
          throw new BadRequestException(
            `Question "${question.label}" requires an integer rating between ${FEEDBACK_RATING_MIN} and ${FEEDBACK_RATING_MAX}.`,
          );
        }
        return { questionId: question.id, ratingValue: answer.ratingValue, textValue: null };
      }

      // TEXT
      if (answer.ratingValue !== undefined) {
        throw new BadRequestException(`Question "${question.label}" expects text, not a rating.`);
      }
      const text = answer.textValue?.trim();
      if (!text) {
        if (question.required) {
          throw new BadRequestException(`Question "${question.label}" requires an answer.`);
        }
        return { questionId: question.id, ratingValue: null, textValue: null };
      }
      const maxLength = question.maxLength ?? FEEDBACK_DEFAULT_TEXT_MAX_LENGTH;
      if (text.length > maxLength) {
        throw new BadRequestException(`Question "${question.label}" exceeds the maximum length of ${maxLength} characters.`);
      }
      return { questionId: question.id, ratingValue: null, textValue: text };
    });

    for (const question of form.questions) {
      if (question.required && !seenQuestionIds.has(question.id)) {
        throw new BadRequestException(`Missing required answer for question "${question.label}".`);
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const response = await tx.feedbackResponse.create({
        data: {
          formId: form.id,
          organizationId: form.organizationId,
          customerId: authContext.userId,
          anonymous: dto.anonymous ?? false,
        },
      });

      for (const answer of preparedAnswers) {
        await tx.feedbackAnswer.create({
          data: {
            responseId: response.id,
            questionId: answer.questionId,
            organizationId: form.organizationId,
            ratingValue: answer.ratingValue,
            textValue: answer.textValue,
          },
        });
      }

      return tx.feedbackResponse.findUniqueOrThrow({ where: { id: response.id }, include: RESPONSE_INCLUDE });
    });

    return toResponseDto(created);
  }

  async listResponses(
    authContext: RpcAuthContext,
    formId: string,
    query: FeedbackResponseListQuery,
  ): Promise<PaginatedResult<FeedbackResponseDto>> {
    if (authContext.role !== ROLES.TENANT_OWNER && authContext.role !== ROLES.SUPPORT_AGENT) {
      throw new ForbiddenException('Only a tenant owner or support agent can view feedback responses.');
    }

    const form = await this.prisma.feedbackForm.findFirst({
      where: { id: formId, organizationId: authContext.organizationId },
    });
    if (!form) {
      throw new NotFoundException('Feedback form not found');
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, FEEDBACK_MAX_PAGE_SIZE) : FEEDBACK_DEFAULT_PAGE_SIZE;

    const where: Prisma.FeedbackResponseWhereInput = { formId: form.id, organizationId: authContext.organizationId };

    const [total, responses] = await this.prisma.$transaction([
      this.prisma.feedbackResponse.count({ where }),
      this.prisma.feedbackResponse.findMany({
        where,
        include: RESPONSE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: responses.map(toResponseDto),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /**
   * A TENANT_OWNER/SUPPORT_AGENT may look up any response in their own
   * organization; a CUSTOMER may only look up their own — anyone else's
   * response id (even in the same org) resolves as not-found so a customer
   * can't enumerate other customers' feedback.
   */
  async getResponseById(authContext: RpcAuthContext, responseId: string): Promise<FeedbackResponseDto> {
    const response = await this.prisma.feedbackResponse.findFirst({
      where: { id: responseId, organizationId: authContext.organizationId },
      include: RESPONSE_INCLUDE,
    });

    if (!response) {
      throw new NotFoundException('Feedback response not found');
    }

    if (authContext.role === ROLES.CUSTOMER && response.customerId !== authContext.userId) {
      throw new NotFoundException('Feedback response not found');
    }

    return toResponseDto(response);
  }
}
