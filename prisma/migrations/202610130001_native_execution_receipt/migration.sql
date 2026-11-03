-- Nullable for historical records. A signed call ID is consumed once, even across restarts.
ALTER TABLE "ToolExecutionLog" ADD COLUMN "executionId" TEXT;
CREATE UNIQUE INDEX "ToolExecutionLog_executionId_key" ON "ToolExecutionLog"("executionId");
