import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { ROLES } from '@app/shared';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  function makeStrategy() {
    const config = { get: () => 'test-secret' } as unknown as ConfigService;
    return new JwtStrategy(config);
  }

  const basePayload = {
    sub: 'user-1',
    email: 'a@example.com',
    organizationId: 'org-1',
    role: ROLES.TENANT_OWNER,
    type: 'access' as const,
  };

  it('returns the authenticated user for a well-formed access-token payload', () => {
    const strategy = makeStrategy();
    expect(strategy.validate(basePayload)).toEqual({
      userId: 'user-1',
      email: 'a@example.com',
      organizationId: 'org-1',
      role: ROLES.TENANT_OWNER,
    });
  });

  it('rejects a refresh-typed token presented as an access token', () => {
    const strategy = makeStrategy();
    expect(() => strategy.validate({ ...basePayload, type: 'refresh' as any })).toThrow(UnauthorizedException);
  });

  it('rejects a payload missing organizationId (missing tenant context)', () => {
    const strategy = makeStrategy();
    const { organizationId, ...rest } = basePayload;
    expect(() => strategy.validate(rest as any)).toThrow(UnauthorizedException);
  });

  it('rejects a payload missing role', () => {
    const strategy = makeStrategy();
    const { role, ...rest } = basePayload;
    expect(() => strategy.validate(rest as any)).toThrow(UnauthorizedException);
  });

  it('rejects a payload missing sub (user id)', () => {
    const strategy = makeStrategy();
    const { sub, ...rest } = basePayload;
    expect(() => strategy.validate(rest as any)).toThrow(UnauthorizedException);
  });
});
