import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser, JwtAccessPayload } from '@app/shared';

export { AuthenticatedUser };

/**
 * The gateway verifies access tokens statelessly (signature + expiry only) —
 * it deliberately has no database access. Ownership of user data lives in
 * auth-service; a short (15m) access token expiry keeps this trade-off safe.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  validate(payload: JwtAccessPayload): AuthenticatedUser {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token');
    }

    // Defense-in-depth: a token missing tenant/role context must never reach
    // a controller — every downstream authorization decision (RolesGuard,
    // tenant-scoped RPC calls) assumes these claims are present and trustworthy.
    if (!payload.sub || !payload.organizationId || !payload.role) {
      throw new UnauthorizedException('Invalid token');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      role: payload.role,
    };
  }
}
