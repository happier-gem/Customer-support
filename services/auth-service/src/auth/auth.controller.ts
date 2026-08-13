import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { AUTH_PATTERNS, RegisterDto, LoginDto, VerifyEmailDto, ForgotPasswordDto, ResetPasswordDto } from '@app/shared';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';

@Controller()
@UseFilters(RpcExceptionFilter)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern(AUTH_PATTERNS.REGISTER)
  register(@Payload() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @MessagePattern(AUTH_PATTERNS.VERIFY_EMAIL)
  verifyEmail(@Payload() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @MessagePattern(AUTH_PATTERNS.LOGIN)
  login(@Payload() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @MessagePattern(AUTH_PATTERNS.REFRESH)
  refresh(@Payload() data: { refreshToken: string }) {
    return this.authService.refresh(data.refreshToken);
  }

  @MessagePattern(AUTH_PATTERNS.LOGOUT)
  async logout(@Payload() data: { refreshToken?: string }) {
    await this.authService.logout(data.refreshToken);
    return { success: true };
  }

  @MessagePattern(AUTH_PATTERNS.FORGOT_PASSWORD)
  forgotPassword(@Payload() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @MessagePattern(AUTH_PATTERNS.RESET_PASSWORD)
  resetPassword(@Payload() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @MessagePattern(AUTH_PATTERNS.ME)
  me(@Payload() data: { userId: string }) {
    return this.authService.getById(data.userId);
  }
}
