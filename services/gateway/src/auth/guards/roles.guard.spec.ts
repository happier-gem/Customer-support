import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES } from '@app/shared';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  function makeContext(user: unknown) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('allows the request through when the route has no @Roles() metadata', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(makeContext({ role: ROLES.CUSTOMER }))).toBe(true);
  });

  it('allows a user whose role is in the required list', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([ROLES.TENANT_OWNER, ROLES.PLATFORM_ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(makeContext({ role: ROLES.TENANT_OWNER }))).toBe(true);
  });

  it('rejects a user whose role is not in the required list (insufficient role)', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([ROLES.PLATFORM_ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(makeContext({ role: ROLES.CUSTOMER }))).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user on the request', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([ROLES.TENANT_OWNER]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
