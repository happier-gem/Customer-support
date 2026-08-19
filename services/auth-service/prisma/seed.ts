import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const SEED_PASSWORD = 'Password123';

async function upsertUser(params: {
  organizationId: string;
  name: string;
  email: string;
  role: 'PLATFORM_ADMIN' | 'TENANT_OWNER' | 'SUPPORT_AGENT' | 'CUSTOMER';
}) {
  const passwordHash = await argon2.hash(SEED_PASSWORD);
  return prisma.user.upsert({
    where: { email: params.email },
    update: {},
    create: {
      organizationId: params.organizationId,
      name: params.name,
      email: params.email,
      passwordHash,
      role: params.role,
      isActive: true,
      emailVerified: true,
    },
  });
}

async function main() {
  // Platform admin lives in its own placeholder organization — there is no
  // self-registration path for PLATFORM_ADMIN by design (see AuthService),
  // so seeding is the only way to get one locally.
  const platformOrg = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000001', name: 'Platform' },
  });
  const admin = await upsertUser({
    organizationId: platformOrg.id,
    name: 'Platform Admin',
    email: 'admin@platform.test',
    role: 'PLATFORM_ADMIN',
  });

  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000002', name: 'Acme Support Co', plan: 'PRO' },
  });
  const owner = await upsertUser({
    organizationId: org.id,
    name: 'Olivia Owner',
    email: 'owner@acme.test',
    role: 'TENANT_OWNER',
  });
  const agent = await upsertUser({
    organizationId: org.id,
    name: 'Sam Agent',
    email: 'agent@acme.test',
    role: 'SUPPORT_AGENT',
  });
  const customer = await upsertUser({
    organizationId: org.id,
    name: 'Casey Customer',
    email: 'customer@acme.test',
    role: 'CUSTOMER',
  });

  const existingTicket = await prisma.ticket.findFirst({ where: { organizationId: org.id } });
  if (!existingTicket) {
    await prisma.ticket.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        title: 'Cannot log into my account',
        description: 'I keep getting an error when I try to sign in. Can someone help?',
        priority: 'MEDIUM',
      },
    });
  }

  console.log('Seed complete. All accounts use the password: ' + SEED_PASSWORD);
  console.log('  Platform admin : admin@platform.test');
  console.log('  Tenant owner   : owner@acme.test   (org: Acme Support Co)');
  console.log('  Support agent  : agent@acme.test   (org: Acme Support Co)');
  console.log('  Customer       : customer@acme.test (org: Acme Support Co)');
  void admin;
  void owner;
  void agent;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
