import { IsIn } from 'class-validator';
import { FEEDBACK_FORM_STATUSES, type FeedbackFormStatus } from '../constants/feedback';

export class UpdateFeedbackFormStatusDto {
  @IsIn(Object.values(FEEDBACK_FORM_STATUSES))
  status!: FeedbackFormStatus;
}
