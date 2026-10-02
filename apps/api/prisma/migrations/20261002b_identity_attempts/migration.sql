-- One row per identity attempt (docs/10 §Identity check in the app).
DROP INDEX IF EXISTS "identity_verifications_professionalId_key";
ALTER TABLE "identity_verifications"
  ADD COLUMN "method" TEXT,
  ADD COLUMN "verificationId" TEXT,
  ADD COLUMN "uploadIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "photosDeletedAt" TIMESTAMP(3),
  ADD COLUMN "decidedById" TEXT,
  ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "decisionReason" TEXT;
CREATE INDEX "identity_verifications_professionalId_createdAt_idx" ON "identity_verifications"("professionalId", "createdAt");
ALTER TABLE "professional_profiles" ADD COLUMN "dateOfBirth" DATE;
