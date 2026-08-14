import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ROLES, RpcAuthContext } from '@app/shared';
import { InvitationsService } from './invitations.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken } from '../auth/utils/token.util';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

/**
 * Phase 3 invitation lifecycle: only a Tenant Owner may invite into their
 * own organization, tokens are single-use and expire, and the role/org an
 * invitee ends up with is whatever the server-side invitation record says —
 * never anything the client can influence via the accept call.
 */
describe('InvitationsService (integration — RBAC + tenant isolation)', () => {
  let service: InvitationsService;
  let prisma: PrismaService;

  let orgA: { id: string; name: string };
  let orgB: { id: string; name: string };
  let ownerA: RpcAuthContext;
  let agentA: RpcAuthContext;
  let customerA: RpcAuthContext;
  let ownerB: RpcAuthContext;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
      providers: [InvitationsService, MailService, SubscriptionsService, PrismaService],
    }).compile();

    service = moduleRef.get(InvitationsService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.organization.deleteMany({});

    const passwordHash = await argon2.hash('SomePassword1');
    // PRO here (not the FREE default) so this suite's pre-Phase-6 assumption
    // of unlimited team-member creation still holds; Phase 6's own
    // team-member-limit behavior is covered in subscriptions/subscriptions.service.spec.ts.
    orgA = await prisma.organization.create({ data: { name: 'Company A', plan: 'PRO' } });
    orgB = await prisma.organization.create({ data: { name: 'Company B', plan: 'PRO' } });

    const userOwnerA = await prisma.user.create({
      data: {
        organizationId: orgA.id,
        name: 'Owner A',
        email: 'owner-a@company-a.test',
        passwordHash,
        role: 'TENANT_OWNER',
        emailVerified: true,
      },
    });
    const userAgentA = await prisma.user.create({
      data: {
        organizationId: orgA.id,
        name: 'Agent A',
        email: 'agent-a@company-a.test',
        passwordHash,
        role: 'SUPPORT_AGENT',
        emailVerified: true,
      },
    });
    const userCustomerA = await prisma.user.create({
      data: {
        organizationId: orgA.id,
        name: 'Customer A',
        email: 'customer-a@company-a.test',
        passwordHash,
        role: 'CUSTOMER',
        emailVerified: true,
      },
    });
    const userOwnerB = await prisma.user.create({
      data: {
        organizationId: orgB.id,
        name: 'Owner B',
        email: 'owner-b@company-b.test',
        passwordHash,
        role: 'TENANT_OWNER',
        emailVerified: true,
      },
    });

    ownerA = { userId: userOwnerA.id, email: userOwnerA.email, organizationId: orgA.id, role: ROLES.TENANT_OWNER };
    agentA = { userId: userAgentA.id, email: userAgentA.email, organizationId: orgA.id, role: ROLES.SUPPORT_AGENT };
    customerA = { userId: userCustomerA.id, email: userCustomerA.email, organizationId: orgA.id, role: ROLES.CUSTOMER };
    ownerB = { userId: userOwnerB.id, email: userOwnerB.email, organizationId: orgB.id, role: ROLES.TENANT_OWNER };
  });

  describe('create', () => {
    it('lets a tenant owner invite a teammate into their own organization', async () => {
      const invitation = await service.create(ownerA, 'new-hire@company-a.test', ROLES.SUPPORT_AGENT);
      expect(invitation.email).toBe('new-hire@company-a.test');
      expect(invitation.role).toBe(ROLES.SUPPORT_AGENT);
      expect(invitation.status).toBe('PENDING');
    });

    it('rejects a support agent trying to invite', async () => {
      await expect(service.create(agentA, 'new-hire@company-a.test', ROLES.SUPPORT_AGENT)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a customer trying to invite', async () => {
      await expect(service.create(customerA, 'new-hire@company-a.test', ROLES.SUPPORT_AGENT)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects an invalid/non-assignable role', async () => {
      await expect(
        service.create(ownerA, 'new-hire@company-a.test', ROLES.PLATFORM_ADMIN as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects inviting an email that already has an account', async () => {
      await expect(service.create(ownerA, 'agent-a@company-a.test', ROLES.SUPPORT_AGENT)).rejects.toThrow(
        ConflictException,
      );
    });

    it('the invitation belongs to the inviting organization, never a different one', async () => {
      await service.create(ownerA, 'new-hire@company-a.test', ROLES.SUPPORT_AGENT);

      const ownerAInvitations = await service.list(ownerA);
      expect(ownerAInvitations.map((i) => i.email)).toContain('new-hire@company-a.test');

      const ownerBInvitations = await service.list(ownerB);
      expect(ownerBInvitations.map((i) => i.email)).not.toContain('new-hire@company-a.test');
    });

    it('supersedes a previous pending invitation to the same email', async () => {
      const first = await service.create(ownerA, 'new-hire@company-a.test', ROLES.SUPPORT_AGENT);
      const second = await service.create(ownerA, 'new-hire@company-a.test', ROLES.TENANT_OWNER);

      const firstRow = await prisma.invitation.findUnique({ where: { id: first.id } });
      expect(firstRow?.status).toBe('REVOKED');
      expect(second.status).toBe('PENDING');
    });
  });

  describe('list', () => {
    it('rejects non-owners', async () => {
      await expect(service.list(agentA)).rejects.toThrow(ForbiddenException);
      await expect(service.list(customerA)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('validate + accept', () => {
    /**
     * The service only ever persists a token *hash* (see auth/utils/token.util.ts),
     * so the only way for a test to get the plaintext token — same as a real
     * invitee only ever seeing it via the email link — is to capture the
     * `inviteUrl` MailService.sendInvitationEmail() was called with.
     */
    async function serviceWithCapturedToken(): Promise<{
      service: InvitationsService;
      prisma: PrismaService;
      getToken: () => string;
      teardown: () => Promise<void>;
    }> {
      let capturedToken = '';
      const mailService = {
        sendInvitationEmail: jest.fn(async (_to: string, _org: string, _role: string, inviteUrl: string) => {
          capturedToken = new URL(inviteUrl).searchParams.get('token') ?? '';
        }),
      } as unknown as MailService;

      const moduleRef = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
        providers: [InvitationsService, { provide: MailService, useValue: mailService }, SubscriptionsService, PrismaService],
      }).compile();

      const isolatedService = moduleRef.get(InvitationsService);
      const isolatedPrisma = moduleRef.get(PrismaService);
      await isolatedPrisma.$connect();

      return {
        service: isolatedService,
        prisma: isolatedPrisma,
        getToken: () => capturedToken,
        teardown: () => isolatedPrisma.$disconnect(),
      };
    }

    it('rejects an invalid/unknown token', async () => {
      await expect(service.validate('not-a-real-token-00000000000000')).rejects.toThrow(BadRequestException);
      await expect(service.accept('not-a-real-token-00000000000000', 'New Hire', 'Password1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accept() creates a user in the correct org with the invited role, and the token becomes single-use', async () => {
      const ctx = await serviceWithCapturedToken();
      try {
        await ctx.service.create(ownerA, 'new-hire@company-a.test', ROLES.SUPPORT_AGENT);
        expect(ctx.getToken()).not.toBe('');

        const preview = await ctx.service.validate(ctx.getToken());
        expect(preview).toEqual({
          organizationName: orgA.name,
          email: 'new-hire@company-a.test',
          role: ROLES.SUPPORT_AGENT,
          expiresAt: expect.any(String),
        });

        const result = await ctx.service.accept(ctx.getToken(), 'New Hire', 'Password1');
        expect(result.email).toBe('new-hire@company-a.test');

        const createdUser = await prisma.user.findUnique({ where: { email: 'new-hire@company-a.test' } });
        expect(createdUser).toMatchObject({
          organizationId: orgA.id,
          role: 'SUPPORT_AGENT',
          emailVerified: true,
          isActive: true,
        });

        // Single-use: accepting again with the same token must fail.
        await expect(ctx.service.accept(ctx.getToken(), 'Someone Else', 'Password1')).rejects.toThrow(
          BadRequestException,
        );
      } finally {
        await ctx.teardown();
      }
    });

    it('an expired invitation is rejected by both validate() and accept()', async () => {
      const ctx = await serviceWithCapturedToken();
      try {
        const invitation = await ctx.service.create(ownerA, 'expired@company-a.test', ROLES.SUPPORT_AGENT);
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: { expiresAt: new Date(Date.now() - 60_000) },
        });

        await expect(ctx.service.validate(ctx.getToken())).rejects.toThrow(BadRequestException);
        await expect(ctx.service.accept(ctx.getToken(), 'Someone', 'Password1')).rejects.toThrow(
          BadRequestException,
        );

        const row = await prisma.invitation.findUnique({ where: { id: invitation.id } });
        expect(row?.status).toBe('EXPIRED');
      } finally {
        await ctx.teardown();
      }
    });

    it('accepting fails if an account with the invited email was created in the meantime', async () => {
      const ctx = await serviceWithCapturedToken();
      try {
        await ctx.service.create(ownerA, 'race@company-a.test', ROLES.SUPPORT_AGENT);

        const passwordHash = await argon2.hash('SomePassword1');
        await prisma.user.create({
          data: {
            organizationId: orgB.id,
            name: 'Raced In',
            email: 'race@company-a.test',
            passwordHash,
            role: 'CUSTOMER',
            emailVerified: true,
          },
        });

        await expect(ctx.service.accept(ctx.getToken(), 'New Hire', 'Password1')).rejects.toThrow(
          ConflictException,
        );
      } finally {
        await ctx.teardown();
      }
    });

    it('a token from one organization cannot be used to gain access to another (role/org come only from the token)', async () => {
      const ctx = await serviceWithCapturedToken();
      try {
        // accept()'s signature has no organizationId/role parameter at all —
        // there is no argument through which a caller could ask to join a
        // different org or receive a different role than the invitation grants.
        await ctx.service.create(ownerA, 'scoped@company-a.test', ROLES.SUPPORT_AGENT);
        await ctx.service.accept(ctx.getToken(), 'Scoped User', 'Password1');

        const createdUser = await prisma.user.findUnique({ where: { email: 'scoped@company-a.test' } });
        expect(createdUser?.organizationId).toBe(orgA.id);
        expect(createdUser?.organizationId).not.toBe(orgB.id);
        expect(createdUser?.role).toBe('SUPPORT_AGENT');
      } finally {
        await ctx.teardown();
      }
    });
  });
});
