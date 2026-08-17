import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AUTH_PATTERNS,
  RegisterDto,
  RegisterCustomerDto,
  LoginDto,
  VerifyEmailDto,
  ResendOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
  PublicUser,
  TokenPair,
} from '@app/shared';
import { AuthGatewayService } from './auth-gateway.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './strategies/jwt.strategy';
import { parseDurationMs } from './utils/duration.util';

const REFRESH_COOKIE_NAME = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authGateway: AuthGatewayService,
    private readonly config: ConfigService,
  ) {}

  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/auth',
      maxAge: parseDurationMs(this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d'),
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authGateway.send(AUTH_PATTERNS.REGISTER, dto);
  }

  @Post('register-customer')
  @HttpCode(HttpStatus.CREATED)
  async registerCustomer(@Body() dto: RegisterCustomerDto) {
    return this.authGateway.send(AUTH_PATTERNS.REGISTER_CUSTOMER, dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authGateway.send(AUTH_PATTERNS.VERIFY_EMAIL, dto);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authGateway.send(AUTH_PATTERNS.RESEND_OTP, dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authGateway.send<{ tokens: TokenPair; user: PublicUser }>(
      AUTH_PATTERNS.LOGIN,
      dto,
    );
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return { accessToken: result.tokens.accessToken, user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const provided: string | undefined = req.cookies?.[REFRESH_COOKIE_NAME] ?? dto.refreshToken;
    if (!provided) {
      this.clearRefreshCookie(res);
      return { message: 'No refresh token provided' };
    }

    const tokens = await this.authGateway.send<TokenPair>(AUTH_PATTERNS.REFRESH, { refreshToken: provided });
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const provided: string | undefined = req.cookies?.[REFRESH_COOKIE_NAME] ?? dto.refreshToken;
    await this.authGateway.send(AUTH_PATTERNS.LOGOUT, { refreshToken: provided });
    this.clearRefreshCookie(res);
    return { message: 'Logged out successfully.' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authGateway.send(AUTH_PATTERNS.FORGOT_PASSWORD, dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authGateway.send(AUTH_PATTERNS.RESET_PASSWORD, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<PublicUser>(AUTH_PATTERNS.ME, { userId: user.userId });
  }
}
