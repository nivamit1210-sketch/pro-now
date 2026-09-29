-- CreateTable
CREATE TABLE "match_feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "text" TEXT NOT NULL,
    "suggestedServiceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "chosenServiceId" TEXT,
    "confidence" TEXT NOT NULL,
    "classifier" TEXT NOT NULL,
    "proFlaggedWrong" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_feedback_createdAt_idx" ON "match_feedback"("createdAt");

-- CreateIndex
CREATE INDEX "match_feedback_userId_idx" ON "match_feedback"("userId");

-- AddForeignKey
ALTER TABLE "match_feedback" ADD CONSTRAINT "match_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

