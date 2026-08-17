-- CreateTable
CREATE TABLE "plan_limits" (
    "plan" "PlanType" NOT NULL,
    "teamMembers" INTEGER,
    "monthlyTickets" INTEGER,
    "feedbackForms" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("plan")
);

-- Seed with the values PLAN_LIMITS previously hardcoded (packages/shared/src/constants/subscription.ts).
INSERT INTO "plan_limits" ("plan", "teamMembers", "monthlyTickets", "feedbackForms", "updatedAt") VALUES
    ('FREE', 2, 50, 0, CURRENT_TIMESTAMP),
    ('STARTER', 10, 500, 5, CURRENT_TIMESTAMP),
    ('PRO', NULL, NULL, NULL, CURRENT_TIMESTAMP);
