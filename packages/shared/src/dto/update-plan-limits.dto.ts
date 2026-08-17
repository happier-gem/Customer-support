import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Always a full replacement of all three limits, never a partial merge —
 * the admin UI always submits the complete set. `null` means unlimited
 * (mirrors PlanLimits); a provided number must be a positive integer.
 */
export class UpdatePlanLimitsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  teamMembers?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  monthlyTickets?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  feedbackForms?: number | null;
}
