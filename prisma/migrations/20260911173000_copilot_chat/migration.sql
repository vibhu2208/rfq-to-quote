-- CreateTable
CREATE TABLE "CopilotChat" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopilotChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopilotChat_userId_updatedAt_idx" ON "CopilotChat"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "CopilotChat_updatedAt_idx" ON "CopilotChat"("updatedAt");

-- CreateIndex
CREATE INDEX "CopilotChatMessage_chatId_createdAt_idx" ON "CopilotChatMessage"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "CopilotChat" ADD CONSTRAINT "CopilotChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotChatMessage" ADD CONSTRAINT "CopilotChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "CopilotChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
