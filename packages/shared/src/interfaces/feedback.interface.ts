import type { FeedbackCategory, FeedbackFormStatus, FeedbackQuestionType } from '../constants/feedback';
import type { TicketPersonSummary } from './ticket.interface';

export interface FeedbackQuestionDto {
  id: string;
  formId: string;
  type: FeedbackQuestionType;
  label: string;
  required: boolean;
  order: number;
  /** Only meaningful for TEXT questions; null for RATING (always validated as 1-5). */
  maxLength: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackFormSummaryDto {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  category: FeedbackCategory;
  status: FeedbackFormStatus;
  questionCount: number;
  responseCount: number;
  createdBy: TicketPersonSummary;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackFormDetailDto extends FeedbackFormSummaryDto {
  questions: FeedbackQuestionDto[];
}

export interface FeedbackAnswerDto {
  id: string;
  questionId: string;
  questionLabel: string;
  questionType: FeedbackQuestionType;
  ratingValue: number | null;
  textValue: string | null;
}

export interface FeedbackResponseDto {
  id: string;
  formId: string;
  organizationId: string;
  anonymous: boolean;
  /**
   * The submitting customer's identity — always `null` when `anonymous` is
   * true, for every caller and every endpoint. The row itself still carries
   * `customerId` internally (see auth-service schema) for tenant isolation
   * and abuse prevention; this DTO is the single place identity is masked,
   * so no controller can accidentally leak it.
   */
  customer: TicketPersonSummary | null;
  answers: FeedbackAnswerDto[];
  createdAt: string;
}
