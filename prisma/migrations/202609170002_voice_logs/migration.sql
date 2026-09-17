-- Voice logs contain only allowlisted execution metadata, never audio, transcript or arguments.
CREATE TYPE "VoiceCommandStatus" AS ENUM ('SUCCESS', 'FAILED', 'CANCELLED');

CREATE TABLE "VoiceCommandExecutionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "commandType" TEXT NOT NULL,
    "status" "VoiceCommandStatus" NOT NULL,
    "duration" INTEGER NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceCommandExecutionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoiceCommandExecutionLog_userId_createdAt_id_idx" ON "VoiceCommandExecutionLog"("userId", "createdAt", "id");
CREATE INDEX "VoiceCommandExecutionLog_commandType_createdAt_idx" ON "VoiceCommandExecutionLog"("commandType", "createdAt");
ALTER TABLE "VoiceCommandExecutionLog" ADD CONSTRAINT "VoiceCommandExecutionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
