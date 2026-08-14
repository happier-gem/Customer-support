import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { FEEDBACK_QUESTION_LABEL_MAX_LENGTH, FEEDBACK_TEXT_MAX_LENGTH_CEILING } from '../constants/feedback';

/** The question's `type` is immutable after creation — changing RATING <-> TEXT would orphan the meaning of any answers already stored against it. */
export class UpdateFeedbackQuestionDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(FEEDBACK_QUESTION_LABEL_MAX_LENGTH)
  label?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(FEEDBACK_TEXT_MAX_LENGTH_CEILING)
  maxLength?: number;
}
