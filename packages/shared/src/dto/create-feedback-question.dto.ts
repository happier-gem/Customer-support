import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import {
  FEEDBACK_QUESTION_LABEL_MAX_LENGTH,
  FEEDBACK_QUESTION_TYPES,
  FEEDBACK_TEXT_MAX_LENGTH_CEILING,
  type FeedbackQuestionType,
} from '../constants/feedback';

export class CreateFeedbackQuestionDto {
  @IsIn(Object.values(FEEDBACK_QUESTION_TYPES))
  type!: FeedbackQuestionType;

  @IsString()
  @MinLength(3)
  @MaxLength(FEEDBACK_QUESTION_LABEL_MAX_LENGTH)
  label!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  /** TEXT only; the service rejects this being set on a RATING question. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(FEEDBACK_TEXT_MAX_LENGTH_CEILING)
  maxLength?: number;
}
