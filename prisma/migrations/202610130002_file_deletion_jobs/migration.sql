CREATE TABLE "FileDeletionJob" (
  "id" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FileDeletionJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FileDeletionJob_storagePath_key" ON "FileDeletionJob"("storagePath");
CREATE INDEX "FileDeletionJob_nextAttemptAt_idx" ON "FileDeletionJob"("nextAttemptAt");
