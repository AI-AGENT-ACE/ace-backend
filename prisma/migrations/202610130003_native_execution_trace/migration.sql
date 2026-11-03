CREATE TABLE "NativeExecution" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
 "toolName" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'REQUESTED',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "NativeExecution_userId_requestId_idx" ON "NativeExecution"("userId", "requestId");
CREATE TABLE "NativeExecutionEvent" (
 "id" TEXT PRIMARY KEY, "executionId" TEXT NOT NULL, "attemptId" TEXT NOT NULL,
 "previousAttemptId" TEXT, "state" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "NativeExecutionEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "NativeExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NativeExecutionEvent_executionId_attemptId_state_key" ON "NativeExecutionEvent"("executionId", "attemptId", "state");
ALTER TABLE "ToolExecutionLog" ADD COLUMN "requestId" TEXT, ADD COLUMN "attemptId" TEXT;
