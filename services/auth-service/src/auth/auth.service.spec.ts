import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { hashToken } from './utils/token.util';

/**
 * These tests exercise AuthService against a real Postgres database (see
 * ../../../.env.test) rather than a mocked ORM/repository, per the project
 * requirement that authentication must be backed by real persistence.
 * MailService is left real too (it logs to the console in dev/test since no
 * SMTP is configured); we only spy on it to capture the emailed token.
 */
describe('AuthService (integration)', () => {
  let authService: AuthService;
  let prisma: PrismaService;
  let jwt: JwtService;
  let mail: MailService;

  const baseRegisterDto = {
    organizationName: 'Acme Corp',
    name: 'Alice Owner',
    email: 'alice@acme.test',
    password: 'SecurePass123',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            secret: config.get<string>('JWT_SECRET'),
            signOptions: {
              expiresIn: (config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m') as StringValue,
            },
          }),
        }),
      ],
      providers: [AuthService, PrismaService, MailService],
    }).compile();

    authService = moduleRef.get(AuthService);
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    mail = moduleRef.get(MailService);

    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Cascades to users via the Organization -> User onDelete: Cascade relation.
    await prisma.organization.deleteMany({});
    jest.restoreAllMocks();
  });

  async function registerAndGetVerificationToken(overrides: Partial<typeof baseRegisterDto> = {}) {
    const sendSpy = jest.spyOn(mail, 'sendVerificationEmail').mockResolvedValue();
    const dto = { ...baseRegisterDto, ...overrides };
    const result = await authService.register(dto);
    const url = sendSpy.mock.calls[0][1];
    const token = new URL(url).searchParams.get('token')!;
    return { result, token, dto };
  }

  async function registerVerifyAndLogin(overrides: Partial<typeof baseRegisterDto> = {}) {
    const { token, dto } = await registerAndGetVerificationToken(overrides);
    await authService.verifyEmail({ token });
    return authService.login({ email: dto.email, password: dto.password });
  }

  describe('register', () => {
    it('creates an organization and its initial user, transactionally', async () => {
      const { result } = await registerAndGetVerificationToken();

      expect(result.organizationId).toBeDefined();
      expect(result.userId).toBeDefined();

      const org = await prisma.organization.findUnique({ where: { id: result.organizationId } });
      const user = await prisma.user.findUnique({ where: { id: result.userId } });

      expect(org?.name).toBe('Acme Corp');
      expect(user?.organizationId).toBe(org?.id);
      expect(user?.emailVerified).toBe(false);
    });

    it('hashes the password (never stores plaintext, and argon2 can verify it)', async () => {
      const { result } = await registerAndGetVerificationToken();
      const user = await prisma.user.findUnique({ where: { id: result.userId } });

      expect(user?.passwordHash).not.toBe(baseRegisterDto.password);
      expect(user?.passwordHash.startsWith('$argon2')).toBe(true);
      await expect(argon2.verify(user!.passwordHash, baseRegisterDto.password)).resolves.toBe(true);
    });

    it('rejects duplicate email registration with a 409 and does not create a second org/user', async () => {
      await registerAndGetVerificationToken();

      await expect(registerAndGetVerificationToken()).rejects.toThrow(ConflictException);

      const users = await prisma.user.findMany({ where: { email: baseRegisterDto.email } });
      const orgs = await prisma.organization.findMany({});
      expect(users).toHaveLength(1);
      expect(orgs).toHaveLength(1);
    });
  });

  describe('verifyEmail', () => {
    it('marks the user verified and invalidates the token so it cannot be reused', async () => {
      const { token, result } = await registerAndGetVerificationToken();

      await expect(authService.verifyEmail({ token })).resolves.toEqual({
        message: 'Email verified successfully.',
      });

      const user = await prisma.user.findUnique({ where: { id: result.userId } });
      expect(user?.emailVerified).toBe(true);
      expect(user?.emailVerificationTokenHash).toBeNull();

      // Reusing the same (now-cleared) token must fail, not silently re-succeed.
      await expect(authService.verifyEmail({ token })).rejects.toThrow(BadRequestException);
    });

    it('rejects an invalid/unknown token without leaking why', async () => {
      await expect(authService.verifyEmail({ token: 'not-a-real-token-00000000000000' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an expired token', async () => {
      const { token, result } = await registerAndGetVerificationToken();

      await prisma.user.update({
        where: { id: result.userId },
        data: { emailVerificationExpiresAt: new Date(Date.now() - 60_000) },
      });

      await expect(authService.verifyEmail({ token })).rejects.toThrow(BadRequestException);

      const user = await prisma.user.findUnique({ where: { id: result.userId } });
      expect(user?.emailVerified).toBe(false);
    });
  });

  describe('login', () => {
    it('succeeds with correct credentials after verification and returns an access + refresh token pair', async () => {
      const { tokens, user } = await registerVerifyAndLogin();

      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
      expect(user.email).toBe(baseRegisterDto.email);
      expect((user as any).passwordHash).toBeUndefined();
    });

    it('issues an access token containing the minimum identifying claims', async () => {
      const { tokens } = await registerVerifyAndLogin();
      const payload = await jwt.verifyAsync(tokens.accessToken, {
        secret: process.env.JWT_SECRET,
      });
      expect(payload.type).toBe('access');
      expect(payload.sub).toBeDefined();
      expect(payload.email).toBe(baseRegisterDto.email);
    });

    it('issues a refresh token, distinct from the access token, whose hash is persisted', async () => {
      const { tokens, user } = await registerVerifyAndLogin();

      expect(tokens.refreshToken).not.toBe(tokens.accessToken);
      const payload = await jwt.verifyAsync(tokens.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      expect(payload.type).toBe('refresh');

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.refreshTokenHash).toBe(hashToken(tokens.refreshToken));
    });

    it('rejects incorrect credentials', async () => {
      await registerAndGetVerificationToken();

      await expect(
        authService.login({ email: baseRegisterDto.email, password: 'WrongPassword999' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects login for an unverified email', async () => {
      await registerAndGetVerificationToken();

      await expect(
        authService.login({ email: baseRegisterDto.email, password: baseRegisterDto.password }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('refresh', () => {
    it('returns a new token pair for a valid refresh token', async () => {
      const { tokens } = await registerVerifyAndLogin();

      const rotated = await authService.refresh(tokens.refreshToken);

      expect(rotated.accessToken).toBeDefined();
      expect(rotated.refreshToken).toBeDefined();
      expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
    });

    it('rejects an invalid refresh token', async () => {
      await expect(authService.refresh('not-a-valid-jwt')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a stale (already-rotated-out) refresh token and revokes the session', async () => {
      const { tokens, user } = await registerVerifyAndLogin();

      await authService.refresh(tokens.refreshToken);
      // Replaying the original (now superseded) token should fail...
      await expect(authService.refresh(tokens.refreshToken)).rejects.toThrow(UnauthorizedException);

      // ...and revoke the session outright (reuse-detection), not just reject this one call.
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.refreshTokenHash).toBeNull();
    });
  });

  describe('logout', () => {
    it('invalidates the stored refresh token so it can no longer be used', async () => {
      const { tokens, user } = await registerVerifyAndLogin();

      await authService.logout(tokens.refreshToken);

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.refreshTokenHash).toBeNull();

      await expect(authService.refresh(tokens.refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword / resetPassword', () => {
    it('does not reveal whether the email exists (same generic message either way)', async () => {
      await registerAndGetVerificationToken();

      const existing = await authService.forgotPassword({ email: baseRegisterDto.email });
      const nonExisting = await authService.forgotPassword({ email: 'nobody@nowhere.test' });

      expect(existing.message).toBe(nonExisting.message);
    });

    it('resets the password, invalidates the token, and the old password stops working', async () => {
      await registerVerifyAndLogin();

      const sendSpy = jest.spyOn(mail, 'sendPasswordResetEmail').mockResolvedValue();
      await authService.forgotPassword({ email: baseRegisterDto.email });
      const resetUrl = sendSpy.mock.calls[0][1];
      const resetToken = new URL(resetUrl).searchParams.get('token')!;

      await authService.resetPassword({ token: resetToken, newPassword: 'BrandNewPass456' });

      // Old password must immediately stop working.
      await expect(
        authService.login({ email: baseRegisterDto.email, password: baseRegisterDto.password }),
      ).rejects.toThrow(UnauthorizedException);

      // New password works.
      await expect(
        authService.login({ email: baseRegisterDto.email, password: 'BrandNewPass456' }),
      ).resolves.toBeDefined();

      // The reset token cannot be reused.
      await expect(
        authService.resetPassword({ token: resetToken, newPassword: 'YetAnotherPass789' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an expired reset token', async () => {
      await registerVerifyAndLogin();

      const sendSpy = jest.spyOn(mail, 'sendPasswordResetEmail').mockResolvedValue();
      await authService.forgotPassword({ email: baseRegisterDto.email });
      const resetUrl = sendSpy.mock.calls[0][1];
      const resetToken = new URL(resetUrl).searchParams.get('token')!;

      const user = await prisma.user.findUnique({ where: { email: baseRegisterDto.email } });
      await prisma.user.update({
        where: { id: user!.id },
        data: { passwordResetExpiresAt: new Date(Date.now() - 60_000) },
      });

      await expect(
        authService.resetPassword({ token: resetToken, newPassword: 'BrandNewPass456' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('invalidates existing refresh-token sessions on password reset', async () => {
      const { tokens } = await registerVerifyAndLogin();

      const sendSpy = jest.spyOn(mail, 'sendPasswordResetEmail').mockResolvedValue();
      await authService.forgotPassword({ email: baseRegisterDto.email });
      const resetUrl = sendSpy.mock.calls[0][1];
      const resetToken = new URL(resetUrl).searchParams.get('token')!;

      await authService.resetPassword({ token: resetToken, newPassword: 'BrandNewPass456' });

      await expect(authService.refresh(tokens.refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });
});
