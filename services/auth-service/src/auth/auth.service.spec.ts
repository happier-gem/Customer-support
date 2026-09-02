import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ROLES, RpcAuthContext } from '@app/shared';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CustomerJoinService } from '../customer-join/customer-join.service';
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
  let customerJoin: CustomerJoinService;

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
      providers: [AuthService, PrismaService, MailService, CustomerJoinService],
    }).compile();

    authService = moduleRef.get(AuthService);
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    mail = moduleRef.get(MailService);
    customerJoin = moduleRef.get(CustomerJoinService);

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

  async function registerAndGetOtp(overrides: Partial<typeof baseRegisterDto> = {}) {
    const sendSpy = jest.spyOn(mail, 'sendOtpEmail').mockResolvedValue(true);
    const dto = { ...baseRegisterDto, ...overrides };
    const result = await authService.register(dto);
    // Registration's email send is fire-and-forget (not awaited by
    // register() itself — see auth.service.ts), so give its microtask a
    // tick to run before reading the spy.
    await new Promise((resolve) => setImmediate(resolve));
    // The last call, not the first: a test that calls this helper more than
    // once against the same still-unverified email (re-registration) reuses
    // the same spy instance, so earlier calls remain in `.mock.calls`.
    const otp = sendSpy.mock.calls.at(-1)![1];
    return { result, otp, dto };
  }

  async function registerVerifyAndLogin(overrides: Partial<typeof baseRegisterDto> = {}) {
    const { otp, dto } = await registerAndGetOtp(overrides);
    await authService.verifyEmail({ email: dto.email, otp });
    return authService.login({ email: dto.email, password: dto.password });
  }

  describe('register', () => {
    it('creates an organization and its initial user, transactionally', async () => {
      const { result } = await registerAndGetOtp();

      expect(result.organizationId).toBeDefined();
      expect(result.userId).toBeDefined();

      const org = await prisma.organization.findUnique({ where: { id: result.organizationId } });
      const user = await prisma.user.findUnique({ where: { id: result.userId } });

      expect(org?.name).toBe('Acme Corp');
      expect(user?.organizationId).toBe(org?.id);
      expect(user?.emailVerified).toBe(false);
    });

    it('hashes the password (never stores plaintext, and argon2 can verify it)', async () => {
      const { result } = await registerAndGetOtp();
      const user = await prisma.user.findUnique({ where: { id: result.userId } });

      expect(user?.passwordHash).not.toBe(baseRegisterDto.password);
      expect(user?.passwordHash.startsWith('$argon2')).toBe(true);
      await expect(argon2.verify(user!.passwordHash, baseRegisterDto.password)).resolves.toBe(true);
    });

    it('rejects re-registration of an already-verified email with a 409 and does not create a second org/user', async () => {
      await registerVerifyAndLogin();

      await expect(registerAndGetOtp()).rejects.toThrow(ConflictException);

      const users = await prisma.user.findMany({ where: { email: baseRegisterDto.email } });
      const orgs = await prisma.organization.findMany({});
      expect(users).toHaveLength(1);
      expect(orgs).toHaveLength(1);
    });

    it('re-registering an *unverified* email never creates a second account (immediate retry, still within the resend cooldown)', async () => {
      const { result: firstResult, otp: firstOtp } = await registerAndGetOtp();

      // Immediately re-submitting registration is indistinguishable from an
      // accidental double-submit — same account, and since it's within the
      // resend cooldown, the original still-valid code is left untouched
      // rather than rotated (mirrors resendOtp's own cooldown behavior).
      const { result: secondResult } = await registerAndGetOtp();

      expect(secondResult.userId).toBe(firstResult.userId);
      expect(secondResult.organizationId).toBe(firstResult.organizationId);
      const users = await prisma.user.findMany({ where: { email: baseRegisterDto.email } });
      const orgs = await prisma.organization.findMany({});
      expect(users).toHaveLength(1);
      expect(orgs).toHaveLength(1);

      await expect(authService.verifyEmail({ email: baseRegisterDto.email, otp: firstOtp })).resolves.toBeDefined();
    });

    it('re-registering an *unverified* email after the resend cooldown has elapsed issues a fresh OTP that invalidates the old one', async () => {
      const { result: firstResult, otp: firstOtp } = await registerAndGetOtp();

      // Simulate the cooldown having elapsed, the same way the resendOtp
      // cooldown test does.
      await prisma.user.update({
        where: { id: firstResult.userId },
        data: { emailVerificationOtpLastSentAt: new Date(Date.now() - 61_000) },
      });

      const { result: secondResult, otp: secondOtp } = await registerAndGetOtp();

      expect(secondResult.userId).toBe(firstResult.userId);
      const users = await prisma.user.findMany({ where: { email: baseRegisterDto.email } });
      expect(users).toHaveLength(1);

      expect(secondOtp).not.toBe(firstOtp);
      await expect(authService.verifyEmail({ email: baseRegisterDto.email, otp: firstOtp })).rejects.toThrow(BadRequestException);
      await expect(authService.verifyEmail({ email: baseRegisterDto.email, otp: secondOtp })).resolves.toBeDefined();
    });

    it('rejects a verified-account re-registration attempt without needing a second call — the account stays usable', async () => {
      await registerVerifyAndLogin();
      await expect(registerAndGetOtp()).rejects.toThrow(ConflictException);
      await expect(authService.login({ email: baseRegisterDto.email, password: baseRegisterDto.password })).resolves.toBeDefined();
    });

    it('never stores the OTP in plaintext', async () => {
      const { result, otp } = await registerAndGetOtp();
      const user = await prisma.user.findUnique({ where: { id: result.userId } });

      expect(otp).toMatch(/^\d{6}$/);
      expect(user?.emailVerificationOtpHash).not.toBe(otp);
      expect(user?.emailVerificationOtpHash).toBe(hashToken(otp));
    });
  });

  describe('registerCustomer (Phase 10 — resolves the organization from a join token, never a client-supplied id)', () => {
    async function makeOwnerAndJoinToken(orgName = 'Beta Inc') {
      const passwordHash = await argon2.hash('OwnerPass123');
      const org = await prisma.organization.create({ data: { name: orgName } });
      const owner = await prisma.user.create({
        data: { organizationId: org.id, name: 'Owner', email: `owner-${org.id}@beta.test`, passwordHash, role: 'TENANT_OWNER', emailVerified: true },
      });
      const authContext: RpcAuthContext = { userId: owner.id, email: owner.email, organizationId: org.id, role: ROLES.TENANT_OWNER };
      const link = await customerJoin.getOrCreate(authContext);
      const preview = await customerJoin.resolveByCode(link.code);
      return { org, joinToken: preview.joinToken };
    }

    it('creates the customer under the organization the join token resolves to', async () => {
      const { org, joinToken } = await makeOwnerAndJoinToken();
      const sendSpy = jest.spyOn(mail, 'sendOtpEmail').mockResolvedValue(true);

      const result = await authService.registerCustomer({
        joinToken,
        name: 'Casey Customer',
        email: 'casey@beta.test',
        password: 'CustomerPass123',
      });

      expect(result.organizationId).toBe(org.id);
      const user = await prisma.user.findUnique({ where: { id: result.userId } });
      expect(user?.organizationId).toBe(org.id);
      expect(user?.role).toBe('CUSTOMER');
      expect(sendSpy).toHaveBeenCalledWith('casey@beta.test', expect.any(String), expect.objectContaining({ organizationName: org.name }));
    });

    it('rejects an invalid join token', async () => {
      await expect(
        authService.registerCustomer({ joinToken: 'not-a-real-token', name: 'X', email: 'x@beta.test', password: 'CustomerPass123' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a revoked join token', async () => {
      const passwordHash = await argon2.hash('OwnerPass123');
      const org = await prisma.organization.create({ data: { name: 'Gamma LLC' } });
      const owner = await prisma.user.create({
        data: { organizationId: org.id, name: 'Owner', email: `owner-${org.id}@gamma.test`, passwordHash, role: 'TENANT_OWNER', emailVerified: true },
      });
      const authContext: RpcAuthContext = { userId: owner.id, email: owner.email, organizationId: org.id, role: ROLES.TENANT_OWNER };
      const link = await customerJoin.getOrCreate(authContext);
      const preview = await customerJoin.resolveByCode(link.code);
      await customerJoin.revoke(authContext);

      await expect(
        authService.registerCustomer({ joinToken: preview.joinToken, name: 'X', email: 'x2@gamma.test', password: 'CustomerPass123' }),
      ).rejects.toThrow(NotFoundException);
    });

    it("a join token never lets a customer land in the wrong organization", async () => {
      const { org: orgBeta, joinToken } = await makeOwnerAndJoinToken('Beta Inc');
      await makeOwnerAndJoinToken('Delta Co'); // a second org exists, proving the token is org-specific
      jest.spyOn(mail, 'sendOtpEmail').mockResolvedValue(true);

      const result = await authService.registerCustomer({
        joinToken,
        name: 'Casey',
        email: 'casey2@beta.test',
        password: 'CustomerPass123',
      });

      expect(result.organizationId).toBe(orgBeta.id);
    });

    it('re-registering the same unverified customer email for the SAME organization does not create a second account', async () => {
      const { org, joinToken } = await makeOwnerAndJoinToken();
      jest.spyOn(mail, 'sendOtpEmail').mockResolvedValue(true);

      const first = await authService.registerCustomer({ joinToken, name: 'Casey', email: 'retry@beta.test', password: 'CustomerPass123' });
      const second = await authService.registerCustomer({ joinToken, name: 'Casey', email: 'retry@beta.test', password: 'CustomerPass123' });

      expect(second.userId).toBe(first.userId);
      expect(second.organizationId).toBe(org.id);
      const users = await prisma.user.findMany({ where: { email: 'retry@beta.test' } });
      expect(users).toHaveLength(1);
    });

    it('rejects re-registering the same unverified customer email under a DIFFERENT organization’s join token', async () => {
      const { joinToken: betaToken } = await makeOwnerAndJoinToken('Beta Inc');
      const { joinToken: deltaToken } = await makeOwnerAndJoinToken('Delta Co');
      jest.spyOn(mail, 'sendOtpEmail').mockResolvedValue(true);

      await authService.registerCustomer({ joinToken: betaToken, name: 'Casey', email: 'cross-org@test.dev', password: 'CustomerPass123' });

      await expect(
        authService.registerCustomer({ joinToken: deltaToken, name: 'Casey', email: 'cross-org@test.dev', password: 'CustomerPass123' }),
      ).rejects.toThrow(ConflictException);

      // Still only ever associated with the original organization.
      const user = await prisma.user.findUnique({ where: { email: 'cross-org@test.dev' } });
      const betaOrg = await prisma.customerJoinLink.findUnique({ where: { token: betaToken } });
      expect(user?.organizationId).toBe(betaOrg?.organizationId);
    });

    it('rejects re-registration once the customer account is verified', async () => {
      const { joinToken } = await makeOwnerAndJoinToken();
      const sendSpy = jest.spyOn(mail, 'sendOtpEmail').mockResolvedValue(true);

      await authService.registerCustomer({ joinToken, name: 'Casey', email: 'verified-customer@test.dev', password: 'CustomerPass123' });
      const otp = sendSpy.mock.calls.at(-1)![1];
      await authService.verifyEmail({ email: 'verified-customer@test.dev', otp });

      await expect(
        authService.registerCustomer({ joinToken, name: 'Casey', email: 'verified-customer@test.dev', password: 'CustomerPass123' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('verifyEmail (OTP)', () => {
    it('marks the user verified and invalidates the OTP so it cannot be reused', async () => {
      const { otp, dto, result } = await registerAndGetOtp();

      await expect(authService.verifyEmail({ email: dto.email, otp })).resolves.toEqual({
        message: 'Email verified successfully.',
      });

      const user = await prisma.user.findUnique({ where: { id: result.userId } });
      expect(user?.emailVerified).toBe(true);
      expect(user?.emailVerificationOtpHash).toBeNull();

      // Reusing the same (now-cleared) OTP must fail, not silently re-succeed.
      await expect(authService.verifyEmail({ email: dto.email, otp })).rejects.toThrow(BadRequestException);
    });

    it('rejects an incorrect code with a distinct "invalid code" error and increments the attempt counter', async () => {
      const { dto, result } = await registerAndGetOtp();

      await expect(authService.verifyEmail({ email: dto.email, otp: '000000' })).rejects.toMatchObject({
        response: { code: 'OTP_INVALID' },
      });

      const user = await prisma.user.findUnique({ where: { id: result.userId } });
      expect(user?.emailVerified).toBe(false);
      expect(user?.emailVerificationOtpAttempts).toBe(1);
    });

    it('rejects an unknown email without leaking whether the account exists', async () => {
      await expect(authService.verifyEmail({ email: 'nobody@nowhere.test', otp: '123456' })).rejects.toMatchObject({
        response: { code: 'OTP_INVALID' },
      });
    });

    it('rejects an expired code with a distinct "expired" error', async () => {
      const { otp, dto, result } = await registerAndGetOtp();

      await prisma.user.update({
        where: { id: result.userId },
        data: { emailVerificationOtpExpiresAt: new Date(Date.now() - 60_000) },
      });

      await expect(authService.verifyEmail({ email: dto.email, otp })).rejects.toMatchObject({
        response: { code: 'OTP_EXPIRED' },
      });

      const user = await prisma.user.findUnique({ where: { id: result.userId } });
      expect(user?.emailVerified).toBe(false);
    });

    it('locks out further attempts after 5 incorrect codes and requires a resend', async () => {
      const { dto, result } = await registerAndGetOtp();

      for (let i = 0; i < 5; i++) {
        await expect(authService.verifyEmail({ email: dto.email, otp: '000000' })).rejects.toThrow(
          BadRequestException,
        );
      }

      await expect(authService.verifyEmail({ email: dto.email, otp: '000000' })).rejects.toMatchObject({
        response: { code: 'OTP_TOO_MANY_ATTEMPTS' },
      });

      const user = await prisma.user.findUnique({ where: { id: result.userId } });
      expect(user?.emailVerificationOtpHash).toBeNull();
      expect(user?.emailVerified).toBe(false);
    });

    it('rejects a second verification attempt once already verified', async () => {
      const { otp, dto } = await registerAndGetOtp();
      await authService.verifyEmail({ email: dto.email, otp });

      await expect(authService.verifyEmail({ email: dto.email, otp })).rejects.toMatchObject({
        response: { code: 'OTP_INVALID' },
      });
    });
  });

  describe('resendOtp', () => {
    it('issues a new code and lets it be used to verify', async () => {
      const { dto } = await registerAndGetOtp();
      // Simulate the resend cooldown from registration having already elapsed.
      await prisma.user.update({
        where: { email: dto.email },
        data: { emailVerificationOtpLastSentAt: new Date(Date.now() - 61_000) },
      });

      // jest.spyOn on an already-mocked method returns the same mock instance
      // (it doesn't re-wrap), so clear prior calls before isolating the resend's.
      const sendSpy = jest.spyOn(mail, 'sendOtpEmail').mockResolvedValue(true);
      sendSpy.mockClear();
      const resend = await authService.resendOtp({ email: dto.email });
      expect(resend.retryAfterSeconds).toBeUndefined();

      const newOtp = sendSpy.mock.calls[0][1];
      await expect(authService.verifyEmail({ email: dto.email, otp: newOtp })).resolves.toEqual({
        message: 'Email verified successfully.',
      });
    });

    it('enforces a resend cooldown and reports retryAfterSeconds', async () => {
      const { dto } = await registerAndGetOtp();

      const result = await authService.resendOtp({ email: dto.email });
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    });

    it('returns the same generic message for a non-existent account (no enumeration)', async () => {
      const { dto } = await registerAndGetOtp();

      const existing = await authService.resendOtp({ email: dto.email });
      const nonExisting = await authService.resendOtp({ email: 'nobody@nowhere.test' });

      expect(existing.message).toBe(nonExisting.message);
      expect(nonExisting.retryAfterSeconds).toBeUndefined();
    });

    it('returns the same generic message for an already-verified account', async () => {
      const { otp, dto } = await registerAndGetOtp();
      await authService.verifyEmail({ email: dto.email, otp });

      const result = await authService.resendOtp({ email: dto.email });
      expect(result.message).toBe('If that account needs verification, a new code has been sent.');
      expect(result.retryAfterSeconds).toBeUndefined();
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
      await registerAndGetOtp();

      await expect(
        authService.login({ email: baseRegisterDto.email, password: 'WrongPassword999' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects login for an unverified email', async () => {
      await registerAndGetOtp();

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

  describe('organization suspension (Phase 9)', () => {
    it('rejects login for a user whose organization has been suspended', async () => {
      const { user } = await registerVerifyAndLogin({ email: 'suspended@acme.test' });

      await prisma.organization.update({ where: { id: user.organizationId }, data: { isSuspended: true } });

      await expect(
        authService.login({ email: 'suspended@acme.test', password: baseRegisterDto.password }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows login again once the organization is reactivated', async () => {
      const { tokens, user } = await registerVerifyAndLogin({ email: 'reactivate@acme.test' });
      void tokens;

      await prisma.organization.update({ where: { id: user.organizationId }, data: { isSuspended: true } });
      await expect(
        authService.login({ email: 'reactivate@acme.test', password: baseRegisterDto.password }),
      ).rejects.toThrow(ForbiddenException);

      await prisma.organization.update({ where: { id: user.organizationId }, data: { isSuspended: false } });
      await expect(
        authService.login({ email: 'reactivate@acme.test', password: baseRegisterDto.password }),
      ).resolves.toBeDefined();
    });

    it('rejects refresh once the organization is suspended, even with a still-valid refresh token, and revokes the session', async () => {
      const { tokens, user } = await registerVerifyAndLogin({ email: 'refresh-suspend@acme.test' });

      await prisma.organization.update({ where: { id: user.organizationId }, data: { isSuspended: true } });

      await expect(authService.refresh(tokens.refreshToken)).rejects.toThrow(UnauthorizedException);

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.refreshTokenHash).toBeNull();
    });

    it('does not block a PLATFORM_ADMIN whose own placeholder organization is suspended', async () => {
      const passwordHash = await argon2.hash('AdminPass123');
      const platformOrg = await prisma.organization.create({ data: { name: 'Platform', isSuspended: true } });
      await prisma.user.create({
        data: {
          organizationId: platformOrg.id,
          name: 'Platform Admin',
          email: 'admin@platform.test',
          passwordHash,
          role: 'PLATFORM_ADMIN',
          emailVerified: true,
        },
      });

      await expect(
        authService.login({ email: 'admin@platform.test', password: 'AdminPass123' }),
      ).resolves.toBeDefined();
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
      await registerAndGetOtp();

      const existing = await authService.forgotPassword({ email: baseRegisterDto.email });
      const nonExisting = await authService.forgotPassword({ email: 'nobody@nowhere.test' });

      expect(existing.message).toBe(nonExisting.message);
    });

    it('resets the password, invalidates the code, and the old password stops working', async () => {
      await registerVerifyAndLogin();

      const sendSpy = jest.spyOn(mail, 'sendPasswordResetOtpEmail').mockResolvedValue(true);
      await authService.forgotPassword({ email: baseRegisterDto.email });
      const code = sendSpy.mock.calls[0][1];

      await authService.resetPassword({ email: baseRegisterDto.email, code, newPassword: 'BrandNewPass456' });

      // Old password must immediately stop working.
      await expect(
        authService.login({ email: baseRegisterDto.email, password: baseRegisterDto.password }),
      ).rejects.toThrow(UnauthorizedException);

      // New password works.
      await expect(
        authService.login({ email: baseRegisterDto.email, password: 'BrandNewPass456' }),
      ).resolves.toBeDefined();

      // The reset code cannot be reused.
      await expect(
        authService.resetPassword({ email: baseRegisterDto.email, code, newPassword: 'YetAnotherPass789' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an expired reset code', async () => {
      await registerVerifyAndLogin();

      const sendSpy = jest.spyOn(mail, 'sendPasswordResetOtpEmail').mockResolvedValue(true);
      await authService.forgotPassword({ email: baseRegisterDto.email });
      const code = sendSpy.mock.calls[0][1];

      const user = await prisma.user.findUnique({ where: { email: baseRegisterDto.email } });
      await prisma.user.update({
        where: { id: user!.id },
        data: { passwordResetExpiresAt: new Date(Date.now() - 60_000) },
      });

      await expect(
        authService.resetPassword({ email: baseRegisterDto.email, code, newPassword: 'BrandNewPass456' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an incorrect code without revealing that the account exists', async () => {
      await registerVerifyAndLogin();

      jest.spyOn(mail, 'sendPasswordResetOtpEmail').mockResolvedValue(true);
      await authService.forgotPassword({ email: baseRegisterDto.email });

      await expect(
        authService.resetPassword({ email: baseRegisterDto.email, code: '000000', newPassword: 'BrandNewPass456' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('locks out further attempts after 5 incorrect codes and requires a fresh forgotPassword request', async () => {
      await registerVerifyAndLogin();

      jest.spyOn(mail, 'sendPasswordResetOtpEmail').mockResolvedValue(true);
      await authService.forgotPassword({ email: baseRegisterDto.email });

      for (let i = 0; i < 5; i += 1) {
        await expect(
          authService.resetPassword({ email: baseRegisterDto.email, code: '000000', newPassword: 'BrandNewPass456' }),
        ).rejects.toThrow(BadRequestException);
      }

      // The 6th attempt is the one that actually observes the lockout and clears the code.
      await expect(
        authService.resetPassword({ email: baseRegisterDto.email, code: '000000', newPassword: 'BrandNewPass456' }),
      ).rejects.toThrow(BadRequestException);

      const user = await prisma.user.findUnique({ where: { email: baseRegisterDto.email } });
      expect(user?.passwordResetOtpHash).toBeNull();
    });

    it('invalidates existing refresh-token sessions on password reset', async () => {
      const { tokens } = await registerVerifyAndLogin();

      const sendSpy = jest.spyOn(mail, 'sendPasswordResetOtpEmail').mockResolvedValue(true);
      await authService.forgotPassword({ email: baseRegisterDto.email });
      const code = sendSpy.mock.calls[0][1];

      await authService.resetPassword({ email: baseRegisterDto.email, code, newPassword: 'BrandNewPass456' });

      await expect(authService.refresh(tokens.refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('changePassword (Phase 10 — self-service, requires proving the current password)', () => {
    it('changes the password when the current password is correct', async () => {
      const { user } = await registerVerifyAndLogin();
      const authContext: RpcAuthContext = { userId: user.id, email: user.email, organizationId: user.organizationId, role: user.role };

      await authService.changePassword(authContext, { currentPassword: baseRegisterDto.password, newPassword: 'BrandNewPass456' });

      await expect(
        authService.login({ email: baseRegisterDto.email, password: baseRegisterDto.password }),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        authService.login({ email: baseRegisterDto.email, password: 'BrandNewPass456' }),
      ).resolves.toBeDefined();
    });

    it('rejects an incorrect current password and leaves the password unchanged', async () => {
      const { user } = await registerVerifyAndLogin();
      const authContext: RpcAuthContext = { userId: user.id, email: user.email, organizationId: user.organizationId, role: user.role };

      await expect(
        authService.changePassword(authContext, { currentPassword: 'WrongPassword1', newPassword: 'BrandNewPass456' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        authService.login({ email: baseRegisterDto.email, password: baseRegisterDto.password }),
      ).resolves.toBeDefined();
    });

    it('invalidates existing refresh-token sessions', async () => {
      const { user, tokens } = await registerVerifyAndLogin();
      const authContext: RpcAuthContext = { userId: user.id, email: user.email, organizationId: user.organizationId, role: user.role };

      await authService.changePassword(authContext, { currentPassword: baseRegisterDto.password, newPassword: 'BrandNewPass456' });

      await expect(authService.refresh(tokens.refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('updateProfile (Phase 10 — self-service, name/avatar only)', () => {
    it('updates the name and leaves everything else untouched', async () => {
      const { user } = await registerVerifyAndLogin();
      const authContext: RpcAuthContext = { userId: user.id, email: user.email, organizationId: user.organizationId, role: user.role };

      const updated = await authService.updateProfile(authContext, { name: 'New Name' });

      expect(updated.name).toBe('New Name');
      expect(updated.email).toBe(user.email);
      expect(updated.role).toBe(user.role);
      expect(updated.organizationId).toBe(user.organizationId);
    });

    it('can set an avatar url', async () => {
      const { user } = await registerVerifyAndLogin();
      const authContext: RpcAuthContext = { userId: user.id, email: user.email, organizationId: user.organizationId, role: user.role };

      const updated = await authService.updateProfile(authContext, { avatarUrl: '/uploads/avatars/abc.png' });
      expect(updated.avatarUrl).toBe('/uploads/avatars/abc.png');
    });
  });
});
