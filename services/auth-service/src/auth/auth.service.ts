import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import * as argon2 from 'argon2';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  RegisterDto,
  LoginDto,
  VerifyEmailDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  PublicUser,
  TokenPair,
} from '@app/shared';
import { generateSecureToken, hashToken, safeCompareHex } from './utils/token.util';

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
    emailVerified: user.emailVerified,
  };
}

const GENERIC_AUTH_ERROR = 'Invalid email or password';
const GENERIC_TOKEN_ERROR = 'Invalid or expired token';
const GENERIC_FORGOT_PASSWORD_MESSAGE = 'If an account with that email exists, a password reset link has been sent.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
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

  async register(dto: RegisterDto): Promise<{ message: string; organizationId: string; userId: string }> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);
    const verificationToken = generateSecureToken();
    const verificationTokenHash = hashToken(verificationToken);
    const expiresInMinutes = Number(this.config.get<string>('EMAIL_VERIFICATION_EXPIRES_IN_MINUTES') ?? 60);
    const emailVerificationExpiresAt = new Date(Date.now() + expiresInMinutes * 60_000);

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
            emailVerificationTokenHash: verificationTokenHash,
            emailVerificationExpiresAt,
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

    const verificationUrl = `${this.config.get<string>('FRONTEND_URL')}/verify-email?token=${verificationToken}`;
    await this.mail.sendVerificationEmail(email, verificationUrl);

    return {
      message: 'Registration successful. Please check your email to verify your account.',
      organizationId,
      userId,
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const tokenHash = hashToken(dto.token);

    const user = await this.prisma.user.findFirst({ where: { emailVerificationTokenHash: tokenHash } });
    if (!user || !user.emailVerificationExpiresAt) {
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    }

    if (user.emailVerificationExpiresAt.getTime() < Date.now()) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerificationTokenHash: null, emailVerificationExpiresAt: null },
      });
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });

    return { message: 'Email verified successfully.' };
  }

  async login(dto: LoginDto): Promise<{ tokens: TokenPair; user: PublicUser }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email before logging in.');
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

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const providedHash = hashToken(providedRefreshToken);
    if (!safeCompareHex(providedHash, user.refreshTokenHash)) {
      // Possible token theft/reuse of a rotated-out token: revoke the whole session.
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
      const resetToken = generateSecureToken();
      const resetTokenHash = hashToken(resetToken);
      const expiresInMinutes = Number(this.config.get<string>('PASSWORD_RESET_EXPIRES_IN_MINUTES') ?? 30);
      const passwordResetExpiresAt = new Date(Date.now() + expiresInMinutes * 60_000);

      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordResetTokenHash: resetTokenHash, passwordResetExpiresAt },
      });

      const resetUrl = `${this.config.get<string>('FRONTEND_URL')}/reset-password?token=${resetToken}`;
      await this.mail.sendPasswordResetEmail(email, resetUrl);
    }

    return { message: GENERIC_FORGOT_PASSWORD_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = hashToken(dto.token);
    const user = await this.prisma.user.findFirst({ where: { passwordResetTokenHash: tokenHash } });

    if (!user || !user.passwordResetExpiresAt) {
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    }

    if (user.passwordResetExpiresAt.getTime() < Date.now()) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordResetTokenHash: null, passwordResetExpiresAt: null },
      });
      throw new BadRequestException(GENERIC_TOKEN_ERROR);
    }

    const passwordHash = await argon2.hash(dto.newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
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
}
