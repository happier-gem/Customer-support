import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { FEEDBACK_MAX_PAGE_SIZE } from '../constants/feedback';

/** Used by GET /feedback/forms/:id/responses. */
export class FeedbackResponseQueryDto {
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
}
