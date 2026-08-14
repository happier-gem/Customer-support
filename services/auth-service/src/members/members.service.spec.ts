import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ROLES, RpcAuthContext } from '@app/shared';
import { MembersService } from './members.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Phase 3 team-member management: RBAC (only a Tenant Owner may manage
 * members), tenant isolation (a Tenant Owner can never touch another
 * organization's users), and the "no organization left ownerless"
 * invariant. Runs against a real Postgres database, same as
 * organizations.service.spec.ts.
 */
describe('MembersService (integration — RBAC + tenant isolation)', () => {
  let service: MembersService;
  let prisma: PrismaService;

  let orgA: { id: string };
  let orgB: { id: string };
  let ownerA: RpcAuthContext;
  let ownerA2: RpcAuthContext;
  let agentA: RpcAuthContext;
  let customerA: RpcAuthContext;
  let ownerB: RpcAuthContext;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
      providers: [MembersService, PrismaService],
    }).compile();

    service = moduleRef.get(MembersService);
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
    const orgARecord = await prisma.organization.create({ data: { name: 'Company A' } });
    const orgBRecord = await prisma.organization.create({ data: { name: 'Company B' } });
    orgA = orgARecord;
    orgB = orgBRecord;

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
    const userOwnerA2 = await prisma.user.create({
      data: {
        organizationId: orgA.id,
        name: 'Second Owner A',
        email: 'owner-a-2@company-a.test',
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
    ownerA2 = { userId: userOwnerA2.id, email: userOwnerA2.email, organizationId: orgA.id, role: ROLES.TENANT_OWNER };
    agentA = { userId: userAgentA.id, email: userAgentA.email, organizationId: orgA.id, role: ROLES.SUPPORT_AGENT };
    customerA = { userId: userCustomerA.id, email: userCustomerA.email, organizationId: orgA.id, role: ROLES.CUSTOMER };
    ownerB = { userId: userOwnerB.id, email: userOwnerB.email, organizationId: orgB.id, role: ROLES.TENANT_OWNER };
  });

  describe('list', () => {
    it('lets a tenant owner list their own organization members', async () => {
      const members = await service.list(ownerA);
      expect(members).toHaveLength(4);
      expect(members.every((m) => m.id !== ownerB.userId)).toBe(true);
    });

    it('rejects a support agent (insufficient role)', async () => {
      await expect(service.list(agentA)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a customer (insufficient role)', async () => {
      await expect(service.list(customerA)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateRole', () => {
    it('lets a tenant owner assign SUPPORT_AGENT to a member', async () => {
      const updated = await service.updateRole(ownerA, customerA.userId, ROLES.SUPPORT_AGENT);
      expect(updated.role).toBe(ROLES.SUPPORT_AGENT);
    });

    it('lets a tenant owner promote a member to TENANT_OWNER', async () => {
      const updated = await service.updateRole(ownerA, agentA.userId, ROLES.TENANT_OWNER);
      expect(updated.role).toBe(ROLES.TENANT_OWNER);
    });

    it('rejects an unauthorized support agent trying to assign a role', async () => {
      await expect(service.updateRole(agentA, customerA.userId, ROLES.SUPPORT_AGENT)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('a support agent cannot promote themselves to TENANT_OWNER', async () => {
      await expect(service.updateRole(agentA, agentA.userId, ROLES.TENANT_OWNER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('a support agent cannot promote another user', async () => {
      await expect(service.updateRole(agentA, customerA.userId, ROLES.TENANT_OWNER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('a customer cannot change anyone’s role', async () => {
      await expect(service.updateRole(customerA, agentA.userId, ROLES.TENANT_OWNER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('cross-tenant role modification is rejected as not found (never forbidden-but-existing)', async () => {
      await expect(service.updateRole(ownerA, ownerB.userId, ROLES.SUPPORT_AGENT)).rejects.toThrow(
        NotFoundException,
      );
      const stillOwner = await prisma.user.findUnique({ where: { id: ownerB.userId } });
      expect(stillOwner?.role).toBe('TENANT_OWNER');
    });

    it('rejects an invalid/non-assignable role', async () => {
      await expect(service.updateRole(ownerA, customerA.userId, 'PLATFORM_ADMIN' as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows demoting a tenant owner when another active owner remains', async () => {
      const updated = await service.updateRole(ownerA, ownerA2.userId, ROLES.SUPPORT_AGENT);
      expect(updated.role).toBe(ROLES.SUPPORT_AGENT);
    });

    it('blocks demoting the last active tenant owner', async () => {
      // Demote the second owner first, leaving ownerA as the sole owner.
      await service.updateRole(ownerA, ownerA2.userId, ROLES.SUPPORT_AGENT);
      await expect(service.updateRole(ownerA, ownerA.userId, ROLES.SUPPORT_AGENT)).rejects.toThrow(
        BadRequestException,
      );
      const stillOwner = await prisma.user.findUnique({ where: { id: ownerA.userId } });
      expect(stillOwner?.role).toBe('TENANT_OWNER');
    });
  });

  describe('remove', () => {
    it('lets a tenant owner remove (deactivate) a team member', async () => {
      const result = await service.remove(ownerA, agentA.userId);
      expect(result.message).toMatch(/removed/i);

      const removed = await prisma.user.findUnique({ where: { id: agentA.userId } });
      expect(removed?.isActive).toBe(false);
      expect(removed?.refreshTokenHash).toBeNull();
    });

    it('rejects a support agent trying to remove a member', async () => {
      await expect(service.remove(agentA, customerA.userId)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a customer trying to remove a member', async () => {
      await expect(service.remove(customerA, agentA.userId)).rejects.toThrow(ForbiddenException);
    });

    it('cross-tenant removal is rejected as not found', async () => {
      await expect(service.remove(ownerA, ownerB.userId)).rejects.toThrow(NotFoundException);
      const stillActive = await prisma.user.findUnique({ where: { id: ownerB.userId } });
      expect(stillActive?.isActive).toBe(true);
    });

    it('protects the final active tenant owner from being removed', async () => {
      await service.remove(ownerA, ownerA2.userId); // remove the second owner first
      await expect(service.remove(ownerA, ownerA.userId)).rejects.toThrow(BadRequestException);
      const stillActive = await prisma.user.findUnique({ where: { id: ownerA.userId } });
      expect(stillActive?.isActive).toBe(true);
    });

    it('allows removing a tenant owner when another active owner remains', async () => {
      const result = await service.remove(ownerA, ownerA2.userId);
      expect(result.message).toMatch(/removed/i);
    });
  });
});
