-- The service as the customer picked it in the catalogue (audit v2 #1). Additive: older jobs keep null.
ALTER TABLE "jobs"
  ADD COLUMN "catalogServiceId" TEXT,
  ADD COLUMN "catalogServiceNameHe" TEXT;
