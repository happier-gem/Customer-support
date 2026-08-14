import { SetMetadata } from '@nestjs/common';
import type { Role } from '@app/shared';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles. Must be combined with JwtAuthGuard + RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
