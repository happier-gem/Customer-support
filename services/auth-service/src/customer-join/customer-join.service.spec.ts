import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ROLES, RpcAuthContext } from '@app/shared';
import { CustomerJoinService } from './customer-join.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Phase 10: a tenant's standing customer-join link/code. Only a TENANT_OWNER
 * may manage their own organization's link; the public resolve methods must
 * never leak which organization a given token/code belongs to beyond its
 * name, and must reject anything invalid, revoked, or belonging to a
 * different, unrelated lookup key.
 */
describe('CustomerJoinService (integration — RBAC + tenant isolation)', () => {
  let service: CustomerJoinService;
  let prisma: PrismaService;

  let orgA: { id: string; name: string };
  let orgB: { id: string; name: string };
  let ownerA: RpcAuthContext;
  let agentA: RpcAuthContext;
  let customerA: RpcAuthContext;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
      providers: [CustomerJoinService, PrismaService],
    }).compile();

    service = moduleRef.get(CustomerJoinService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.organization.deleteMany({});

    orgA = await prisma.organization.create({ data: { name: 'Company A' } });
    orgB = await prisma.organization.create({ data: { name: 'Company B' } });

    ownerA = { userId: 'owner-a', email: 'owner-a@test.dev', organizationId: orgA.id, role: ROLES.TENANT_OWNER };
    agentA = { userId: 'agent-a', email: 'agent-a@test.dev', organizationId: orgA.id, role: ROLES.SUPPORT_AGENT };
    customerA = { userId: 'customer-a', email: 'customer-a@test.dev', organizationId: orgA.id, role: ROLES.CUSTOMER };
  });

  describe('getOrCreate', () => {
    it('creates a link on first call and returns the same one on subsequent calls', async () => {
      const first = await service.getOrCreate(ownerA);
      expect(first.isActive).toBe(true);
      expect(first.code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{5}$/);
      expect(first.joinUrl).toContain('/join/customer/');

      const second = await service.getOrCreate(ownerA);
      expect(second.code).toBe(first.code);
      expect(second.joinUrl).toBe(first.joinUrl);
    });

    it('rejects a non-tenant-owner', async () => {
      await expect(service.getOrCreate(agentA)).rejects.toThrow(ForbiddenException);
      await expect(service.getOrCreate(customerA)).rejects.toThrow(ForbiddenException);
    });

    it('gives each organization its own independent link', async () => {
      const ownerB: RpcAuthContext = { userId: 'owner-b', email: 'owner-b@test.dev', organizationId: orgB.id, role: ROLES.TENANT_OWNER };
      const linkA = await service.getOrCreate(ownerA);
      const linkB = await service.getOrCreate(ownerB);
      expect(linkA.code).not.toBe(linkB.code);
    });
  });

  describe('regenerate', () => {
    it('rotates the code (and underlying token) so the old one stops resolving', async () => {
      const original = await service.getOrCreate(ownerA);
      const preview = await service.resolveByCode(original.code);
      const originalToken = preview.joinToken;

      const regenerated = await service.regenerate(ownerA);
      expect(regenerated.code).not.toBe(original.code);

      await expect(service.resolveByCode(original.code)).rejects.toThrow(NotFoundException);
      await expect(service.resolveByToken(originalToken)).rejects.toThrow(NotFoundException);

      // The new one works.
      const resolved = await service.resolveByCode(regenerated.code);
      expect(resolved.organizationName).toBe('Company A');
    });

    it('reactivates a previously revoked link', async () => {
      await service.getOrCreate(ownerA);
      await service.revoke(ownerA);
      const regenerated = await service.regenerate(ownerA);
      expect(regenerated.isActive).toBe(true);
    });
  });

  describe('revoke', () => {
    it('deactivates the link so it can no longer be resolved', async () => {
      const link = await service.getOrCreate(ownerA);
      const preview = await service.resolveByCode(link.code);

      const revoked = await service.revoke(ownerA);
      expect(revoked.isActive).toBe(false);

      await expect(service.resolveByCode(link.code)).rejects.toThrow(NotFoundException);
      await expect(service.resolveByToken(preview.joinToken)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when no link exists yet', async () => {
      await expect(service.revoke(ownerA)).rejects.toThrow(NotFoundException);
    });

    it('rejects a non-tenant-owner', async () => {
      await service.getOrCreate(ownerA);
      await expect(service.revoke(agentA)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('resolveByToken / resolveByCode', () => {
    it('never leaks anything beyond the organization name', async () => {
      const link = await service.getOrCreate(ownerA);
      const preview = await service.resolveByCode(link.code);
      expect(Object.keys(preview).sort()).toEqual(['joinToken', 'organizationName']);
      expect(preview.organizationName).toBe('Company A');
    });

    it('throws the same generic error for a token/code that never existed', async () => {
      await expect(service.resolveByToken('does-not-exist-at-all')).rejects.toThrow(NotFoundException);
      await expect(service.resolveByCode('AAA-00000')).rejects.toThrow(NotFoundException);
    });

    it("a code never resolves a different organization's link", async () => {
      const ownerB: RpcAuthContext = { userId: 'owner-b', email: 'owner-b@test.dev', organizationId: orgB.id, role: ROLES.TENANT_OWNER };
      const linkA = await service.getOrCreate(ownerA);
      await service.getOrCreate(ownerB);

      const resolved = await service.resolveByCode(linkA.code);
      expect(resolved.organizationName).toBe('Company A');
    });
  });

  describe('resolveOrganizationIdByToken', () => {
    it('resolves the correct organizationId for a valid, active token', async () => {
      const link = await service.getOrCreate(ownerA);
      const preview = await service.resolveByCode(link.code);
      const organizationId = await service.resolveOrganizationIdByToken(preview.joinToken);
      expect(organizationId).toBe(orgA.id);
    });

    it('rejects a revoked token', async () => {
      const link = await service.getOrCreate(ownerA);
      const preview = await service.resolveByCode(link.code);
      await service.revoke(ownerA);
      await expect(service.resolveOrganizationIdByToken(preview.joinToken)).rejects.toThrow(NotFoundException);
    });
  });
});
