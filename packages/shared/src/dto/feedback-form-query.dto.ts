import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_FORM_STATUSES,
  FEEDBACK_MAX_PAGE_SIZE,
  type FeedbackCategory,
  type FeedbackFormStatus,
} from '../constants/feedback';

/** Used by GET /feedback/forms. A CUSTOMER's `status` filter is ignored server-side — they only ever see ACTIVE forms. */
export class FeedbackFormQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(FEEDBACK_MAX_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @IsIn(Object.values(FEEDBACK_CATEGORIES))
  category?: FeedbackCategory;

  @IsOptional()
  @IsIn(Object.values(FEEDBACK_FORM_STATUSES))
  status?: FeedbackFormStatus;
}
