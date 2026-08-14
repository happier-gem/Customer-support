import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ROLES, RpcAuthContext, TICKET_PRIORITIES, TICKET_STATUSES } from '@app/shared';
import { TicketsService } from './tickets.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Integration tests against a real Postgres database (see ../../.env.test),
 * mirroring the pattern used for organizations/members/invitations: this is
 * the authoritative evidence for Phase 4 tenant isolation and RBAC, not the
 * gateway's thin HTTP layer.
 */
describe('TicketsService (integration — tenant isolation + RBAC)', () => {
  let service: TicketsService;
  let prisma: PrismaService;

  let orgA: { id: string };
  let orgB: { id: string };
  let ownerA: RpcAuthContext;
  let agentA: RpcAuthContext;
  let agentA2: RpcAuthContext;
  let inactiveAgentA: RpcAuthContext;
  let customerA: RpcAuthContext;
  let customerA2: RpcAuthContext;
  let ownerB: RpcAuthContext;
  let agentB: RpcAuthContext;
  let customerB: RpcAuthContext;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
      providers: [TicketsService, PrismaService],
    }).compile();

    service = moduleRef.get(TicketsService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.organization.deleteMany({}); // cascades to users -> tickets -> attachments/history

    const passwordHash = await argon2.hash('SomePassword1');
    const mkUser = (organizationId: string, name: string, role: string, isActive = true) =>
      prisma.user.create({
        data: {
          organizationId,
          name,
          email: `${name.toLowerCase().replace(/\s+/g, '-')}@test.local`,
          passwordHash,
          role: role as never,
          emailVerified: true,
          isActive,
        },
      });

    orgA = await prisma.organization.create({ data: { name: 'Company A' } });
    orgB = await prisma.organization.create({ data: { name: 'Company B' } });

    const [userOwnerA, userAgentA, userAgentA2, userInactiveAgentA, userCustomerA, userCustomerA2] = await Promise.all([
      mkUser(orgA.id, 'Owner A', ROLES.TENANT_OWNER),
      mkUser(orgA.id, 'Agent A', ROLES.SUPPORT_AGENT),
      mkUser(orgA.id, 'Agent A2', ROLES.SUPPORT_AGENT),
      mkUser(orgA.id, 'Inactive Agent A', ROLES.SUPPORT_AGENT, false),
      mkUser(orgA.id, 'Customer A', ROLES.CUSTOMER),
      mkUser(orgA.id, 'Customer A2', ROLES.CUSTOMER),
    ]);
    const [userOwnerB, userAgentB, userCustomerB] = await Promise.all([
      mkUser(orgB.id, 'Owner B', ROLES.TENANT_OWNER),
      mkUser(orgB.id, 'Agent B', ROLES.SUPPORT_AGENT),
      mkUser(orgB.id, 'Customer B', ROLES.CUSTOMER),
    ]);

    const ctx = (u: { id: string; email: string }, organizationId: string, role: string): RpcAuthContext => ({
      userId: u.id,
      email: u.email,
      organizationId,
      role: role as never,
    });

    ownerA = ctx(userOwnerA, orgA.id, ROLES.TENANT_OWNER);
    agentA = ctx(userAgentA, orgA.id, ROLES.SUPPORT_AGENT);
    agentA2 = ctx(userAgentA2, orgA.id, ROLES.SUPPORT_AGENT);
    inactiveAgentA = ctx(userInactiveAgentA, orgA.id, ROLES.SUPPORT_AGENT);
    customerA = ctx(userCustomerA, orgA.id, ROLES.CUSTOMER);
    customerA2 = ctx(userCustomerA2, orgA.id, ROLES.CUSTOMER);
    ownerB = ctx(userOwnerB, orgB.id, ROLES.TENANT_OWNER);
    agentB = ctx(userAgentB, orgB.id, ROLES.SUPPORT_AGENT);
    customerB = ctx(userCustomerB, orgB.id, ROLES.CUSTOMER);
  });

  // ---------------------------------------------------------------------
  // Ticket creation
  // ---------------------------------------------------------------------
  describe('create', () => {
    it('lets a customer create a ticket', async () => {
      const ticket = await service.create(customerA, { title: 'Cannot log in', description: 'It just spins forever' });
      expect(ticket).toMatchObject({
        title: 'Cannot log in',
        status: TICKET_STATUSES.OPEN,
        priority: TICKET_PRIORITIES.MEDIUM,
      });
    });

    it('derives organizationId from the auth context, never from client input', async () => {
      const ticket = await service.create(customerA, { title: 'Billing question', description: 'Why was I charged twice?' });
      expect(ticket.organizationId).toBe(orgA.id);
      const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(row.organizationId).toBe(orgA.id);
    });

    it('derives customerId from the auth context, never from client input', async () => {
      const ticket = await service.create(customerA, { title: 'Refund request', description: 'Please refund order 123' });
      expect(ticket.customer.id).toBe(customerA.userId);
    });

    it('applies the given priority', async () => {
      const ticket = await service.create(customerA, {
        title: 'Server down',
        description: 'Production is completely down',
        priority: TICKET_PRIORITIES.URGENT,
      });
      expect(ticket.priority).toBe(TICKET_PRIORITIES.URGENT);
    });

    it('rejects ticket creation by a support agent', async () => {
      await expect(
        service.create(agentA, { title: 'Agent-created ticket', description: 'Should not be allowed' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects ticket creation by a tenant owner', async () => {
      await expect(
        service.create(ownerA, { title: 'Owner-created ticket', description: 'Should not be allowed' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates an initial CREATED history entry', async () => {
      const ticket = await service.create(customerA, { title: 'New issue', description: 'Something is broken here' });
      const history = await service.getHistory(customerA, ticket.id);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ action: 'CREATED', newStatus: TICKET_STATUSES.OPEN, actor: { id: customerA.userId } });
      expect(history[0].createdAt).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------
  // Tenant isolation
  // ---------------------------------------------------------------------
  describe('tenant isolation', () => {
    it('customer A cannot read ticket B; agent A cannot read ticket B', async () => {
      const ticketB = await service.create(customerB, { title: 'Org B issue', description: 'Something broke in org B' });
      await expect(service.getById(customerA, ticketB.id)).rejects.toThrow(NotFoundException);
      await expect(service.getById(agentA, ticketB.id)).rejects.toThrow(NotFoundException);
      await expect(service.getById(ownerA, ticketB.id)).rejects.toThrow(NotFoundException);
    });

    it('tenant owner A cannot modify ticket B; agent B cannot modify ticket A', async () => {
      const ticketA = await service.create(customerA, { title: 'Org A issue', description: 'Something broke in org A' });
      const ticketB = await service.create(customerB, { title: 'Org B issue', description: 'Something broke in org B' });

      await expect(service.update(ownerA, ticketB.id, { title: 'Hijacked' })).rejects.toThrow(NotFoundException);
      await expect(service.updateStatus(agentB, ticketA.id, TICKET_STATUSES.IN_PROGRESS)).rejects.toThrow(NotFoundException);
    });

    it('ticket history cannot cross tenants', async () => {
      const ticketB = await service.create(customerB, { title: 'Org B issue', description: 'Something broke in org B' });
      await expect(service.getHistory(customerA, ticketB.id)).rejects.toThrow(NotFoundException);
      await expect(service.getHistory(agentA, ticketB.id)).rejects.toThrow(NotFoundException);
    });

    it('ticket attachments cannot cross tenants', async () => {
      const ticketB = await service.create(customerB, { title: 'Org B issue', description: 'Something broke in org B' });
      const attachment = await service.createAttachment(customerB, ticketB.id, {
        fileName: 'evidence.png',
        storedFileName: 'uuid-1.png',
        mimeType: 'image/png',
        size: 1024,
      });

      await expect(service.getAttachment(customerA, ticketB.id, attachment.id)).rejects.toThrow(NotFoundException);
      await expect(service.getAttachment(agentA, ticketB.id, attachment.id)).rejects.toThrow(NotFoundException);
    });

    it('a client-supplied ticket id from another org never resolves, even for a legitimate same-org id lookalike', async () => {
      const ticketA = await service.create(customerA, { title: 'Org A issue', description: 'Something broke in org A' });
      // Simulates "organization ID query manipulation": agent B (a real, authenticated agent) targets org A's ticket id directly.
      await expect(service.getById(agentB, ticketA.id)).rejects.toThrow(NotFoundException);
    });

    it('a customer cannot see another customer’s ticket within the same organization', async () => {
      const ticketA = await service.create(customerA, { title: 'Private issue', description: 'Only customer A should see this' });
      await expect(service.getById(customerA2, ticketA.id)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------
  describe('permissions', () => {
    it('customer cannot assign a ticket to an agent', async () => {
      const ticket = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await expect(service.assign(customerA, ticket.id, agentA.userId)).rejects.toThrow(ForbiddenException);
    });

    it('customer cannot assign themselves as agent (assign-self is agent-only)', async () => {
      const ticket = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await expect(service.assignSelf(customerA, ticket.id)).rejects.toThrow(ForbiddenException);
    });

    it('customer cannot arbitrarily change status', async () => {
      const ticket = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await expect(service.updateStatus(customerA, ticket.id, TICKET_STATUSES.IN_PROGRESS)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('support agent can view and act on tickets in their organization', async () => {
      const ticket = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await expect(service.getById(agentA, ticket.id)).resolves.toMatchObject({ id: ticket.id });
      await expect(service.updateStatus(agentA, ticket.id, TICKET_STATUSES.IN_PROGRESS)).resolves.toMatchObject({
        status: TICKET_STATUSES.IN_PROGRESS,
      });
    });

    it('tenant owner can assign tickets', async () => {
      const ticket = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await expect(service.assign(ownerA, ticket.id, agentA.userId)).resolves.toMatchObject({
        assignedAgent: { id: agentA.userId },
      });
    });

    it('rejects an unauthorized role changing status (defense in depth beyond the gateway RolesGuard)', async () => {
      const ticket = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await expect(service.updateStatus(customerA, ticket.id, TICKET_STATUSES.CLOSED)).rejects.toThrow(ForbiddenException);
    });
  });

  // ---------------------------------------------------------------------
  // Update (title/description/priority — Part 19: no unrestricted PATCH)
  // ---------------------------------------------------------------------
  describe('update', () => {
    it('lets the customer edit their own ticket while it is still OPEN', async () => {
      const t = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      const updated = await service.update(customerA, t.id, { title: 'Updated issue title' });
      expect(updated.title).toBe('Updated issue title');
    });

    it('rejects a customer changing priority (agent/owner-only field)', async () => {
      const t = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await expect(service.update(customerA, t.id, { priority: TICKET_PRIORITIES.URGENT })).rejects.toThrow(ForbiddenException);
    });

    it('rejects a customer editing their ticket once it is no longer OPEN', async () => {
      const t = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await service.updateStatus(agentA, t.id, TICKET_STATUSES.IN_PROGRESS);
      await expect(service.update(customerA, t.id, { title: 'Too late' })).rejects.toThrow(ForbiddenException);
    });

    it('rejects a customer editing another customer’s ticket', async () => {
      const t = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await expect(service.update(customerA2, t.id, { title: 'Not mine' })).rejects.toThrow(NotFoundException);
    });

    it('lets an agent or owner edit title/description/priority on any org ticket', async () => {
      const t = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      const updated = await service.update(agentA, t.id, { priority: TICKET_PRIORITIES.HIGH });
      expect(updated.priority).toBe(TICKET_PRIORITIES.HIGH);
      const updated2 = await service.update(ownerA, t.id, { description: 'Owner clarified the description here' });
      expect(updated2.description).toBe('Owner clarified the description here');
    });

    it('records an UPDATED history entry naming the changed fields', async () => {
      const t = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await service.update(agentA, t.id, { title: 'New title', priority: TICKET_PRIORITIES.LOW });
      const history = await service.getHistory(agentA, t.id);
      const entry = history.find((h) => h.action === 'UPDATED');
      expect(entry?.metadata).toMatchObject({ fields: expect.arrayContaining(['title', 'priority']) });
    });

    it('a cross-tenant update attempt is rejected as not found', async () => {
      const ticketB = await service.create(customerB, { title: 'Org B issue', description: 'Something broke in org B' });
      await expect(service.update(ownerA, ticketB.id, { title: 'Hijacked' })).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------
  // Assignment
  // ---------------------------------------------------------------------
  describe('assignment', () => {
    it('an agent can pick up an unassigned ticket', async () => {
      const ticket = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      const updated = await service.assignSelf(agentA, ticket.id);
      expect(updated.assignedAgent).toMatchObject({ id: agentA.userId });
    });

    it('a tenant owner can assign an agent', async () => {
      const ticket = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      const updated = await service.assign(ownerA, ticket.id, agentA.userId);
      expect(updated.assignedAgent).toMatchObject({ id: agentA.userId });
    });

    it('cannot assign a ticket to a customer', async () => {
      const ticket = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await expect(service.assign(ownerA, ticket.id, customerA2.userId)).rejects.toThrow(BadRequestException);
    });

    it('cannot assign a ticket to an inactive agent', async () => {
      const ticket = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await expect(service.assign(ownerA, ticket.id, inactiveAgentA.userId)).rejects.toThrow(BadRequestException);
    });

    it('cannot assign a ticket to a cross-tenant agent', async () => {
      const ticket = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await expect(service.assign(ownerA, ticket.id, agentB.userId)).rejects.toThrow(NotFoundException);
    });

    it('an agent cannot pick up a ticket already assigned to someone else', async () => {
      const ticket = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await service.assignSelf(agentA, ticket.id);
      await expect(service.assignSelf(agentA2, ticket.id)).rejects.toThrow(BadRequestException);
    });

    it('an agent from another org cannot pick up this org’s ticket', async () => {
      const ticket = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await expect(service.assignSelf(agentB, ticket.id)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------
  // Status transitions
  // ---------------------------------------------------------------------
  describe('status transitions', () => {
    async function freshTicket() {
      return service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
    }

    it('OPEN -> IN_PROGRESS works', async () => {
      const t = await freshTicket();
      await expect(service.updateStatus(agentA, t.id, TICKET_STATUSES.IN_PROGRESS)).resolves.toMatchObject({
        status: TICKET_STATUSES.IN_PROGRESS,
      });
    });

    it('IN_PROGRESS -> WAITING_FOR_CUSTOMER works', async () => {
      const t = await freshTicket();
      await service.updateStatus(agentA, t.id, TICKET_STATUSES.IN_PROGRESS);
      await expect(service.updateStatus(agentA, t.id, TICKET_STATUSES.WAITING_FOR_CUSTOMER)).resolves.toMatchObject({
        status: TICKET_STATUSES.WAITING_FOR_CUSTOMER,
      });
    });

    it('WAITING_FOR_CUSTOMER -> RESOLVED works and stamps resolvedAt', async () => {
      const t = await freshTicket();
      await service.updateStatus(agentA, t.id, TICKET_STATUSES.IN_PROGRESS);
      await service.updateStatus(agentA, t.id, TICKET_STATUSES.WAITING_FOR_CUSTOMER);
      const updated = await service.updateStatus(agentA, t.id, TICKET_STATUSES.RESOLVED);
      expect(updated.status).toBe(TICKET_STATUSES.RESOLVED);
      expect(updated.resolvedAt).toBeTruthy();
    });

    it('RESOLVED -> CLOSED works and stamps closedAt', async () => {
      const t = await freshTicket();
      await service.updateStatus(agentA, t.id, TICKET_STATUSES.IN_PROGRESS);
      await service.updateStatus(agentA, t.id, TICKET_STATUSES.RESOLVED);
      const updated = await service.updateStatus(agentA, t.id, TICKET_STATUSES.CLOSED);
      expect(updated.status).toBe(TICKET_STATUSES.CLOSED);
      expect(updated.closedAt).toBeTruthy();
    });

    it.each([
      [TICKET_STATUSES.OPEN, TICKET_STATUSES.RESOLVED],
      [TICKET_STATUSES.OPEN, TICKET_STATUSES.CLOSED],
      [TICKET_STATUSES.OPEN, TICKET_STATUSES.WAITING_FOR_CUSTOMER],
      [TICKET_STATUSES.IN_PROGRESS, TICKET_STATUSES.CLOSED],
    ])('rejects invalid transition %s -> %s', async (from, to) => {
      const t = await freshTicket();
      if (from === TICKET_STATUSES.IN_PROGRESS) {
        await service.updateStatus(agentA, t.id, TICKET_STATUSES.IN_PROGRESS);
      }
      await expect(service.updateStatus(agentA, t.id, to)).rejects.toThrow(BadRequestException);
    });

    it('rejects any transition out of CLOSED (terminal state)', async () => {
      const t = await freshTicket();
      await service.updateStatus(agentA, t.id, TICKET_STATUSES.IN_PROGRESS);
      await service.updateStatus(agentA, t.id, TICKET_STATUSES.RESOLVED);
      await service.updateStatus(agentA, t.id, TICKET_STATUSES.CLOSED);
      await expect(service.updateStatus(agentA, t.id, TICKET_STATUSES.IN_PROGRESS)).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------
  describe('history', () => {
    it('assignment creates a history entry identifying the actor and timestamp', async () => {
      const t = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await service.assign(ownerA, t.id, agentA.userId);
      const history = await service.getHistory(ownerA, t.id);
      const assigned = history.find((h) => h.action === 'ASSIGNED');
      expect(assigned).toMatchObject({ actor: { id: ownerA.userId } });
      expect(assigned?.createdAt).toBeTruthy();
    });

    it('status change records previous and new status', async () => {
      const t = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await service.updateStatus(agentA, t.id, TICKET_STATUSES.IN_PROGRESS);
      const history = await service.getHistory(agentA, t.id);
      const changed = history.find((h) => h.action === 'STATUS_CHANGED');
      expect(changed).toMatchObject({ previousStatus: TICKET_STATUSES.OPEN, newStatus: TICKET_STATUSES.IN_PROGRESS });
    });

    it('the customer can retrieve their own ticket’s history', async () => {
      const t = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      await service.updateStatus(agentA, t.id, TICKET_STATUSES.IN_PROGRESS);
      await expect(service.getHistory(customerA, t.id)).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'CREATED' }),
        expect.objectContaining({ action: 'STATUS_CHANGED' }),
      ]));
    });
  });

  // ---------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------
  describe('pagination', () => {
    beforeEach(async () => {
      for (let i = 0; i < 25; i++) {
        await service.create(customerA, { title: `Ticket ${i}`, description: `Description number ${i} here` });
      }
    });

    it('returns the correct page and total', async () => {
      const result = await service.list(ownerA, { page: 2, limit: 10 });
      expect(result.data).toHaveLength(10);
      expect(result.pagination).toMatchObject({ page: 2, limit: 10, total: 25, totalPages: 3 });
    });

    it('the last page returns the remainder', async () => {
      const result = await service.list(ownerA, { page: 3, limit: 10 });
      expect(result.data).toHaveLength(5);
    });

    it('caps an excessive limit at the maximum page size', async () => {
      const result = await service.list(ownerA, { page: 1, limit: 10000 });
      expect(result.pagination.limit).toBeLessThanOrEqual(100);
      expect(result.data.length).toBeLessThanOrEqual(100);
    });

    it('falls back to defaults for missing/invalid pagination values', async () => {
      const result = await service.list(ownerA, { page: 0, limit: -5 });
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });
  });

  // ---------------------------------------------------------------------
  // Search / filter
  // ---------------------------------------------------------------------
  describe('search and filter', () => {
    it('search matches title', async () => {
      await service.create(customerA, { title: 'Payment gateway broken', description: 'Nothing special here' });
      await service.create(customerA, { title: 'Login issue', description: 'Nothing special here' });
      const result = await service.list(ownerA, { search: 'payment' });
      expect(result.data.map((t) => t.title)).toEqual(['Payment gateway broken']);
    });

    it('search matches description', async () => {
      await service.create(customerA, { title: 'Issue one', description: 'The invoice total looks wrong' });
      await service.create(customerA, { title: 'Issue two', description: 'Cannot reset my password' });
      const result = await service.list(ownerA, { search: 'invoice' });
      expect(result.data.map((t) => t.title)).toEqual(['Issue one']);
    });

    it('status filter works', async () => {
      const t1 = await service.create(customerA, { title: 'Open one', description: 'Still open right now' });
      const t2 = await service.create(customerA, { title: 'In progress one', description: 'Being worked on now' });
      await service.updateStatus(agentA, t2.id, TICKET_STATUSES.IN_PROGRESS);

      const openResult = await service.list(ownerA, { status: TICKET_STATUSES.OPEN });
      expect(openResult.data.map((t) => t.id)).toEqual([t1.id]);
    });

    it('priority filter works', async () => {
      await service.create(customerA, { title: 'Low one', description: 'Not urgent at all', priority: TICKET_PRIORITIES.LOW });
      const urgent = await service.create(customerA, {
        title: 'Urgent one',
        description: 'This needs attention now',
        priority: TICKET_PRIORITIES.URGENT,
      });
      const result = await service.list(ownerA, { priority: TICKET_PRIORITIES.URGENT });
      expect(result.data.map((t) => t.id)).toEqual([urgent.id]);
    });

    it('assignee filter works, including the "me" shorthand', async () => {
      const t1 = await service.create(customerA, { title: 'Mine', description: 'Assigned to agent A here' });
      const t2 = await service.create(customerA, { title: 'Not mine', description: 'Assigned to agent A2 here' });
      await service.assignSelf(agentA, t1.id);
      await service.assign(ownerA, t2.id, agentA2.userId);

      const mine = await service.list(agentA, { assigneeId: 'me' });
      expect(mine.data.map((t) => t.id)).toEqual([t1.id]);

      const explicit = await service.list(ownerA, { assigneeId: agentA2.userId });
      expect(explicit.data.map((t) => t.id)).toEqual([t2.id]);
    });

    it('search remains tenant-scoped', async () => {
      await service.create(customerA, { title: 'Shared keyword ticket', description: 'Nothing special here' });
      await service.create(customerB, { title: 'Shared keyword ticket', description: 'Nothing special here' });

      const result = await service.list(ownerA, { search: 'Shared keyword' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].organizationId).toBe(orgA.id);
    });

    it('filters remain tenant-scoped', async () => {
      await service.create(customerA, { title: 'Org A urgent', description: 'Something urgent', priority: TICKET_PRIORITIES.URGENT });
      await service.create(customerB, { title: 'Org B urgent', description: 'Something urgent', priority: TICKET_PRIORITIES.URGENT });

      const result = await service.list(ownerA, { priority: TICKET_PRIORITIES.URGENT });
      expect(result.data.every((t) => t.organizationId === orgA.id)).toBe(true);
    });

    it('an assignee filter referencing another organization’s user id yields no results (never a cross-tenant bypass)', async () => {
      await service.create(customerA, { title: 'Org A ticket', description: 'Something to look at' });
      const result = await service.list(ownerA, { assigneeId: agentB.userId });
      expect(result.data).toHaveLength(0);
    });

    it('a customer’s list is restricted to their own tickets regardless of filters', async () => {
      await service.create(customerA, { title: 'Mine', description: 'Belongs to customer A' });
      await service.create(customerA2, { title: 'Not mine', description: 'Belongs to customer A2' });

      const result = await service.list(customerA, {});
      expect(result.data).toHaveLength(1);
      expect(result.data[0].customer.id).toBe(customerA.userId);
    });
  });

  // ---------------------------------------------------------------------
  // Attachments (service-level: gateway enforces size/MIME via multer config)
  // ---------------------------------------------------------------------
  describe('attachments', () => {
    it('a valid attachment is recorded against the ticket and creates history', async () => {
      const t = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      const attachment = await service.createAttachment(customerA, t.id, {
        fileName: 'screenshot.png',
        storedFileName: 'generated-uuid.png',
        mimeType: 'image/png',
        size: 2048,
      });
      expect(attachment).toMatchObject({ fileName: 'screenshot.png', mimeType: 'image/png', size: 2048 });

      const history = await service.getHistory(customerA, t.id);
      expect(history.some((h) => h.action === 'ATTACHMENT_ADDED')).toBe(true);
    });

    it('rejects attaching a file to a cross-tenant ticket', async () => {
      const ticketB = await service.create(customerB, { title: 'Org B issue', description: 'Something in org B' });
      await expect(
        service.createAttachment(customerA, ticketB.id, {
          fileName: 'x.png',
          storedFileName: 'y.png',
          mimeType: 'image/png',
          size: 10,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('cross-tenant attachment access is denied even with a correct attachment id', async () => {
      const t = await service.create(customerA, { title: 'Issue', description: 'Needs help from support' });
      const attachment = await service.createAttachment(customerA, t.id, {
        fileName: 'x.png',
        storedFileName: 'y.png',
        mimeType: 'image/png',
        size: 10,
      });
      await expect(service.getAttachment(customerB, t.id, attachment.id)).rejects.toThrow(NotFoundException);
      await expect(service.getAttachment(agentB, t.id, attachment.id)).rejects.toThrow(NotFoundException);
    });
  });
});
