import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Used by PATCH /auth/me/profile. Deliberately excludes email, role, and
 * organizationId — a user can never change those about themselves through
 * this route (mirrors UpdateOrganizationProfileDto's "only what's actually
 * self-editable" shape). avatarUrl is set separately by the upload endpoint,
 * never accepted as a raw string here.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;
}
