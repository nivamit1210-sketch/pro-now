-- Audit v2 #8b: a safety report from the door ("משהו לא נראה לי תקין") is a
-- support ticket of kind SAFETY. Additive only: new nullable columns, one
-- with a default, and two indexes for the admin queue.
-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "handledAt" TIMESTAMP(3),
ADD COLUMN     "handledById" TEXT,
ADD COLUMN     "jobStatus" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'SUPPORT',
ADD COLUMN     "noteHe" TEXT,
ADD COLUMN     "professionalId" TEXT,
ADD COLUMN     "reason" TEXT;

-- CreateIndex
CREATE INDEX "support_tickets_kind_status_createdAt_idx" ON "support_tickets"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_jobId_idx" ON "support_tickets"("jobId");

