-- docs/10 §Review loop: a reviewer asks for fixes item by item, sent as one round.
ALTER TYPE "VerificationStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED' AFTER 'SERVICE_REVIEW';

CREATE TABLE "review_rounds" (
  "id" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sentAt" TIMESTAMP(3),
  "answeredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_rounds_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "review_rounds_professionalId_createdAt_idx" ON "review_rounds"("professionalId", "createdAt");
-- At most one draft round per professional.
CREATE UNIQUE INDEX "review_rounds_one_draft" ON "review_rounds"("professionalId") WHERE "status" = 'DRAFT';
ALTER TABLE "review_rounds" ADD CONSTRAINT "review_rounds_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professional_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "fix_requests" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "reasonHe" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "fixedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fix_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fix_requests_roundId_itemKey_key" ON "fix_requests"("roundId", "itemKey");
CREATE INDEX "fix_requests_professionalId_status_idx" ON "fix_requests"("professionalId", "status");
ALTER TABLE "fix_requests" ADD CONSTRAINT "fix_requests_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "review_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
