import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import * as argon2 from 'argon2';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CustomerJoinService } from '../customer-join/customer-join.service';
import {
  RegisterDto,
  RegisterCustomerDto,
  LoginDto,
  VerifyEmailDto,
  ResendOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  UpdateProfileDto,
  PublicUser,
  ROLES,
  RpcAuthContext,
  TokenPair,
} from '@app/shared';
import { generateSecureToken, generateOtp, hashToken, safeCompareHex } from './utils/token.util';

/** e.g. "jane.doe@example.com" -> "ja***@example.com" — safe for logs. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
    emailVerified: user.emailVerified,
    avatarUrl: user.avatarUrl,
  };
}

const GENERIC_AUTH_ERROR = 'Invalid email or password';
const GENERIC_TOKEN_ERROR = 'Invalid or expired token';
const GENERIC_FORGOT_PASSWORD_MESSAGE = 'If an account with that email exists, a password reset link has been sent.';

// Phase 10: OTP-based registration email verification (replaces the old
// link-token flow — see the User model comment in schema.prisma).
const OTP_EXPIRES_IN_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
// Deliberately identical whether the account doesn't exist, is already
// verified, or has no OTP pending — never lets a caller distinguish these
// (Step 18: don't expose whether sensitive account information exists).
const GENERIC_OTP_ERROR = 'Invalid or expired verification code.';
const GENERIC_RESEND_MESSAGE = 'If that account needs verification, a new code has been sent.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly customerJoin: CustomerJoinService,
  ) {}

  private get accessTokenExpiresIn(): StringValue {
    return (this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m') as StringValue;
  }

  private get refreshTokenExpiresIn(): StringValue {
    return (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d') as StringValue;
  }

  private async signTokenPair(user: User): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        organizationId: user.organizationId,
        role: user.role,
        type: 'access',
      },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.accessTokenExpiresIn,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      {
        sub: user.id,
        type: 'refresh',
        jti: generateSecureToken(),
      },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.refreshTokenExpiresIn,
      },
    );

    return { accessToken, refreshToken };
  }

  async register(
    dto: RegisterDto,
  ): Promise<{ message: string; organizationId: string; userId: string; emailSent: boolean }> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.emailVerified) {
        throw new ConflictException('An account with this email already exists. Please log in instead.');
      }
      // Recovery flow: a previous registration attempt already created this
      // account but it was never verified. The unique email constraint means
      // we can never create a second row for it anyway — so instead of a
      // blanket 409, re-issue a fresh OTP for the *same* account and route
      // the caller through the exact same success path a brand-new
      // registration takes (see RegisterPage: any non-throwing response
      // redirects to /verify-email).
      return this.reissueRegistrationOtp(existing);
    }

    const passwordHash = await argon2.hash(dto.password);
    const otp = generateOtp();
    const otpHash = hashToken(otp);
    const now = new Date();
    const emailVerificationOtpExpiresAt = new Date(now.getTime() + OTP_EXPIRES_IN_MINUTES * 60_000);

    let organizationId: string;
    let userId: string;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: { name: dto.organizationName.trim() },
        });

        const user = await tx.user.create({
          data: {
            organizationId: organization.id,
            name: dto.name.trim(),
            email,
            passwordHash,
            emailVerificationOtpHash: otpHash,
            emailVerificationOtpExpiresAt,
            emailVerificationOtpAttempts: 0,
            emailVerificationOtpLastSentAt: now,
          },
        });

        return { organizationId: organization.id, userId: user.id };
      });

      organizationId = result.organizationId;
      userId = result.userId;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }

    this.logger.log(`Registration OTP generated and saved for ${maskEmail(email)}`);

    // Awaited: the account above is committed either way (a transient email
    // failure must not undo a valid registration), but the response must not
    // claim the code was emailed when the provider actually rejected it —
    // see MailService.sendMail's return value.
    const emailSent = await this.mail.sendOtpEmail(email, otp, { recipientName: dto.name.trim() });

    return {
      message: emailSent
        ? 'Registration successful. Please check your email for a verification code.'
        : 'Registration successful, but we were unable to send the verification email. Use "Resend code" on the next screen to try again.',
      organizationId,
      userId,
      emailSent,
    };
  }

  /**
   * Shared by register()/registerCustomer() when the email already belongs
   * to an unverified account: re-issues a fresh OTP for that *same* account
   * (never creates a second row) and returns the identical response shape a
   * fresh registration would, so callers can redirect to /verify-email
   * without special-casing this path. Respects the same resend cooldown as
   * resendOtp() so retried registration submissions can't be used to spam
   * the mailbox.
   */
  private async reissueRegistrationOtp(
    user: User,
  ): Promise<{ message: string; organizationId: string; userId: string; emailSent: boolean }> {
    const now = new Date();
    const withinCooldown =
      user.emailVerificationOtpLastSentAt &&
      (now.getTime() - user.emailVerificationOtpLastSentAt.getTime()) / 1000 < OTP_RESEND_COOLDOWN_SECONDS;

    let emailSent = false;
    if (!withinCooldown) {
      const otp = generateOtp();
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationOtpHash: hashToken(otp),
          emailVerificationOtpExpiresAt: new Date(now.getTime() + OTP_EXPIRES_IN_MINUTES * 60_000),
          emailVerificationOtpAttempts: 0,
          emailVerificationOtpLastSentAt: now,
        },
      });
      this.logger.log(`Registration OTP re-issued and saved for ${maskEmail(user.email)}`);
      emailSent = await this.mail.sendOtpEmail(user.email, otp, { recipientName: user.name });
    }

    return {
      message: withinCooldown
        ? 'An account with this email already exists but has not been verified. A verification code was already sent recently — check your email, or wait before requesting another.'
        : emailSent
          ? 'An account with this email already exists but has not been verified. We have sent a new verification code.'
          : 'An account with this email already exists but has not been verified, and we were unable to send a new verification code. Use "Resend code" on the next screen to try again.',
      organizationId: user.organizationId,
      userId: user.id,
      emailSent,
    };
  }

  /**
   * Public customer self-signup for an *existing* organization's support
   * portal — unlike register(), this never creates a new organization, and
   * the created account's role is always CUSTOMER, hardcoded here rather
   * than accepted from the client.
   */
  async registerCustomer(
    dto: RegisterCustomerDto,
  ): Promise<{ message: string; organizationId: string; userId: string; emailSent: boolean }> {
    const email = dto.email.trim().toLowerCase();

    // Phase 10: the organization is resolved server-side from the tenant's
    // standing customer-join link/code — never from a client-supplied
    // organizationId (see RegisterCustomerDto's doc comment). Throws the
    // same generic "invalid or revoked" error a mistyped/guessed token would.
    const organizationId = await this.customerJoin.resolveOrganizationIdByToken(dto.joinToken);
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.emailVerified) {
        throw new ConflictException('An account with this email already exists. Please log in instead.');
      }
      if (existing.organizationId !== organizationId) {
        // Never silently move an unverified account to a different
        // organization just because this attempt used a different join
        // link/code — that would be exactly the cross-tenant reassignment
        // Step 7 forbids, just triggered via the recovery path instead of
        // a spoofed organizationId.
        throw new ConflictException('An account with this email already exists for a different organization.');
      }
      return this.reissueRegistrationOtp(existing);
    }

    const passwordHash = await argon2.hash(dto.password);
    const otp = generateOtp();
    const otpHash = hashToken(otp);
    const now = new Date();
    const emailVerificationOtpExpiresAt = new Date(now.getTime() + OTP_EXPIRES_IN_MINUTES * 60_000);

    let userId: string;
    try {
      const user = await this.prisma.user.create({
        data: {
          organizationId: organization.id,
          name: dto.name.trim(),
          email,
          passwordHash,
          role: ROLES.CUSTOMER,
          emailVerificationOtpHash: otpHash,
          emailVerificationOtpExpiresAt,
          emailVerificationOtpAttempts: 0,
          emailVerificationOtpLastSentAt: now,
        },
      });
      userId = user.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }

    this.logger.log(`Registration OTP generated and saved for ${maskEmail(email)}`);

    // Awaited — see the identical comment in register() above.
    const emailSent = await this.mail.sendOtpEmail(email, otp, {
      recipientName: dto.name.trim(),
      organizationName: organization.name,
    });

    return {
      message: emailSent
        ? 'Registration successful. Please check your email for a verification code.'
        : 'Registration successful, but we were unable to send the verification email. Use "Resend code" on the next screen to try again.',
      organizationId: organization.id,
      userId,
      emailSent,
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Same generic error whether the account doesn't exist, is already
    // verified, or has no OTP pending — never distinguishable to the caller.
    if (!user || user.emailVerified || !user.emailVerificationOtpHash || !user.emailVerificationOtpExpiresAt) {
      throw new BadRequestException({ message: GENERIC_OTP_ERROR, code: 'OTP_INVALID' });
    }

    if (user.emailVerificationOtpAttempts >= OTP_MAX_ATTEMPTS) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerificationOtpHash: null, emailVerificationOtpExpiresAt: null, emailVerificationOtpAttempts: 0 },
      });
      throw new BadRequestException({
        message: 'Too many incorrect attempts. Please request a new code.',
        code: 'OTP_TOO_MANY_ATTEMPTS',
      });
    }

    if (user.emailVerificationOtpExpiresAt.getTime() < Date.now()) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerificationOtpHash: null, emailVerificationOtpExpiresAt: null, emailVerificationOtpAttempts: 0 },
      });
      throw new BadRequestException({
        message: 'This verification code has expired. Please request a new one.',
        code: 'OTP_EXPIRED',
      });
    }

    if (!safeCompareHex(hashToken(dto.otp), user.emailVerificationOtpHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerificationOtpAttempts: { increment: 1 } },
      });
      throw new BadRequestException({
        message: 'The verification code you entered is incorrect.',
        code: 'OTP_INVALID',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationOtpHash: null,
        emailVerificationOtpExpiresAt: null,
        emailVerificationOtpAttempts: 0,
        emailVerificationOtpLastSentAt: null,
      },
    });

    return { message: 'Email verified successfully.' };
  }

  /**
   * Anti-enumeration by design (Step 18): always returns the same generic
   * message regardless of whether the account exists, is already verified,
   * or is mid-cooldown — the only observable difference is that a
   * still-cooling-down caller also gets a `retryAfterSeconds` hint back so
   * the UI can render an accurate countdown without that hint ever
   * confirming account existence on its own (a non-existent account simply
   * never has a `retryAfterSeconds` to report).
   */
  async resendOtp(dto: ResendOtpDto): Promise<{ message: string; retryAfterSeconds?: number }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.emailVerified) {
      return { message: GENERIC_RESEND_MESSAGE };
    }

    if (user.emailVerificationOtpLastSentAt) {
      const elapsedSeconds = (Date.now() - user.emailVerificationOtpLastSentAt.getTime()) / 1000;
      if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
        return {
          message: GENERIC_RESEND_MESSAGE,
          retryAfterSeconds: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds),
        };
      }
    }

    const otp = generateOtp();
    const now = new Date();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationOtpHash: hashToken(otp),
        emailVerificationOtpExpiresAt: new Date(now.getTime() + OTP_EXPIRES_IN_MINUTES * 60_000),
        emailVerificationOtpAttempts: 0,
        emailVerificationOtpLastSentAt: now,
      },
    });
    void this.mail.sendOtpEmail(email, otp);

    return { message: GENERIC_RESEND_MESSAGE };
  }

  async login(dto: LoginDto): Promise<{ tokens: TokenPair; user: PublicUser }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email }, include: { organization: true } });

    if (!user) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    if (!user.emailVerified) {
      // Machine-readable `code` (mirroring the OTP_* error shape used
      // elsewhere) so the frontend can reliably show a "Verify email" /
      // "Resend code" action instead of just displaying the message text.
      throw new ForbiddenException({ message: 'Please verify your email before logging in.', code: 'EMAIL_NOT_VERIFIED' });
    }

    if (!user.isActive) {
      throw new ForbiddenException('This account has been deactivated.');
    }

    // Phase 9: a platform-level hold on the whole organization, distinct from this user's
    // own isActive flag above. PLATFORM_ADMIN is exempt — suspension is a tool platform
    // admin applies *to* tenants, and a platform admin's own placeholder organization row
    // is never a real tenant to suspend.
    if (user.role !== ROLES.PLATFORM_ADMIN && user.organization.isSuspended) {
      throw new ForbiddenException('This organization has been suspended. Contact support for assistance.');
    }

    const tokens = await this.signTokenPair(user);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: hashToken(tokens.refreshToken) },
    });

    return { tokens, user: toPublicUser(user) };
  }

  async refresh(providedRefreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; type: string };
    try {
      payload = await this.jwt.verifyAsync(providedRefreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { organization: true } });
    if (!user || !user.refreshTokenHash || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const providedHash = hashToken(providedRefreshToken);
    if (!safeCompareHex(providedHash, user.refreshTokenHash)) {
      // Possible token theft/reuse of a rotated-out token: revoke the whole session.
      await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: null } });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Same suspension rule as login() — an existing refresh token must not keep granting
    // fresh access tokens once the organization is suspended (Step 10: a blocked login
    // combined with a still-working refresh would defeat the point of suspending).
    if (user.role !== ROLES.PLATFORM_ADMIN && user.organization.isSuspended) {
      await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: null } });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokens = await this.signTokenPair(user);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: hashToken(tokens.refreshToken) },
    });

    return tokens;
  }

  async logout(refreshTokenFromCookie: string | undefined): Promise<void> {
    if (!refreshTokenFromCookie) return;

    let payload: { sub: string; type: string };
    try {
      payload = await this.jwt.verifyAsync(refreshTokenFromCookie, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        ignoreExpiration: true,
      });
    } catch {
      return;
    }

    if (payload.type !== 'refresh') return;

    await this.prisma.user.updateMany({
      where: { id: payload.sub },
      data: { refreshTokenHash: null },
    });
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      const code = generateOtp();
      const codeHash = hashToken(code);
      const expiresInMinutes = Number(this.config.get<string>('PASSWORD_RESET_EXPIRES_IN_MINUTES') ?? 30);
      const passwordResetExpiresAt = new Date(Date.now() + expiresInMinutes * 60_000);

      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordResetOtpHash: codeHash, passwordResetExpiresAt, passwordResetOtpAttempts: 0 },
      });

      // A code the user types on whichever app they're already on beats a
      // link: unlike a link embedded in the email, it never has to guess
      // which of the four separately-deployed frontends to point at, and a
      // repeat forgotPassword() call (the reset-password page's own "Resend
      // code") naturally issues a fresh code the same way a fresh /register
      // OTP does.
      void this.mail.sendPasswordResetOtpEmail(email, code);
    }

    return { message: GENERIC_FORGOT_PASSWORD_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Same generic error whether the account doesn't exist, has no reset
    // pending, the code is wrong, or it's expired — mirrors verifyEmail()'s
    // anti-enumeration guarantee (Step 18).
    if (!user || !user.passwordResetOtpHash || !user.passwordResetExpiresAt) {
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    }

    if (user.passwordResetOtpAttempts >= OTP_MAX_ATTEMPTS) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordResetOtpHash: null, passwordResetExpiresAt: null, passwordResetOtpAttempts: 0 },
      });
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    }

    if (user.passwordResetExpiresAt.getTime() < Date.now()) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordResetOtpHash: null, passwordResetExpiresAt: null, passwordResetOtpAttempts: 0 },
      });
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    }

    if (!safeCompareHex(hashToken(dto.code), user.passwordResetOtpHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordResetOtpAttempts: { increment: 1 } },
      });
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    }

    const passwordHash = await argon2.hash(dto.newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetOtpHash: null,
        passwordResetExpiresAt: null,
        passwordResetOtpAttempts: 0,
        // Invalidate any existing session so the old refresh token stops working too.
        refreshTokenHash: null,
      },
    });

    return { message: 'Password has been reset successfully.' };
  }

  async getById(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return toPublicUser(user);
  }

  /**
   * Self-service password change. Requires proving possession of the
   * current password (never trusts an authenticated session alone) —
   * `authContext.userId` is the only source of *which* account this is, so
   * a caller can never target another user's password. Invalidates the
   * existing refresh token the same way resetPassword does, forcing
   * re-login on any other device/session.
   */
  async changePassword(authContext: RpcAuthContext, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: authContext.userId } });
    if (!user) {
      throw new UnauthorizedException();
    }

    const currentValid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!currentValid) {
      throw new BadRequestException('The current password you entered is incorrect.');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, refreshTokenHash: null },
    });

    return { message: 'Password changed successfully.' };
  }

  /**
   * Self-service profile edit. Deliberately scoped to what UpdateProfileDto
   * allows (name, avatarUrl) — never email/role/organizationId, mirroring
   * every other "can only edit their own, limited slice of data" service in
   * this codebase (e.g. OrganizationsController.updateOwn).
   */
  async updateProfile(authContext: RpcAuthContext, dto: UpdateProfileDto & { avatarUrl?: string }): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id: authContext.userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
    });
    return toPublicUser(user);
  }
}
