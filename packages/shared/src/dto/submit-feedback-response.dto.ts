import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { FEEDBACK_TEXT_MAX_LENGTH_CEILING } from '../constants/feedback';

/**
 * One answer to one question. Both value fields are optional at the DTO
 * level — which one is required/allowed depends on the question's type
 * (RATING vs TEXT), which the service looks up server-side; the DTO only
 * enforces the shape and outer bounds of whichever value is present.
 */
export class FeedbackAnswerInputDto {
  @IsUUID()
  questionId!: string;

  @IsOptional()
  @IsInt()
  ratingValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(FEEDBACK_TEXT_MAX_LENGTH_CEILING)
  textValue?: string;
}

export class SubmitFeedbackResponseDto {
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FeedbackAnswerInputDto)
  answers!: FeedbackAnswerInputDto[];
}
