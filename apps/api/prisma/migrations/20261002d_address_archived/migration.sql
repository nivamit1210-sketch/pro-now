-- A saved address taken off the customer's list while a job still points at it (audit v2 #4). Additive: every row stays listed.
ALTER TABLE "addresses" ADD COLUMN "archivedAt" TIMESTAMP(3);
