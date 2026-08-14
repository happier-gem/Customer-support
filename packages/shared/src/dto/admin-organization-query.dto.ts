import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ADMIN_ORG_MAX_PAGE_SIZE, ORGANIZATION_STATUSES, type OrganizationStatus } from '../constants/admin';
import { PLAN_TYPES, type PlanType } from '../constants/subscription';

/** Used by GET /admin/organizations. Every filter is applied at the database-query level. */
export class AdminOrganizationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_ORG_MAX_PAGE_SIZE)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(Object.values(PLAN_TYPES))
  plan?: PlanType;

  @IsOptional()
  @IsIn(Object.values(ORGANIZATION_STATUSES))
  status?: OrganizationStatus;
}
