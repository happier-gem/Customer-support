import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ROLES, RpcAuthContext } from '@app/shared';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Proves tenant isolation and RBAC at the layer the assignment cares about
 * most: the backend/database access layer, against a real Postgres database
 * (see ../../.env.test) — not mocks. This is the authoritative evidence that
 * "Company A can never access Company B's data."
 */
describe('OrganizationsService (integration — tenant isolation)', () => {
  let service: OrganizationsService;
  let prisma: PrismaService;

  let orgA: { id: string };
  let orgB: { id: string };
  let ownerA: RpcAuthContext;
  let ownerB: RpcAuthContext;
  let supportAgentA: RpcAuthContext;
  let customerA: RpcAuthContext;
  let platformAdmin: RpcAuthContext;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
      providers: [OrganizationsService, PrismaService],
    }).compile();

    service = moduleRef.get(OrganizationsService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.organization.deleteMany({}); // cascades to users

    const passwordHash = await argon2.hash('SomePassword1');

    orgA = await prisma.organization.create({ data: { name: 'Company A' } });
    orgB = await prisma.organization.create({ data: { name: 'Company B' } });
    const platformOrg = await prisma.organization.create({ data: { name: 'Platform HQ' } });

    const userA = await prisma.user.create({
      data: {
        organizationId: orgA.id,
        name: 'Owner A',
        email: 'owner-a@company-a.test',
        passwordHash,
        role: 'TENANT_OWNER',
        emailVerified: true,
      },
    });
    const userB = await prisma.user.create({
      data: {
        organizationId: orgB.id,
        name: 'Owner B',
        email: 'owner-b@company-b.test',
        passwordHash,
        role: 'TENANT_OWNER',
        emailVerified: true,
      },
    });
    const agentA = await prisma.user.create({
      data: {
        organizationId: orgA.id,
        name: 'Agent A',
        email: 'agent-a@company-a.test',
        passwordHash,
        role: 'SUPPORT_AGENT',
        emailVerified: true,
      },
    });
    const custA = await prisma.user.create({
      data: {
        organizationId: orgA.id,
        name: 'Customer A',
        email: 'customer-a@company-a.test',
        passwordHash,
        role: 'CUSTOMER',
        emailVerified: true,
      },
    });
    const admin = await prisma.user.create({
      data: {
        organizationId: platformOrg.id,
        name: 'Platform Admin',
        email: 'admin@platform.test',
        passwordHash,
        role: 'PLATFORM_ADMIN',
        emailVerified: true,
      },
    });

    ownerA = { userId: userA.id, email: userA.email, organizationId: orgA.id, role: ROLES.TENANT_OWNER };
    ownerB = { userId: userB.id, email: userB.email, organizationId: orgB.id, role: ROLES.TENANT_OWNER };
    supportAgentA = { userId: agentA.id, email: agentA.email, organizationId: orgA.id, role: ROLES.SUPPORT_AGENT };
    customerA = { userId: custA.id, email: custA.email, organizationId: orgA.id, role: ROLES.CUSTOMER };
    platformAdmin = { userId: admin.id, email: admin.email, organizationId: platformOrg.id, role: ROLES.PLATFORM_ADMIN };
  });

  describe('getById — positive cases', () => {
    it('lets a user fetch their own organization', async () => {
      await expect(service.getById(ownerA, orgA.id)).resolves.toMatchObject({ id: orgA.id, name: 'Company A' });
      await expect(service.getById(ownerB, orgB.id)).resolves.toMatchObject({ id: orgB.id, name: 'Company B' });
    });

    it('lets a support agent and customer fetch their own organization', async () => {
      await expect(service.getById(supportAgentA, orgA.id)).resolves.toMatchObject({ id: orgA.id });
      await expect(service.getById(customerA, orgA.id)).resolves.toMatchObject({ id: orgA.id });
    });

    it('lets a platform admin fetch any organization (not restricted to one tenant)', async () => {
      await expect(service.getById(platformAdmin, orgA.id)).resolves.toMatchObject({ id: orgA.id });
      await expect(service.getById(platformAdmin, orgB.id)).resolves.toMatchObject({ id: orgB.id });
    });
  });

  describe('getById — cross-tenant isolation (CRITICAL)', () => {
    it('User A requesting Organization B data is rejected with 403', async () => {
      await expect(service.getById(ownerA, orgB.id)).rejects.toThrow(ForbiddenException);
    });

    it('User B requesting Organization A data is rejected with 403', async () => {
      await expect(service.getById(ownerB, orgA.id)).rejects.toThrow(ForbiddenException);
    });

    it('a support agent cannot access another organization', async () => {
      await expect(service.getById(supportAgentA, orgB.id)).rejects.toThrow(ForbiddenException);
    });

    it('a customer cannot access another organization', async () => {
      await expect(service.getById(customerA, orgB.id)).rejects.toThrow(ForbiddenException);
    });

    it('404s for a platform admin requesting a nonexistent organization (not a leaked 403)', async () => {
      await expect(service.getById(platformAdmin, 'not-a-real-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update — RBAC + tenant isolation', () => {
    it('a tenant owner can rename their own organization', async () => {
      await expect(service.update(ownerA, orgA.id, 'Company A Renamed')).resolves.toMatchObject({
        name: 'Company A Renamed',
      });
    });

    it('a tenant owner cannot rename another organization, even with a valid token', async () => {
      await expect(service.update(ownerA, orgB.id, 'Hijacked Name')).rejects.toThrow(ForbiddenException);
      const org = await prisma.organization.findUnique({ where: { id: orgB.id } });
      expect(org?.name).toBe('Company B');
    });

    it('a support agent cannot update their own organization (insufficient role)', async () => {
      await expect(service.update(supportAgentA, orgA.id, 'Nope')).rejects.toThrow(ForbiddenException);
    });

    it('a customer cannot update their own organization (insufficient role)', async () => {
      await expect(service.update(customerA, orgA.id, 'Nope')).rejects.toThrow(ForbiddenException);
    });

    it('a platform admin can update any organization', async () => {
      await expect(service.update(platformAdmin, orgB.id, 'Company B (managed)')).resolves.toMatchObject({
        name: 'Company B (managed)',
      });
    });
  });

  describe('list — platform-admin only', () => {
    it('rejects non-platform-admin roles', async () => {
      await expect(service.list(ownerA)).rejects.toThrow(ForbiddenException);
      await expect(service.list(supportAgentA)).rejects.toThrow(ForbiddenException);
      await expect(service.list(customerA)).rejects.toThrow(ForbiddenException);
    });

    it('returns all organizations across tenants for a platform admin', async () => {
      const orgs = await service.list(platformAdmin);
      const ids = orgs.map((o) => o.id);
      expect(ids).toEqual(expect.arrayContaining([orgA.id, orgB.id]));
    });
  });

  describe('updateProfile — Phase 3 company profile (name/logo/timezone)', () => {
    it('lets a tenant owner update their own organization profile', async () => {
      const updated = await service.updateProfile(ownerA, orgA.id, {
        name: 'Company A Inc.',
        timezone: 'America/New_York',
        logoUrl: '/uploads/logos/abc.png',
      });
      expect(updated).toMatchObject({
        name: 'Company A Inc.',
        timezone: 'America/New_York',
        logoUrl: '/uploads/logos/abc.png',
      });
    });

    it('only updates the fields provided', async () => {
      const updated = await service.updateProfile(ownerA, orgA.id, { timezone: 'Europe/Berlin' });
      expect(updated).toMatchObject({ name: 'Company A', timezone: 'Europe/Berlin' });
    });

    it('rejects a support agent updating the organization profile', async () => {
      await expect(service.updateProfile(supportAgentA, orgA.id, { timezone: 'UTC' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a customer updating the organization profile', async () => {
      await expect(service.updateProfile(customerA, orgA.id, { timezone: 'UTC' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('a tenant owner cannot update another organization’s profile, even with a valid token', async () => {
      await expect(service.updateProfile(ownerA, orgB.id, { name: 'Hijacked' })).rejects.toThrow(
        ForbiddenException,
      );
      const org = await prisma.organization.findUnique({ where: { id: orgB.id } });
      expect(org?.name).toBe('Company B');
    });

    it('a platform admin can update any organization profile', async () => {
      await expect(service.updateProfile(platformAdmin, orgB.id, { timezone: 'Asia/Tokyo' })).resolves.toMatchObject(
        { timezone: 'Asia/Tokyo' },
      );
    });
  });
});
