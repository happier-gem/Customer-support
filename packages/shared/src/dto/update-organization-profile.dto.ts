import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsTimezone } from '../validators/is-timezone.validator';

/** Used by PATCH /organizations/me. Every field is optional; only the ones present are updated. */
export class UpdateOrganizationProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsTimezone()
  timezone?: string;
}
