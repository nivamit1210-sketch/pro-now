-- docs/10 §Life after approval: explicit "no expiry", and each expiry notice stored once.
ALTER TABLE "professional_credentials" ADD COLUMN "noExpiry" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "credential_notices" (
  "id" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credential_notices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "credential_notices_credentialId_kind_key" ON "credential_notices"("credentialId", "kind");
