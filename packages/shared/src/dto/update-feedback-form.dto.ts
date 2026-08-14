import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_FORM_DESCRIPTION_MAX_LENGTH,
  FEEDBACK_FORM_TITLE_MAX_LENGTH,
  type FeedbackCategory,
} from '../constants/feedback';

export class UpdateFeedbackFormDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(FEEDBACK_FORM_TITLE_MAX_LENGTH)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FEEDBACK_FORM_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @IsOptional()
  @IsIn(Object.values(FEEDBACK_CATEGORIES))
  category?: FeedbackCategory;
}
