import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CUSTOMER_JOIN_PATTERNS, JoinPreviewDto } from '@app/shared';
import { AuthGatewayService } from '../auth/auth-gateway.service';

const MIN_TOKEN_LENGTH = 10;

/**
 * Public, unauthenticated routes for a customer opening a join link/QR/code
 * to preview which organization they're about to join. No guard — the
 * customer doesn't have an account yet. Throttled the same way
 * AuthController.verifyEmail/resendOtp are, since these are the only public
 * routes that let a caller probe tokens/codes at scale.
 */
@Controller('join/customer')
export class JoinController {
  constructor(private readonly authGateway: AuthGatewayService) {}

  @Get(':token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async resolveByToken(@Param('token') token: string) {
    if (!token || token.length < MIN_TOKEN_LENGTH) {
      throw new BadRequestException('This join link is invalid or has been revoked.');
    }
    return this.authGateway.send<JoinPreviewDto>(CUSTOMER_JOIN_PATTERNS.RESOLVE_BY_TOKEN, { token });
  }

  @Get('code/:code')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async resolveByCode(@Param('code') code: string) {
    if (!code) {
      throw new BadRequestException('This join code is invalid or has been revoked.');
    }
    return this.authGateway.send<JoinPreviewDto>(CUSTOMER_JOIN_PATTERNS.RESOLVE_BY_CODE, { code });
  }
}
