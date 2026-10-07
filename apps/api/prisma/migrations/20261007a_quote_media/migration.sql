-- Ordered for someone else (docs/18 2026-10-01; no money in the app, D1):
-- the quote carries what the professional found, a photo of the fault and
-- an optional voice note, so the person who ordered can decide from afar.
ALTER TABLE "job_media" ADD COLUMN "quoteId" TEXT;
ALTER TABLE "job_media" ADD CONSTRAINT "job_media_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "job_media_quoteId_idx" ON "job_media"("quoteId");
