import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ACCOUNT_STATUSES, ADMIN_USER_MAX_PAGE_SIZE, type AccountStatus } from '../constants/admin';
import { ROLES, type Role } from '../constants/roles';

/** Used by GET /admin/users. Every filter is applied at the database-query level. */
export class AdminUserQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_USER_MAX_PAGE_SIZE)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(Object.values(ROLES))
  role?: Role;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsIn(Object.values(ACCOUNT_STATUSES))
  status?: AccountStatus;
}
