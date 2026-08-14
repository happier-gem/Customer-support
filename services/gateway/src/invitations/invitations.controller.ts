import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { AcceptInvitationDto, INVITATION_PATTERNS, InvitationPreviewDto } from '@app/shared';
import { AuthGatewayService } from '../auth/auth-gateway.service';

const MIN_TOKEN_LENGTH = 10;

/**
 * Public, unauthenticated routes for an invitee to look up and accept an
 * invitation. No JwtAuthGuard here — the invitee doesn't have an account
 * yet. The opaque `:token` itself is the sole authority: auth-service
 * resolves the organization, role, and email from the invitation record it
 * points to, never from anything else in the request.
 */
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly authGateway: AuthGatewayService) {}

  @Get(':token')
  async validate(@Param('token') token: string) {
    this.assertTokenShape(token);
    return this.authGateway.send<InvitationPreviewDto>(INVITATION_PATTERNS.VALIDATE, { token });
  }

  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  async accept(@Param('token') token: string, @Body() dto: AcceptInvitationDto) {
    this.assertTokenShape(token);
    return this.authGateway.send<{ message: string; email: string }>(INVITATION_PATTERNS.ACCEPT, {
      token,
      name: dto.name,
      password: dto.password,
    });
  }

  private assertTokenShape(token: string): void {
    if (!token || token.length < MIN_TOKEN_LENGTH) {
      throw new BadRequestException('This invitation link is invalid or has expired.');
    }
  }
}
