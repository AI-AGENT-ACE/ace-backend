CREATE TABLE "AiConversation" (
    "conversationId" TEXT NOT NULL,
    "serverUrl" TEXT NOT NULL,
    "remoteId" TEXT NOT NULL,
    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("conversationId", "serverUrl"),
    CONSTRAINT "AiConversation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
