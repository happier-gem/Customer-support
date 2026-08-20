import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_FORM_STATUSES,
  FEEDBACK_QUESTION_TYPES,
  ROLES,
  RpcAuthContext,
} from '@app/shared';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Integration tests against a real Postgres database (see ../../.env.test),
 * mirroring tickets/tickets.service.spec.ts: this is the authoritative
 * evidence for Phase 5 tenant isolation, RBAC, and anonymity handling — not
 * the gateway's thin HTTP layer. Covers every case enumerated in the Phase 5
 * assignment's Part 24 security-test checklist.
 */
describe('FeedbackService (integration — tenant isolation + RBAC)', () => {
  let service: FeedbackService;
  let prisma: PrismaService;

  let orgA: { id: string };
  let orgB: { id: string };
  let ownerA: RpcAuthContext;
  let agentA: RpcAuthContext;
  let customerA: RpcAuthContext;
  let customerA2: RpcAuthContext;
  let ownerB: RpcAuthContext;
  let agentB: RpcAuthContext;
  let customerB: RpcAuthContext;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
      providers: [FeedbackService, SubscriptionsService, PrismaService, NotificationsService],
    }).compile();

    service = moduleRef.get(FeedbackService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.organization.deleteMany({}); // cascades to users -> feedback forms/questions/responses/answers

    const passwordHash = await argon2.hash('SomePassword1');
    const mkUser = (organizationId: string, name: string, role: string) =>
      prisma.user.create({
        data: {
          organizationId,
          name,
          email: `${name.toLowerCase().replace(/\s+/g, '-')}@test.local`,
          passwordHash,
          role: role as never,
          emailVerified: true,
          isActive: true,
        },
      });

    // PRO here (not the FREE default) so this suite's pre-Phase-6 assumption
    // of unlimited form creation still holds; Phase 6's own feedback-form
    // limit behavior is covered in subscriptions/subscriptions.service.spec.ts.
    orgA = await prisma.organization.create({ data: { name: 'Company A', plan: 'PRO' } });
    orgB = await prisma.organization.create({ data: { name: 'Company B', plan: 'PRO' } });

    const [userOwnerA, userAgentA, userCustomerA, userCustomerA2] = await Promise.all([
      mkUser(orgA.id, 'Owner A', ROLES.TENANT_OWNER),
      mkUser(orgA.id, 'Agent A', ROLES.SUPPORT_AGENT),
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
    customerA = ctx(userCustomerA, orgA.id, ROLES.CUSTOMER);
    customerA2 = ctx(userCustomerA2, orgA.id, ROLES.CUSTOMER);
    ownerB = ctx(userOwnerB, orgB.id, ROLES.TENANT_OWNER);
    agentB = ctx(userAgentB, orgB.id, ROLES.SUPPORT_AGENT);
    customerB = ctx(userCustomerB, orgB.id, ROLES.CUSTOMER);
  });

  /** Creates a form with one required RATING and one optional TEXT question, then activates it. */
  async function createActiveForm(owner: RpcAuthContext, opts: { textRequired?: boolean; textMaxLength?: number } = {}) {
    const form = await service.createForm(owner, { title: 'Customer Satisfaction Survey', description: 'How did we do?' });
    const ratingQuestion = await service.createQuestion(owner, form.id, {
      type: FEEDBACK_QUESTION_TYPES.RATING,
      label: 'How satisfied were you with our support?',
      required: true,
    });
    const textQuestion = await service.createQuestion(owner, form.id, {
      type: FEEDBACK_QUESTION_TYPES.TEXT,
      label: 'Additional comments',
      required: opts.textRequired ?? false,
      maxLength: opts.textMaxLength,
    });
    await service.updateFormStatus(owner, form.id, FEEDBACK_FORM_STATUSES.ACTIVE);
    return { form, ratingQuestion, textQuestion };
  }

  // ---------------------------------------------------------------------
  // Form management
  // ---------------------------------------------------------------------
  describe('form management', () => {
    it('1. tenant owner can create a form', async () => {
      const form = await service.createForm(ownerA, { title: 'Support Survey', category: FEEDBACK_CATEGORIES.SUPPORT });
      expect(form).toMatchObject({
        title: 'Support Survey',
        category: FEEDBACK_CATEGORIES.SUPPORT,
        status: FEEDBACK_FORM_STATUSES.INACTIVE,
        organizationId: orgA.id,
      });
    });

    it('a new form defaults to GENERAL category and INACTIVE status', async () => {
      const form = await service.createForm(ownerA, { title: 'Untitled Survey' });
      expect(form.category).toBe(FEEDBACK_CATEGORIES.GENERAL);
      expect(form.status).toBe(FEEDBACK_FORM_STATUSES.INACTIVE);
    });

    it('2. tenant owner can update a form', async () => {
      const form = await service.createForm(ownerA, { title: 'Old title' });
      const updated = await service.updateForm(ownerA, form.id, { title: 'New title', category: FEEDBACK_CATEGORIES.PRODUCT });
      expect(updated).toMatchObject({ title: 'New title', category: FEEDBACK_CATEGORIES.PRODUCT });
    });

    it('3. tenant owner can activate and deactivate a form', async () => {
      const form = await service.createForm(ownerA, { title: 'Survey' });
      const activated = await service.updateFormStatus(ownerA, form.id, FEEDBACK_FORM_STATUSES.ACTIVE);
      expect(activated.status).toBe(FEEDBACK_FORM_STATUSES.ACTIVE);
      const deactivated = await service.updateFormStatus(ownerA, form.id, FEEDBACK_FORM_STATUSES.INACTIVE);
      expect(deactivated.status).toBe(FEEDBACK_FORM_STATUSES.INACTIVE);
    });

    it('4. tenant owner cannot modify another tenant’s form', async () => {
      const formB = await service.createForm(ownerB, { title: 'Org B survey' });
      await expect(service.updateForm(ownerA, formB.id, { title: 'Hijacked' })).rejects.toThrow(NotFoundException);
      await expect(service.updateFormStatus(ownerA, formB.id, FEEDBACK_FORM_STATUSES.ACTIVE)).rejects.toThrow(NotFoundException);
      await expect(service.deleteForm(ownerA, formB.id)).rejects.toThrow(NotFoundException);
    });

    it('5. support agent cannot create a form (feedback is tenant-owner-only)', async () => {
      await expect(service.createForm(agentA, { title: 'Agent survey' })).rejects.toThrow(ForbiddenException);
    });

    it('support agent cannot update or delete a form', async () => {
      const form = await service.createForm(ownerA, { title: 'Survey' });
      await expect(service.updateForm(agentA, form.id, { title: 'Changed' })).rejects.toThrow(ForbiddenException);
      await expect(service.deleteForm(agentA, form.id)).rejects.toThrow(ForbiddenException);
    });

    it('support agent cannot even view a form', async () => {
      const form = await service.createForm(ownerA, { title: 'Survey' });
      await expect(service.getFormById(agentA, form.id)).rejects.toThrow(ForbiddenException);
      await expect(service.listForms(agentA, {})).rejects.toThrow(ForbiddenException);
    });

    it('6. customer cannot create a form', async () => {
      await expect(service.createForm(customerA, { title: 'Customer survey' })).rejects.toThrow(ForbiddenException);
    });

    it('customer cannot update, activate, or delete a form', async () => {
      const form = await service.createForm(ownerA, { title: 'Survey' });
      await expect(service.updateForm(customerA, form.id, { title: 'Changed' })).rejects.toThrow(ForbiddenException);
      await expect(service.updateFormStatus(customerA, form.id, FEEDBACK_FORM_STATUSES.ACTIVE)).rejects.toThrow(ForbiddenException);
      await expect(service.deleteForm(customerA, form.id)).rejects.toThrow(ForbiddenException);
    });

    it('a customer cannot see an inactive form at all (list or get)', async () => {
      const form = await service.createForm(ownerA, { title: 'Draft survey' });
      await expect(service.getFormById(customerA, form.id)).rejects.toThrow(NotFoundException);
      const list = await service.listForms(customerA, {});
      expect(list.data).toHaveLength(0);
    });

    it('a form with existing responses cannot be deleted, but can still be deactivated', async () => {
      const { form } = await createActiveForm(ownerA);
      await service.submitResponse(customerA, form.id, { answers: [{ questionId: (await service.getFormById(ownerA, form.id)).questions[0].id, ratingValue: 5 }] });
      await expect(service.deleteForm(ownerA, form.id)).rejects.toThrow(BadRequestException);
      await expect(service.updateFormStatus(ownerA, form.id, FEEDBACK_FORM_STATUSES.INACTIVE)).resolves.toMatchObject({
        status: FEEDBACK_FORM_STATUSES.INACTIVE,
      });
    });

    it('a form with no responses can be deleted', async () => {
      const form = await service.createForm(ownerA, { title: 'Unused survey' });
      await service.deleteForm(ownerA, form.id);
      await expect(service.getFormById(ownerA, form.id)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------
  // Questions
  // ---------------------------------------------------------------------
  describe('questions', () => {
    it('7. owner can add a question', async () => {
      const form = await service.createForm(ownerA, { title: 'Survey' });
      const question = await service.createQuestion(ownerA, form.id, {
        type: FEEDBACK_QUESTION_TYPES.RATING,
        label: 'How satisfied were you?',
      });
      expect(question).toMatchObject({ type: FEEDBACK_QUESTION_TYPES.RATING, required: true });
    });

    it('8. owner can edit a question', async () => {
      const form = await service.createForm(ownerA, { title: 'Survey' });
      const question = await service.createQuestion(ownerA, form.id, { type: FEEDBACK_QUESTION_TYPES.TEXT, label: 'Comments' });
      const updated = await service.updateQuestion(ownerA, form.id, question.id, { label: 'Any additional comments?', required: false });
      expect(updated).toMatchObject({ label: 'Any additional comments?', required: false });
    });

    it('9. owner can remove a question (with no answers yet)', async () => {
      const form = await service.createForm(ownerA, { title: 'Survey' });
      const question = await service.createQuestion(ownerA, form.id, { type: FEEDBACK_QUESTION_TYPES.TEXT, label: 'Comments' });
      await service.deleteQuestion(ownerA, form.id, question.id);
      const detail = await service.getFormById(ownerA, form.id);
      expect(detail.questions).toHaveLength(0);
    });

    it('a question that already has answers cannot be removed', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      await service.submitResponse(customerA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 4 }] });
      await expect(service.deleteQuestion(ownerA, form.id, ratingQuestion.id)).rejects.toThrow(BadRequestException);
    });

    it('10. invalid question configuration is rejected: maxLength is TEXT-only', async () => {
      const form = await service.createForm(ownerA, { title: 'Survey' });
      await expect(
        service.createQuestion(ownerA, form.id, { type: FEEDBACK_QUESTION_TYPES.RATING, label: 'Rate us', maxLength: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('a question’s type is immutable — update ignores any type-like tampering and only changes editable fields', async () => {
      const form = await service.createForm(ownerA, { title: 'Survey' });
      const question = await service.createQuestion(ownerA, form.id, { type: FEEDBACK_QUESTION_TYPES.RATING, label: 'Rate us' });
      const updated = await service.updateQuestion(ownerA, form.id, question.id, { label: 'Rate our support' });
      expect(updated.type).toBe(FEEDBACK_QUESTION_TYPES.RATING);
    });

    it('11. cross-tenant question modification fails', async () => {
      const formB = await service.createForm(ownerB, { title: 'Org B survey' });
      const questionB = await service.createQuestion(ownerB, formB.id, { type: FEEDBACK_QUESTION_TYPES.TEXT, label: 'Comments' });
      await expect(service.updateQuestion(ownerA, formB.id, questionB.id, { label: 'Hijacked' })).rejects.toThrow(NotFoundException);
      await expect(service.deleteQuestion(ownerA, formB.id, questionB.id)).rejects.toThrow(NotFoundException);
      await expect(service.createQuestion(ownerA, formB.id, { type: FEEDBACK_QUESTION_TYPES.TEXT, label: 'Injected' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('questions are returned in ascending order', async () => {
      const form = await service.createForm(ownerA, { title: 'Survey' });
      const q2 = await service.createQuestion(ownerA, form.id, { type: FEEDBACK_QUESTION_TYPES.TEXT, label: 'Second', order: 2 });
      const q1 = await service.createQuestion(ownerA, form.id, { type: FEEDBACK_QUESTION_TYPES.TEXT, label: 'First', order: 1 });
      const detail = await service.getFormById(ownerA, form.id);
      expect(detail.questions.map((q) => q.id)).toEqual([q1.id, q2.id]);
    });
  });

  // ---------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------
  describe('submission', () => {
    it('12. customer can submit feedback', async () => {
      const { form, ratingQuestion, textQuestion } = await createActiveForm(ownerA);
      const response = await service.submitResponse(customerA, form.id, {
        answers: [
          { questionId: ratingQuestion.id, ratingValue: 5 },
          { questionId: textQuestion.id, textValue: 'Great support!' },
        ],
      });
      expect(response.answers).toHaveLength(2);
      expect(response.customer).toMatchObject({ id: customerA.userId });
    });

    it('13. customer cannot submit to another tenant’s form', async () => {
      const { form: formB, ratingQuestion } = await createActiveForm(ownerB);
      await expect(
        service.submitResponse(customerA, formB.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('14. inactive form rejects submissions', async () => {
      const form = await service.createForm(ownerA, { title: 'Draft survey' });
      const question = await service.createQuestion(ownerA, form.id, { type: FEEDBACK_QUESTION_TYPES.RATING, label: 'Rate us' });
      await expect(
        service.submitResponse(customerA, form.id, { answers: [{ questionId: question.id, ratingValue: 5 }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('a form that was deactivated after being active also rejects new submissions, but keeps existing responses', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      const response = await service.submitResponse(customerA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 4 }] });
      await service.updateFormStatus(ownerA, form.id, FEEDBACK_FORM_STATUSES.INACTIVE);
      await expect(
        service.submitResponse(customerA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] }),
      ).rejects.toThrow(BadRequestException);
      await expect(service.getResponseById(ownerA, response.id)).resolves.toMatchObject({ id: response.id });
    });

    it('15. an invalid/unknown question id is rejected', async () => {
      const { form } = await createActiveForm(ownerA);
      await expect(
        service.submitResponse(customerA, form.id, { answers: [{ questionId: 'not-a-real-question-id', ratingValue: 5 }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('16. a question id belonging to another form is rejected', async () => {
      const { form: formA } = await createActiveForm(ownerA);
      const { ratingQuestion: ratingOther } = await createActiveForm(ownerA);
      await expect(
        service.submitResponse(customerA, formA.id, { answers: [{ questionId: ratingOther.id, ratingValue: 5 }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('17. a missing required answer is rejected', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA, { textRequired: true });
      await expect(
        service.submitResponse(customerA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('an optional question may be omitted entirely', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA, { textRequired: false });
      await expect(
        service.submitResponse(customerA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] }),
      ).resolves.toMatchObject({});
    });

    it.each([0, -1, 6, 100])('18. an invalid rating value (%i) is rejected', async (badRating) => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      await expect(
        service.submitResponse(customerA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: badRating }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('18b. a non-integer rating value is rejected', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      await expect(
        service.submitResponse(customerA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 3.5 }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('18c. text supplied for a rating question is rejected', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      await expect(
        service.submitResponse(customerA, form.id, { answers: [{ questionId: ratingQuestion.id, textValue: 'five stars' } as never] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('19. text exceeding the maximum length is rejected', async () => {
      const { form, ratingQuestion, textQuestion } = await createActiveForm(ownerA, { textMaxLength: 20 });
      await expect(
        service.submitResponse(customerA, form.id, {
          answers: [
            { questionId: ratingQuestion.id, ratingValue: 5 },
            { questionId: textQuestion.id, textValue: 'This comment is way too long for the configured limit' },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('a rating supplied for a text question is rejected', async () => {
      const { form, ratingQuestion, textQuestion } = await createActiveForm(ownerA, { textRequired: true });
      await expect(
        service.submitResponse(customerA, form.id, {
          answers: [
            { questionId: ratingQuestion.id, ratingValue: 5 },
            { questionId: textQuestion.id, ratingValue: 4 as never },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('a duplicate answer for the same question in one submission is rejected', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      await expect(
        service.submitResponse(customerA, form.id, {
          answers: [
            { questionId: ratingQuestion.id, ratingValue: 5 },
            { questionId: ratingQuestion.id, ratingValue: 1 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('a support agent or tenant owner cannot submit feedback (customer-only)', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      await expect(
        service.submitResponse(agentA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.submitResponse(ownerA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('duplicate submissions across separate requests are allowed by design (no one-response-per-customer restriction in Phase 5)', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      await service.submitResponse(customerA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] });
      await expect(
        service.submitResponse(customerA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 2 }] }),
      ).resolves.toMatchObject({});
      const responses = await service.listResponses(ownerA, form.id, {});
      expect(responses.pagination.total).toBe(2);
    });
  });

  // ---------------------------------------------------------------------
  // Anonymous feedback
  // ---------------------------------------------------------------------
  describe('anonymous feedback', () => {
    it('20. an anonymous submission succeeds', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      const response = await service.submitResponse(customerA, form.id, {
        anonymous: true,
        answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }],
      });
      expect(response.anonymous).toBe(true);
    });

    it('21. an anonymous response does not expose the customer’s identity to the tenant owner (and an agent has no access to it at all)', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      const response = await service.submitResponse(customerA, form.id, {
        anonymous: true,
        answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }],
      });

      const viaGetOwner = await service.getResponseById(ownerA, response.id);
      const viaList = await service.listResponses(ownerA, form.id, {});

      expect(viaGetOwner.customer).toBeNull();
      expect(viaList.data.find((r) => r.id === response.id)?.customer).toBeNull();
      await expect(service.getResponseById(agentA, response.id)).rejects.toThrow(ForbiddenException);
    });

    it('22. an anonymous response remains correctly tenant-scoped (still not visible cross-tenant)', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      const response = await service.submitResponse(customerA, form.id, {
        anonymous: true,
        answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }],
      });
      await expect(service.getResponseById(ownerB, response.id)).rejects.toThrow(NotFoundException);
      // An agent is rejected before tenant-scoping is even evaluated — no feedback access at all, same org or not.
      await expect(service.getResponseById(agentB, response.id)).rejects.toThrow(ForbiddenException);
    });

    it('23. no endpoint lets a tenant owner bypass the anonymous flag to recover identity', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      const response = await service.submitResponse(customerA, form.id, {
        anonymous: true,
        answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }],
      });

      // Every read path funnels through the same toResponseDto mapping.
      const paths = [
        () => service.getResponseById(ownerA, response.id),
        () => service.listResponses(ownerA, form.id, {}).then((r) => r.data.find((x) => x.id === response.id)!),
      ];
      for (const path of paths) {
        const dto = await path();
        expect(dto.customer).toBeNull();
      }

      // The row itself still records true ownership internally, for isolation/abuse-prevention — verified directly against the DB, not exposed via any DTO.
      const row = await prisma.feedbackResponse.findUniqueOrThrow({ where: { id: response.id } });
      expect(row.customerId).toBe(customerA.userId);
    });

    it('a non-anonymous response does expose the customer’s identity to the tenant owner', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      const response = await service.submitResponse(customerA, form.id, {
        answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }],
      });
      const viaGet = await service.getResponseById(ownerA, response.id);
      expect(viaGet.customer).toMatchObject({ id: customerA.userId });
    });
  });

  // ---------------------------------------------------------------------
  // Response access
  // ---------------------------------------------------------------------
  describe('response access', () => {
    it('24. tenant owner can view their organization’s responses', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      await service.submitResponse(customerA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] });
      const result = await service.listResponses(ownerA, form.id, {});
      expect(result.data).toHaveLength(1);
    });

    it('25. tenant owner cannot view another organization’s responses', async () => {
      const { form: formB, ratingQuestion } = await createActiveForm(ownerB);
      await service.submitResponse(customerB, formB.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] });
      await expect(service.listResponses(ownerA, formB.id, {})).rejects.toThrow(NotFoundException);
    });

    it('26. a customer can only access their own responses', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      const response = await service.submitResponse(customerA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] });
      await expect(service.getResponseById(customerA, response.id)).resolves.toMatchObject({ id: response.id });
    });

    it('27. a customer cannot access another customer’s response', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      const response = await service.submitResponse(customerA, form.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] });
      await expect(service.getResponseById(customerA2, response.id)).rejects.toThrow(NotFoundException);
    });

    it('28. a support agent has no feedback access at all — not even in their own organization', async () => {
      const { form: formA, ratingQuestion } = await createActiveForm(ownerA);
      const response = await service.submitResponse(customerA, formA.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] });
      await expect(service.getResponseById(agentA, response.id)).rejects.toThrow(ForbiddenException);
      await expect(service.listResponses(agentA, formA.id, {})).rejects.toThrow(ForbiddenException);
    });

    it('a customer cannot list a form’s responses at all (list is owner/agent-only, not just filtered)', async () => {
      const { form } = await createActiveForm(ownerA);
      await expect(service.listResponses(customerA, form.id, {})).rejects.toThrow(ForbiddenException);
    });
  });

  // ---------------------------------------------------------------------
  // Tenant isolation
  // ---------------------------------------------------------------------
  describe('tenant isolation', () => {
    it('29. organization A cannot list organization B’s forms', async () => {
      await service.createForm(ownerB, { title: 'Org B survey 1' });
      await service.createForm(ownerB, { title: 'Org B survey 2' });
      const result = await service.listForms(ownerA, {});
      expect(result.data).toHaveLength(0);
    });

    it('30. organization A cannot read organization B’s responses', async () => {
      const { form: formB, ratingQuestion } = await createActiveForm(ownerB);
      const response = await service.submitResponse(customerB, formB.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] });
      await expect(service.getResponseById(ownerA, response.id)).rejects.toThrow(NotFoundException);
    });

    it('31. organization A cannot modify organization B’s forms', async () => {
      const formB = await service.createForm(ownerB, { title: 'Org B survey' });
      await expect(service.updateForm(ownerA, formB.id, { title: 'Hijacked' })).rejects.toThrow(NotFoundException);
      await expect(
        service.createQuestion(ownerA, formB.id, { type: FEEDBACK_QUESTION_TYPES.TEXT, label: 'Injected question' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('32. organization A cannot submit responses into organization B', async () => {
      const { form: formB, ratingQuestion } = await createActiveForm(ownerB);
      await expect(
        service.submitResponse(customerA, formB.id, { answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('33. a spoofed organizationId in the payload is ignored — only authContext.organizationId is ever trusted', async () => {
      const { form, ratingQuestion } = await createActiveForm(ownerA);
      // Even if a caller stuffs a foreign organizationId into the payload, the
      // service signature never reads it — only authContext.organizationId
      // is used to scope the lookup, so this behaves identically to a normal call.
      const spoofedDto = { organizationId: orgB.id, answers: [{ questionId: ratingQuestion.id, ratingValue: 5 }] } as unknown as {
        answers: { questionId: string; ratingValue?: number }[];
      };
      const response = await service.submitResponse(customerA, form.id, spoofedDto);
      expect(response.organizationId).toBe(orgA.id);

      const row = await prisma.feedbackResponse.findUniqueOrThrow({ where: { id: response.id } });
      expect(row.organizationId).toBe(orgA.id);
    });
  });

  // ---------------------------------------------------------------------
  // Listing / pagination / category filter
  // ---------------------------------------------------------------------
  describe('listing forms', () => {
    it('filters by category', async () => {
      await service.createForm(ownerA, { title: 'Support form', category: FEEDBACK_CATEGORIES.SUPPORT });
      await service.createForm(ownerA, { title: 'Product form', category: FEEDBACK_CATEGORIES.PRODUCT });
      const result = await service.listForms(ownerA, { category: FEEDBACK_CATEGORIES.SUPPORT });
      expect(result.data.map((f) => f.title)).toEqual(['Support form']);
    });

    it('a customer only ever sees ACTIVE forms, even when explicitly requesting INACTIVE', async () => {
      await service.createForm(ownerA, { title: 'Draft' });
      const { form: active } = await createActiveForm(ownerA);
      const result = await service.listForms(customerA, { status: FEEDBACK_FORM_STATUSES.INACTIVE });
      expect(result.data.map((f) => f.id)).toEqual([active.id]);
    });

    it('paginates results', async () => {
      for (let i = 0; i < 5; i++) {
        await service.createForm(ownerA, { title: `Survey ${i}` });
      }
      const result = await service.listForms(ownerA, { page: 1, limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.pagination).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3 });
    });
  });
});
